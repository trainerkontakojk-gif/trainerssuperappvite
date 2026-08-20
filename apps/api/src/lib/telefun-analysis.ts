import { createAdminClient } from "./supabase";
import { generateGeminiContent } from "./gemini";
import {
  parseVoiceQualityAssessment,
  TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA,
} from "@trainers/types";
import type { VoiceQualityAssessment } from "@trainers/types";
import { isRetiredTelefunOpenAiRealtimeSelection } from "@trainers/types";
import { parseJsonFromModelText } from "./ai-json";
import {
  normalizeTelefunHoldMetrics,
  evaluateTelefunHoldAssessment,
  applyHoldAssessmentToOverallScore,
} from "./telefun-hold-assessment";
import {
  TELEFUN_OPENAI_SCORING_DISABLED_REASON,
} from "./telefun-openai-assessment";

export type { VoiceQualityAssessment };

function isTelefunAssessmentDetailed(assessment: VoiceQualityAssessment): boolean {
  const feedbacks = [
    assessment.speakingRate?.feedback,
    assessment.intonation?.feedback,
    assessment.articulation?.feedback,
    assessment.fillerWords?.feedback,
    assessment.emotionalTone?.feedback,
  ];
  if (feedbacks.some((f) => !f || f.trim().length < 35)) return false;
  const verdicts = [
    assessment.speakingRate?.verdict,
    assessment.intonation?.verdict,
    assessment.articulation?.verdict,
    assessment.fillerWords?.verdict,
    assessment.emotionalTone?.verdict,
  ];
  if (verdicts.some((v) => !v || v.trim().length < 10)) return false;
  if (!assessment.transcript || assessment.transcript.trim().length < 20) return false;
  if (!assessment.highlights || assessment.highlights.length < 3) return false;
  if (assessment.highlights.some((h) => !h || h.trim().length < 12)) return false;
  if (!assessment.strengths || assessment.strengths.length < 3) return false;
  if (assessment.strengths.some((s) => !s || s.trim().length < 10)) return false;
  return true;
}

