import { createAdminClient } from "./supabase";
import { generateGeminiContent } from "./gemini";
import type { VoiceQualityAssessment } from "@trainers/types";
import { enrichAssessmentWithCommunicationProfile } from "./telefun-communication-profile";
import { parseJsonFromModelText } from "./ai-json";

export type { VoiceQualityAssessment };

const VOICE_ASSESSMENT_SCHEMA = {
  type: "object",
  properties: {
    overallScore: { type: "number" },
    speakingRate: {
      type: "object",
      properties: {
        score: { type: "number" },
        wordsPerMinute: { type: "number" },
        verdict: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["score", "wordsPerMinute", "verdict", "feedback"],
    },
    intonation: {
      type: "object",
      properties: {
        score: { type: "number" },
        verdict: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["score", "verdict", "feedback"],
    },
    articulation: {
      type: "object",
      properties: {
        score: { type: "number" },
        verdict: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["score", "verdict", "feedback"],
    },
    fillerWords: {
      type: "object",
      properties: {
        score: { type: "number" },
        count: { type: "number" },
        examples: { type: "array", items: { type: "string" } },
        verdict: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["score", "count", "examples", "verdict", "feedback"],
    },
    emotionalTone: {
      type: "object",
      properties: {
        score: { type: "number" },
        dominant: { type: "string" },
        verdict: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["score", "dominant", "verdict", "feedback"],
    },
    transcript: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    communicationProfile: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                enum: ["speakingRate", "intonation", "articulation", "fillers", "tone"],
              },
              label: { type: "string" },
              value: { type: "number" },
              benchmarkValue: { type: "number" },
              evaluationMode: {
                type: "string",
                enum: ["higher_better", "lower_better", "optimal_range"],
              },
              idealMin: { type: "number" },
              idealMax: { type: "number" },
              goodMin: { type: "number" },
              goodMax: { type: "number" },
              status: {
                type: "string",
                enum: ["good", "needs_improvement", "poor"],
              },
              explanation: { type: "string" },
              improvementTip: { type: "string" },
            },
            required: [
              "key",
              "label",
              "value",
              "benchmarkValue",
              "evaluationMode",
              "status",
              "explanation",
            ],
          },
        },
        overallSummary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        improvementPriorities: { type: "array", items: { type: "string" } },
      },
      required: ["metrics", "overallSummary", "strengths", "improvementPriorities"],
    },
  },
  required: [
    "overallScore",
    "speakingRate",
    "intonation",
    "articulation",
    "fillerWords",
    "emotionalTone",
    "transcript",
    "highlights",
    "strengths",
  ],
};

export async function analyzeVoiceQuality(
  sessionId: string,
  userId: string,
): Promise<{
  success: boolean;
  assessment?: VoiceQualityAssessment;
  error?: string;
}> {
  const adminClient = createAdminClient();

  // 1. Fetch paths
  const { data: row, error: fetchError } = await adminClient
    .from("telefun_history")
    .select(
      "id, user_id, scenario_title, agent_recording_path, voice_assessment",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError || !row) return { success: false, error: "Session not found" };
  if (row.user_id !== userId) return { success: false, error: "Unauthorized" };

  // 2. Return cached if exists and valid
  if (row.voice_assessment && typeof row.voice_assessment === "object") {
    const cached = row.voice_assessment as VoiceQualityAssessment;
    return {
      success: true,
      assessment: enrichAssessmentWithCommunicationProfile(cached),
    };
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
    3. Semua field nilai (overallScore dan setiap skor aspek) HARUS berada di kisaran 0-10.
    4. Nilai 0 berarti sangat buruk, 10 berarti sangat luar biasa. Jangan ragu untuk memberi skor sedang/rendah jika memang banyak ruang untuk perbaikan.
  `;

  const response = await generateGeminiContent({
    model: "gemini-3.1-flash-lite",
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
    responseSchema: VOICE_ASSESSMENT_SCHEMA as any,
    usageContext: { module: "telefun", action: "voice_assessment" },
    userId,
  });

  if (response.success && response.text) {
    try {
      const parsed = parseJsonFromModelText(response.text) as VoiceQualityAssessment;
      const assessment = enrichAssessmentWithCommunicationProfile(parsed);

      // Save to DB
      await adminClient
        .from("telefun_history")
        .update({
          voice_assessment: assessment,
          score: assessment.overallScore,
        })
        .eq("id", sessionId);

      return { success: true, assessment };
    } catch (err) {
      console.error("[Telefun] Parse error for assessment:", err);
      return { success: false, error: "Format hasil analisis tidak valid." };
    }
  }

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
