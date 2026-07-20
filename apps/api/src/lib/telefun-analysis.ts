import { createAdminClient } from "./supabase";
import { generateGeminiContent } from "./gemini";
import {
  parseVoiceQualityAssessment,
  TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA,
} from "@trainers/types";
import type { VoiceQualityAssessment } from "@trainers/types";
import { getTelefunLiveModel } from "@trainers/types";
import { parseJsonFromModelText } from "./ai-json";
import {
  normalizeTelefunHoldMetrics,
  evaluateTelefunHoldAssessment,
  applyHoldAssessmentToOverallScore,
} from "./telefun-hold-assessment";
import { requestOpenAITelefunAssessment } from "./telefun-openai-assessment";

export type { VoiceQualityAssessment };

export async function analyzeVoiceQuality(
  sessionId: string,
  userId: string,
): Promise<{
  success: boolean;
  assessment?: VoiceQualityAssessment;
  error?: string;
}> {
  const adminClient = createAdminClient();

  // 1. Fetch paths and session_metrics
  const { data: row, error: fetchError } = await adminClient
    .from("telefun_history")
    .select(
      "id, user_id, scenario_title, agent_recording_path, voice_assessment, session_metrics, telefun_model_id",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError || !row) return { success: false, error: "Session not found" };
  if (row.user_id !== userId) return { success: false, error: "Unauthorized" };

  // Compute hold assessment from session_metrics (shared by both providers)
  const sessionMetrics =
    row.session_metrics &&
    typeof row.session_metrics === "object" &&
    !Array.isArray(row.session_metrics)
      ? (row.session_metrics as Record<string, unknown>)
      : null;
  const holdMetrics = normalizeTelefunHoldMetrics(sessionMetrics?.hold);
  const holdAssessment = evaluateTelefunHoldAssessment(holdMetrics);

  // 2. Return cached if exists and valid
  const parsedCached = parseVoiceQualityAssessment(row.voice_assessment);
  if (parsedCached) {
    let assessment = parsedCached;

    const rawHasHold =
      row.voice_assessment &&
      typeof row.voice_assessment === "object" &&
      !Array.isArray(row.voice_assessment) &&
      "holdManagement" in row.voice_assessment;

    if (!rawHasHold) {
      const synchronizedAssessment = parseVoiceQualityAssessment({
        ...parsedCached,
        holdManagement: holdAssessment,
        overallScore: applyHoldAssessmentToOverallScore(
          parsedCached.overallScore,
          holdAssessment,
        ),
      });
      if (!synchronizedAssessment) {
        return {
          success: false,
          error: "Format hasil analisis tidak valid.",
        };
      }
      assessment = synchronizedAssessment;

      const { error: updateError } = await adminClient
        .from("telefun_history")
        .update({
          voice_assessment: assessment,
          score: assessment.overallScore,
        })
        .eq("id", sessionId);
      if (updateError) {
        console.error(
          "[Telefun] Failed to synchronize cached assessment:",
          updateError,
        );
        return {
          success: false,
          error: "Gagal menyimpan hasil penilaian suara.",
        };
      }
    }
    return {
      success: true,
      assessment,
    };
  }

  // Provider-matched routing happens only after the shared cache boundary, so
  // a completed assessment never opens another provider connection.
  const liveModel = getTelefunLiveModel(row.telefun_model_id);
  if (liveModel?.provider === "openai") {
    const assessment = await requestOpenAITelefunAssessment({
      sessionId,
      userId,
      modelId: row.telefun_model_id,
    });
    const synchronizedAssessment = parseVoiceQualityAssessment({
      ...assessment,
      holdManagement: holdAssessment,
      overallScore: applyHoldAssessmentToOverallScore(
        assessment.overallScore,
        holdAssessment,
      ),
    });
    if (!synchronizedAssessment) {
      return { success: false, error: "Format hasil analisis tidak valid." };
    }

    const { error: updateError } = await adminClient
      .from("telefun_history")
      .update({
        voice_assessment: synchronizedAssessment,
        score: synchronizedAssessment.overallScore,
        scoring_status: "completed",
        scoring_completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (updateError) {
      console.error("[Telefun] Failed to save OpenAI assessment:", updateError);
      return {
        success: false,
        error: "Gagal menyimpan hasil penilaian suara.",
      };
    }
    return { success: true, assessment: synchronizedAssessment };
  }

  const agentPath = row.agent_recording_path;
  if (!agentPath) {
    return { success: false, error: "No agent audio available for assessment" };
  }

  // 3. Get audio from storage
  const { data: audioData, error: downloadError } = await adminClient.storage
    .from("telefun-recordings")
    .download(agentPath);

  if (downloadError || !audioData) {
    return {
      success: false,
      error: "Failed to download audio: " + downloadError?.message,
    };
  }

  const base64Audio = Buffer.from(await audioData.arrayBuffer()).toString(
    "base64",
  );

  // 4. Call Gemini
  const prompt = `
    Lakukan analisis pada kualitas suara agen dalam simulasi telemarketing/customer service berikut.
    Skenario: ${row.scenario_title}
    
    Evaluasi berdasarkan:
    1. Kecepatan Bicara (Speaking Rate): Idealnya 130-150 WPM.
    2. Intonasi: Variasi nada, antusiasme vs monoton.
    3. Artikulasi: Kejelasan kata, bergumam vs pengucapan jelas.
    4. Kata Pengisi (Filler Words): "hm", "anu", "gitu", "eeeh", dll.
    5. Nada Emosional (Emotional Tone): Empati, kesabaran, rasa percaya diri.
    
    Berikan transkrip lengkap dan poin-poin penting (highlights).
    ATURAN WAJIB:
    1. SEMUA teks, ulasan (verdict), umpan balik (feedback), poin penting, dan kelebihan WAJIB MENGGUNAKAN BAHASA INDONESIA. Jangan gunakan bahasa Inggris.
    2. Sifat ulasan harus KRITIS dengan rasio 50% kritik konstruktif dan 50% apresiasi. Beritahu agen secara tegas apa saja yang masih kurang dan bagaimana cara memperbaikinya.
    3. Semua field score aspek HARUS berada di kisaran 0-10 dan merepresentasikan kualitas, bukan raw metric.
    4. wordsPerMinute HARUS berisi angka WPM mentah saja (kisaran normal 100-180). Jangan jadikan WPM sebagai score.
    5. fillerWords.count HARUS berisi jumlah kata pengisi mentah saja (misal: 0, 3, 15). Jangan jadikan count sebagai score.
    6. Jangan mengarang target radar. Target QA dihitung sistem.
  `;

  const response = await generateGeminiContent({
    model: "gemini-3.5-flash",
    systemInstruction:
      "Anda adalah pelatih vokal profesional dan analis wicara yang tegas dan objektif. Semua balasan WAJIB sepenuhnya dalam Bahasa Indonesia.",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "audio/webm", data: base64Audio } },
        ],
      },
    ],
    responseMimeType: "application/json",
    responseSchema: TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA as any,
    usageContext: { module: "telefun", action: "voice_assessment" },
    userId,
  });

  if (response.success && response.text) {
    try {
      const rawJson = parseJsonFromModelText(response.text);
      const parsed = parseVoiceQualityAssessment(rawJson);

      if (!parsed) {
        throw new Error("Invalid assessment shape from AI");
      }

      const assessment = parseVoiceQualityAssessment({
        ...parsed,
        holdManagement: holdAssessment,
        overallScore: applyHoldAssessmentToOverallScore(
          parsed.overallScore,
          holdAssessment,
        ),
      });
      if (!assessment) {
        throw new Error("Invalid assessment after hold normalization");
      }

      // Save to DB with lifecycle status
      const { error: updateError } = await adminClient
        .from("telefun_history")
        .update({
          voice_assessment: assessment,
          score: assessment.overallScore,
          scoring_status: "completed",
          scoring_completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      if (updateError) {
        console.error("[Telefun] Failed to save assessment:", updateError);
        return {
          success: false,
          error: "Gagal menyimpan hasil penilaian suara.",
        };
      }

      return { success: true, assessment };
    } catch (err) {
      console.error("[Telefun] Parse error for assessment:", err);
      // Mark scoring as failed
      await adminClient
        .from("telefun_history")
        .update({
          scoring_status: "failed",
          scoring_last_error:
            err instanceof Error ? err.message : "Parse error",
        })
        .eq("id", sessionId)
        .in("scoring_status", ["processing", "pending"]);
      return { success: false, error: "Format hasil analisis tidak valid." };
    }
  }

  // Mark scoring as failed when Gemini call fails
  await adminClient
    .from("telefun_history")
    .update({
      scoring_status: "failed",
      scoring_last_error: response.error || "Gemini assessment failed",
    })
    .eq("id", sessionId)
    .in("scoring_status", ["processing", "pending"]);

  return {
    success: false,
    error: response.error || "Gemini assessment failed",
  };
}

export async function generateCoachingSummary(
  sessionId: string,
  userId: string,
): Promise<{
  success: boolean;
  summary?: any;
  error?: string;
}> {
  const adminClient = createAdminClient();

  // 1. Fetch session and existing assessment/messages
  const { data: row, error: fetchError } = await adminClient
    .from("telefun_history")
    .select("id, user_id, scenario_title, messages, voice_assessment")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError || !row) return { success: false, error: "Session not found" };
  if (row.user_id !== userId) return { success: false, error: "Unauthorized" };

  const prompt = `
    Berdasarkan simulasi Telefun berikut:
    Skenario: ${row.scenario_title}
    
    Data Voice Assessment:
    ${JSON.stringify(row.voice_assessment || {}, null, 2)}
    
    Berikan maksimal 5 rekomendasi coaching yang spesifik dan actionable untuk agen ini.
    Gunakan format JSON array of objects dengan keys "text" dan "priority" (1-5, 5 tertinggi).
    Contoh: [{"text": "Perbaiki artikulasi pada kata-kata teknis.", "priority": 5}]
    
    SEMUA TEKS WAJIB DALAM BAHASA INDONESIA.
  `;

  const response = await generateGeminiContent({
    model: "gemini-3.1-flash-lite",
    systemInstruction:
      "Anda adalah pelatih customer service senior. Berikan feedback yang tajam dan membangun dalam Bahasa Indonesia.",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    responseMimeType: "application/json",
    responseSchema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          priority: { type: "number" },
        },
        required: ["text", "priority"],
      },
    },
    usageContext: { module: "telefun", action: "coaching_summary" },
    userId,
  });

  if (response.success && response.text) {
    try {
      const recommendations = parseJsonFromModelText(response.text);

      // Upsert via RPC
      const { error: rpcError } = await adminClient.rpc(
        "upsert_telefun_coaching_summary",
        {
          p_session_id: sessionId,
          p_recommendations: recommendations,
        },
      );

      if (rpcError) throw rpcError;
      return { success: true, summary: { recommendations } };
    } catch (err) {
      console.error("[Telefun] Error generating summary:", err);
      return { success: false, error: "Gagal membuat ringkasan coaching." };
    }
  }

  return { success: false, error: response.error || "Gemini summary failed" };
}