export function isTelefunWebRtcSeekableAgentPath(params: {
  path: unknown;
  userId: string;
  sessionId: string;
}): boolean {
  return (
    typeof params.path === "string" &&
    params.path === `${params.userId}/${params.sessionId}/agent_only.seekable.webm`
  );
}

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
      "id, user_id, status, scenario_title, agent_recording_path, voice_assessment, session_metrics, telefun_model_id, telefun_transport, scoring_ready_at",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError || !row) return { success: false, error: "Session not found" };
  if (row.user_id !== userId) return { success: false, error: "Unauthorized" };
  const isWebRtc = row.telefun_transport === "openai-webrtc";

  // Compute hold assessment from session_metrics (shared by both providers)
  const sessionMetrics =
    row.session_metrics &&
    typeof row.session_metrics === "object" &&
    !Array.isArray(row.session_metrics)
      ? (row.session_metrics as Record<string, unknown>)
      : null;
  const holdMetrics = normalizeTelefunHoldMetrics(sessionMetrics?.hold);
  const holdAssessment = evaluateTelefunHoldAssessment(holdMetrics);

  // 2. Return cached if exists, valid, and LENGKAP sesuai 5 indikator (tidak singkat)
  const parsedCached = parseVoiceQualityAssessment(row.voice_assessment);
  if (parsedCached && isTelefunAssessmentDetailed(parsedCached)) {
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
  if (parsedCached && !isTelefunAssessmentDetailed(parsedCached)) {
    console.warn(
      "[Telefun] Cached assessment incomplete/too short — re-analyzing per indikator lengkap",
      { sessionId },
    );
  }

  if (
    isRetiredTelefunOpenAiRealtimeSelection({
      modelId: row.telefun_model_id,
      transport: row.telefun_transport,
    })
  ) {
    return { success: false, error: TELEFUN_OPENAI_SCORING_DISABLED_REASON };
  }

  if (
    isWebRtc &&
    (row.status !== "completed" ||
      !row.scoring_ready_at ||
      !isTelefunWebRtcSeekableAgentPath({
        path: row.agent_recording_path,
        userId,
        sessionId,
      }))
  ) {
    return { success: false, error: "Scoring not ready" };
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

  // 4. Call Gemini — penilaian lengkap sesuai 5 indikator wajib, tidak boleh singkat
  const prompt = `
    TUGAS: Analisis REKAMAN AUDIO AGEN saja (abaikan suara konsumen/AI) untuk simulasi telemarketing/customer service OJK 157.
    Skenario: ${row.scenario_title}

    Anda HARUS menilai 5 INDIKATOR WAJIB di bawah secara LENGKAP dan DETAIL. Jangan singkat, jangan generik. Setiap verdict dan feedback harus spesifik, mengutip perilaku aktual dari rekaman, menjelaskan dampak ke konsumen, dan memberi 1 saran actionable.

    INDIKATOR & RUBRIK PENILAIAN (skor kualitas 0-10 untuk setiap indikator):
    1. KECEPATAN BICARA (Speaking Rate)
       - wordsPerMinute = ANGKA MENTAH hasil hitung (jumlah kata di transcript / durasi menit), kisaran normal 100-180. JANGAN isi dengan skor.
       - score = kualitas: 9-10 = ideal 130-150 WPM sangat nyaman; 7-8 = sedikit di luar ideal (120-129 atau 151-165) masih jelas; 4-6 = terlalu lambat (<120) atau terlalu cepat (>165) mengganggu pemahaman; 0-3 = sangat lambat/cepat tidak profesional.
       - Feedback WAJIB: sebutkan WPM aktual, bandingkan dengan ideal 130-150, jelaskan dampak ke kenyamanan konsumen, dan beri 1 tips tempo/jeda.
    2. INTONASI
       - Variasi nada, antusiasme, penekanan kata kunci, hindari datar/monoton.
       - Skor: 0-3 = datar/monoton sepanjang sesi; 4-6 = variasi minimal, kadang hidup; 7-8 = variasi baik cukup ekspresif; 9-10 = sangat hidup, antusias, penekanan tepat.
       - Feedback WAJIB: apakah datar/variatif, contoh frasa dengan nada tertentu, dampak ke kesan profesional, dan 1 tips variasi nada.
    3. ARTIKULASI
       - Kejelasan vokal/konsonan, pengucapan istilah, bergumam vs jelas.
       - Skor: 0-3 = banyak bergumam/tidak jelas; 4-6 = cukup jelas tapi beberapa kata kurang presisi; 7-8 = jelas sebagian besar; 9-10 = sangat jelas dan presisi.
       - Feedback WAJIB: kejelasan umum, contoh kata yang jelas/kurang jelas, dampak ke pemahaman, dan 1 tips artikulasi (misal buka mulut, latihan kata sulit).
    4. KATA PENGISI (Filler Words)
       - count = JUMLAH MENTAH kata pengisi ("hm", "anu", "gitu", "eeeh", "eh", "apa ya", dll). JANGAN isi dengan skor. Hitung dari transcript aktual.
       - score = kualitas: 9-10 = 0 filler; 7-8 = 1-2 filler wajar; 4-6 = 3-5 filler cukup mengganggu; 0-3 = >6 filler sangat mengganggu.
       - examples = daftar kata filler AKTUAL yang benar-benar terdengar (verbatim, minimal 1 jika count>0, maksimal 10).
       - Feedback WAJIB: sebutkan jumlah dan frekuensi, contoh kata yang muncul, dampak ke profesionalisme, dan 1 tips mengganti filler dengan jeda senyap.
    5. NADA EMOSIONAL (Emotional Tone)
       - Empati, kesabaran, kehangatan, rasa percaya diri, ketulusan.
       - dominant = SATU kata nada dominan (contoh: empatik, hangat, tenang, tegas, ragu, datar).
       - Skor: 0-3 = tidak empatik/ragu/datar; 4-6 = cukup empatik namun kadang datar; 7-8 = empatik, sabar, hangat; 9-10 = sangat empatik, hangat, percaya diri, tulus.
       - Feedback WAJIB: sebutkan nada dominan, bagaimana emosi terdengar di rekaman, dampak ke kepercayaan konsumen, dan 1 tips mengekspresikan empati lewat nada.

    OUTPUT JSON WAJIB (sesuai schema):
    - overallScore: rata-rata representatif kelima skor aspek (0-10, boleh 1 desimal), harus konsisten dengan kelima skor — jangan asal.
    - speakingRate: { score, wordsPerMinute, verdict, feedback }
    - intonation: { score, verdict, feedback }
    - articulation: { score, verdict, feedback }
    - fillerWords: { score, count, examples, verdict, feedback }
    - emotionalTone: { score, dominant, verdict, feedback }
    - transcript: TRANSKRIP VERBATIM LENGKAP 100% ucapan agen (jangan ringkas, jangan tambahkan ucapan konsumen, tulis apa adanya sesuai audio; jika durasi >15 detik minimal 20 kata; gunakan ejaan Indonesia benar; tandai [tidak jelas] bila ada bagian tak terdengar).
    - highlights: array 3-5 string, setiap string = 1 poin penting (15-30 kata) yang merangkum momen penting (pembukaan/sapaan, penggalian kebutuhan, penanganan keberatan/penjelasan solusi, penutup/konfirmasi). Spesifik, bukan generik.
    - strengths: array 3-5 string, setiap string = 1 kelebihan spesifik (12-25 kata) yang benar-benar terobservasi di rekaman, bukan pujian generik seperti "sudah baik".
    - holdManagement: JANGAN ISI — sistem mengisi otomatis, abaikan.

    ATURAN KUALITAS WAJIB (JIKA DILANGGAR HASIL DITOLAK):
    1. SEMUA teks (verdict, feedback, highlights, strengths, transcript, dominant) WAJIB Bahasa Indonesia 100%. Jangan ada Inggris.
    2. Setiap verdict: 1 kalimat ringkas 8-15 kata yang merangkum kualitas (contoh: "Kecepatan ideal dan stabil, mudah dipahami namun perlu jeda lebih natural"). Jangan hanya "Baik" atau "Cukup".
    3. Setiap feedback: 2-3 kalimat, MINIMAL 35 kata dan MAKSIMAL 90 kata, harus mengandung: (a) observasi konkret dari audio/transcript, (b) dampak ke konsumen, (c) 1 saran perbaikan yang actionable dan spesifik. Proporsi 50% apresiasi + 50% kritik konstruktif dalam tiap feedback.
    4. highlights minimal 3 item, strengths minimal 3 item. Jangan kosongkan atau isi dengan 1 kata generik.
    5. transcript WAJIB lengkap — jangan buat ringkasan 1 kalimat. Jika audio sangat pendek, tetap transkrip apa adanya dan jelaskan keterbatasan di feedback intonasi/artikulasi dengan skor menyesuaikan.
    6. Skor harus KONSISTEN dengan narasi: jika feedback banyak kritik, skor jangan 9-10; jika banyak pujian, skor jangan 0-3.
    7. Jangan mengarang WPM atau count dari skor. Hitung WPM dari kata/durasi, hitung count dari transcript.
    8. Jangan mengarang target radar — target QA dihitung sistem.
    9. JANGAN berikan jawaban singkat, template, atau generik. Setiap kalimat harus membawa informasi baru yang spesifik dan dapat ditindaklanjuti.
  `;

  const response = await generateGeminiContent({
    model: "gemini-3.7-flash",
    systemInstruction:
      "Anda adalah pelatih vokal senior dan analis wicara profesional dengan 15 tahun pengalaman melatih agent contact center OJK 157 dan telemarketing. Tugas Anda adalah memberikan penilaian yang MENDALAM, DETAIL, dan KONSTRUKTIF — bukan ringkasan singkat. Setiap penilaian harus spesifik, mengutip perilaku aktual dari rekaman, menjelaskan dampaknya ke konsumen, dan memberikan langkah perbaikan yang actionable. Semua balasan WAJIB sepenuhnya dalam Bahasa Indonesia yang natural, profesional, dan kritis-membangun (50% apresiasi, 50% kritik). Jangan pernah memberikan jawaban generik, singkat, atau asal-asalan.", 
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

      // Legacy scoring persists its assessment here. WebRTC persists it in
      // complete_telefun_scoring after the readiness/claim boundary.
      if (!isWebRtc) {
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
      }

      return { success: true, assessment };
    } catch (err) {
      console.error("[Telefun] Parse error for assessment:", err);
      // Legacy scoring keeps its existing direct failure marker. WebRTC
      // terminal state is owned by the atomic scoring RPC caller.
      await adminClient
        .from("telefun_history")
        .update({
          ...(isWebRtc ? {} : { scoring_status: "failed" }),
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
      ...(isWebRtc ? {} : { scoring_status: "failed" }),
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

    Data Voice Assessment (5 indikator + transcript, highlights, strengths):
    ${JSON.stringify(row.voice_assessment || {}, null, 2)}

    TUGAS: Berikan 3-5 rekomendasi coaching yang SPESIFIK, KONKRET, dan ACTIONABLE sesuai indikator yang nilainya paling rendah atau yang feedback-nya menyebut kekurangan. Jangan generik.

    ATURAN REKOMENDASI:
    - Setiap rekomendasi harus merujuk ke indikator spesifik (sebutkan: Kecepatan Bicara / Intonasi / Artikulasi / Filler Words / Nada Emosional) atau ke momen di highlights/transcript.
    - Format setiap text: minimal 15 kata, maksimal 30 kata, berisi: (a) perilaku yang perlu diperbaiki + (b) cara konkret memperbaikinya + (c) dampak jika diperbaiki.
    - Contoh baik: "Latih kecepatan 130-150 WPM dengan jeda 1 detik antar kalimat agar konsumen lebih mudah memahami penjelasan produk tanpa terkesan terburu-buru." (bukan: "Perbaiki artikulasi.")
    - Priority 5 = paling kritis/mendesak, 1 = penguatan. Urutkan dari priority tertinggi.
    - Minimal 3, maksimal 5 rekomendasi. Jangan kurang, jangan lebih.
    - Gunakan format JSON array of objects dengan keys "text" (string) dan "priority" (number 1-5).
    - Contoh: [{"text": "Kurangi filler 'anu' dan 'eh' dengan mengganti jeda senyap 1 detik; rekam latihan harian 2 menit untuk membiasakan jeda.", "priority": 5}]

    SEMUA TEKS WAJIB DALAM BAHASA INDONESIA, detail, dan tidak generik.
  `;

  const response = await generateGeminiContent({
    model: "gemini-3.7-flash",
    systemInstruction:
      "Anda adalah pelatih customer service senior dan mentor QA OJK 157 dengan pengalaman coaching agent. Berikan rekomendasi yang TAJAM, SPESIFIK, dan MEMBANGUN — setiap saran harus actionable, merujuk ke indikator penilaian Telefun yang sudah ditentukan, dan dapat langsung dipraktikkan agen. Hindari saran generik atau singkat. Semua balasan WAJIB Bahasa Indonesia.", 
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
