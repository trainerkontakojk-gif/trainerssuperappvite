import {
  KetikScenario,
  KetikConsumerType,
  ChatMessage,
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikSessionReview,
  KetikTypoFinding,
  DEFAULT_KETIK_SETTINGS,
} from "@trainers/types";
import { generateGeminiContent } from "../lib/gemini";
import { generateOpenRouterContent } from "../lib/openrouter";
import { resolveModelProvider, TEXT_SIMULATION_MODELS } from "../lib/ai-models";
import { UsageContext } from "../lib/ai-usage";
import { Type } from "@google/genai";
import { createAdminClient } from "../lib/supabase";
import { sanitizeAiResponse } from "../lib/ai-sanitize";

export function extractJsonObjectText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return candidate;
  return candidate.slice(start, end + 1);
}

const DEFAULT_SCENARIOS: KetikScenario[] = [
  {
    id: "pinjol",
    category: "Pinjol",
    title: "Pinjol Ilegal",
    description:
      "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.",
    isActive: true,
  },
  {
    id: "penipuan",
    category: "Penipuan",
    title: "Penipuan Undian",
    description:
      "Konsumen menerima pesan menang undian dan diminta transfer pajak.",
    isActive: true,
  },
  {
    id: "slik",
    category: "SLIK",
    title: "Pengecekan SLIK",
    description: "Konsumen ingin mengecek status BI Checking / SLIK.",
    isActive: true,
  },
  {
    id: "asuransi",
    category: "Asuransi",
    title: "Klaim Asuransi Ditolak",
    description: "Konsumen mengeluh klaim asuransi kesehatannya ditolak.",
    isActive: true,
  },
  {
    id: "investasi",
    category: "Investasi",
    title: "Investasi Bodong",
    description:
      "Konsumen melaporkan tawaran investasi dengan imbal hasil tidak wajar.",
    isActive: true,
  },
  {
    id: "kartu-kredit",
    category: "Perbankan",
    title: "Tagihan Kartu Kredit",
    description:
      "Konsumen keberatan dengan biaya administrasi di kartu kreditnya.",
    isActive: true,
  },
];

const DEFAULT_CONSUMER_TYPES: KetikConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    description:
      "Konsumen sangat kesal karena merasa dirugikan. Nada chat tegas, mendesak, mudah terpancing.",
    difficulty: "Sulit",
  },
  {
    id: "bingung",
    name: "Bingung & Gaptek",
    description: "Konsumen awam, bingung, kurang paham istilah teknis.",
    difficulty: "Sedang",
  },
  {
    id: "kritis",
    name: "Kritis & Detail",
    description: "Konsumen teliti, skeptis, suka meminta dasar aturan.",
    difficulty: "Sulit",
  },
  {
    id: "ramah",
    name: "Ramah & Kooperatif",
    description: "Konsumen sopan, tenang, kooperatif.",
    difficulty: "Mudah",
  },
  {
    id: "terburu-buru",
    name: "Terburu-buru",
    description: "Konsumen sempit waktu, ingin jawaban cepat.",
    difficulty: "Sedang",
  },
  {
    id: "pasrah",
    name: "Pasrah & Sedih",
    description: "Konsumen lelah dan putus asa, nada chat sedih.",
    difficulty: "Sedang",
  },
];

export function getScenarios(): KetikScenario[] {
  return DEFAULT_SCENARIOS;
}

export function getConsumerTypes(): KetikConsumerType[] {
  return DEFAULT_CONSUMER_TYPES;
}

function sanitizeConsumerText(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText
    .trim()
    .replace(/^(Agen|Agent|CS|Customer Service)\s*:\s*[\s\S]*?\n{1,2}/i, "")
    .replace(
      /^(Konsumen|Pelanggan|Customer|Nasabah|Klien|User|Pengguna|Bapak\/Ibu)\s*:\s*/i,
      "",
    )
    .replace(/\(pesan chat sebelumnya\)/gi, "")
    .replace(/\[pesan( chat)? sebelumnya\]/gi, "");

  if (/(^|\n)\s*(Agen|Agent|CS|Customer Service)\s*:/i.test(text)) {
    const consumerLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^(Agen|Agent|CS|Customer Service)\s*:/i.test(l))
      .map((l) =>
        l.replace(
          /^(Konsumen|Pelanggan|Customer|Nasabah|Klien|User|Pengguna|Bapak\/Ibu)\s*:\s*/i,
          "",
        ),
      );
    if (consumerLines.length > 0) text = consumerLines.join(" ");
  }
  return text.trim();
}

function formatDurationLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes <= 0) return `${seconds} detik`;
  if (seconds === 0) return `${minutes} menit`;
  return `${minutes} menit ${seconds} detik`;
}

interface SessionTimingContext {
  remainingSeconds?: number;
  elapsedSeconds?: number;
  totalDurationSeconds?: number;
}

function buildTimeLimitInstruction(
  simulationDurationMinutes: number | undefined,
  timing?: SessionTimingContext,
): string {
  if (!simulationDurationMinutes || simulationDurationMinutes <= 0) {
    return "";
  }

  const totalDurationSeconds =
    timing?.totalDurationSeconds ?? simulationDurationMinutes * 60;
  const remainingSecondsRaw = timing?.remainingSeconds;

  if (
    remainingSecondsRaw === undefined ||
    Number.isNaN(remainingSecondsRaw)
  ) {
    return `
STATUS WAKTU SIMULASI:
- Simulasi dibatasi maksimal ${simulationDurationMinutes} menit.
- Anda TIDAK boleh menutup percakapan lebih awal hanya karena menebak-nebak waktu hampir habis.
- Jangan bilang harus pergi, baterai habis, sinyal jelek, atau alasan serupa kecuali memang ada instruksi eksplisit bahwa waktu benar-benar hampir habis atau sudah habis.
- Selama belum ada instruksi waktu yang eksplisit, fokuslah membantu agen menyelesaikan percakapan secara natural.`;
  }

  const remainingSeconds = Math.max(0, Math.floor(remainingSecondsRaw));
  const nearEndThreshold = Math.min(
    45,
    Math.max(20, Math.floor(totalDurationSeconds * 0.15)),
  );
  const wrapUpThreshold = Math.min(
    90,
    Math.max(45, Math.floor(totalDurationSeconds * 0.3)),
  );

  if (remainingSeconds <= nearEndThreshold) {
    return `
STATUS WAKTU SIMULASI SAAT INI:
- Sisa waktu nyata sekitar ${formatDurationLabel(remainingSeconds)}. Ini benar-benar fase akhir sesi.
- Anda BOLEH mulai menutup percakapan secara natural, tetapi jangan mendadak memotong jawaban agen bila agen sedang memberi penjelasan penting.
- Jika agen masih menjelaskan hal yang relevan, beri kesempatan satu respons singkat yang tetap menanggapi inti penjelasan, lalu arahkan ke penutupan yang wajar.
- Jangan menyebut "timer", "waktu sistem", atau istilah teknis simulasi. Tetap sebagai konsumen biasa.`;
  }

  if (remainingSeconds <= wrapUpThreshold) {
    return `
STATUS WAKTU SIMULASI SAAT INI:
- Sisa waktu nyata sekitar ${formatDurationLabel(remainingSeconds)}. Sesi sudah mulai mendekati akhir, tetapi BELUM perlu menutup percakapan secara tiba-tiba.
- Prioritaskan menanggapi penjelasan agen sampai inti masalah atau langkah berikutnya jelas.
- Anda baru boleh mulai merapikan arah percakapan ke penutupan jika pembahasan memang sudah cukup selesai secara natural.
- Jangan berpura-pura waktu habis dan jangan memberi alasan pergi mendadak kalau masalah belum cukup dijelaskan.`;
  }

  return `
STATUS WAKTU SIMULASI SAAT INI:
- Sisa waktu nyata masih sekitar ${formatDurationLabel(remainingSeconds)} dari total ${formatDurationLabel(totalDurationSeconds)}. Sesi masih panjang.
- JANGAN menutup percakapan, JANGAN bersikap seolah waktu habis, dan JANGAN memberi alasan seperti harus pergi, baterai habis, atau sinyal jelek hanya karena asumsi waktu.
- Walau sedang frustrasi, bingung, atau kesal, tetap tanggapi agen selama agen masih berusaha menjelaskan atau membantu.
- Anda WAJIB menjelaskan masalah Anda di 2-3 pesan pertama dan TIDAK BOLEH menutup percakapan sebelum inti masalah tersampaikan.
- Fokuslah pada substansi masalah, bukan pada penutupan percakapan karena batas waktu.`;
}

export async function generateConsumerResponse(
  config: {
    scenarios: KetikScenario[];
    consumerType: KetikConsumerType;
    identity: { name: string; city: string; phone: string };
    selectedModel: string;
    simulationDuration: number;
    responsePacingMode: string;
  },
  scenario: KetikScenario,
  chatHistory: ChatMessage[],
  usageContext?: UsageContext,
  userId?: string,
  timing?: SessionTimingContext,
): Promise<{ success: boolean; text?: string; error?: string }> {
  const imagesCount = (scenario as any).images?.length || 0;
  const imageInstruction =
    imagesCount > 0
      ? `Anda memiliki ${imagesCount} lampiran gambar yang bisa dikirim (indeks 0 sampai ${imagesCount - 1}). Gunakan tag [SEND_IMAGE: indeks] untuk mengirimnya.`
      : "Anda tidak memiliki lampiran gambar untuk dikirim.";

  const hasScript = Boolean(scenario.script);
  const scriptInstruction = scenario.script
    ? `SKRIP PERCAKAPAN (PANDUAN ALUR):
Gunakan skrip berikut sebagai panduan utama arah percakapan, informasi penting, dan urutan eskalasi masalah.
- Skrip bisa ditulis dalam DUA FORMAT, dan Anda harus bisa memahami keduanya:
  1. FORMAT DIALOG, mis. "Agent: ..." dan "Konsumen: ..."
  2. FORMAT POIN ALUR, mis. "Awal:", "Jika agen bertanya:", "Akhir:", dst.
- Jika skrip berbentuk FORMAT DIALOG:
  - Perlakukan bagian "Agent" sebagai contoh pemicu atau arah percakapan dari agen.
  - Perlakukan bagian "Konsumen" sebagai contoh respons, nada bicara, dan informasi yang perlu Anda keluarkan secara bertahap.
  - Jangan menyalin dialog mentah-mentah; adaptasikan dengan percakapan aktual.
- Jika skrip berbentuk FORMAT POIN ALUR:
  - Ikuti tahapan, kondisi, emosi, dan informasi penting yang tertulis sebagai panduan perilaku.
- IKUTI inti alur, fakta penting, emosi, dan konteks dari skrip ini semampunya.
- JANGAN menyalin skrip secara verbatim atau terdengar seperti membaca naskah.
- JANGAN berikan semua informasi sekaligus; buka informasi sedikit demi sedikit sesuai pertanyaan agen dan alur chat yang natural.
- BOLEH menyimpang dari urutan skrip bila diperlukan agar percakapan tetap realistis, menjawab pertanyaan agen dengan relevan, atau menutup percakapan secara natural.
- Jika ada konflik antara skrip, pertanyaan agen, dan kondisi percakapan aktual, prioritaskan respons yang paling natural namun tetap konsisten dengan inti masalah pada skrip.

Isi skrip:
${scenario.script}`
    : "";

  const timeLimitInstruction = buildTimeLimitInstruction(
    config.simulationDuration,
    timing,
  );

  const systemInstruction = `
ROLEPLAY: Anda adalah KONSUMEN yang sedang menghubungi Kontak OJK 157 melalui chat. Anda bukan agen, bukan petugas, dan bukan AI.
IDENTITAS ANDA (WAJIB KONSISTEN):
- Nama: ${config.identity.name}
- Kota Domisili: ${config.identity.city}
- Nomor HP: ${config.identity.phone}

KARAKTER ANDA: ${config.consumerType.description}.
Masalah Anda: ${scenario.description}.

${scriptInstruction}
${timeLimitInstruction}
${imageInstruction}

ATURAN BALASAN:
1. Merespon secara natural, singkat, selayaknya chat WhatsApp. Jangan gunakan format formal, bullet points, atau salam pembuka yang berlebihan di setiap pesan.
1a. Gunakan Bahasa Indonesia percakapan sehari-hari yang terasa seperti orang Indonesia asli, bukan hasil terjemahan literal.
1b. Hindari bahasa yang terlalu kaku, terlalu baku, atau terdengar seperti template CS formal kecuali memang sesuai karakter konsumen.
1c. Jangan sengaja membuat typo, ejaan rusak, atau campuran kata asing yang aneh. Boleh santai, tetapi tetap wajar dan mudah dipahami.
1d. Anda sedang mencari bantuan, klarifikasi, atau tindak lanjut dari OJK. Jangan berbicara seperti petugas internal OJK.
1e. Jangan terlalu teatrikal, dramatis, atau dibuat-buat. Emosi boleh ada, tetapi tetap terdengar seperti manusia biasa.
1f. Variasikan diksi, ritme, dan cara bertanya dari satu balasan ke balasan lain agar tidak terdengar monoton atau terlalu template.
1g. Sesekali boleh memakai respons sangat singkat, respons yang agak ragu, atau respons yang lebih to the point, selama tetap sesuai karakter dan konteks.
2. Gunakan tag [BREAK] untuk memisahkan pesan jika ingin mengirim beberapa chat beruntun (maksimal 3 chat beruntun).
3. Gunakan tag [SISTEM] jika melakukan aksi fisik yang perlu dicatat internal (misal: [SISTEM] Konsumen pergi mengambil dokumen). Tag [SISTEM] TIDAK BOLEH muncul bersama [SEND_IMAGE] dalam satu part.
4. Jika Anda ingin mengirim gambar, tulis HANYA tag [SEND_IMAGE: indeks] TANPA narasi deskriptif apapun di sekitarnya. Contoh benar: "[SEND_IMAGE: 0]". JANGAN tambahkan penjelasan seperti "Konsumen mengirim tangkapan layar" atau narasi serupa di sekitar tag gambar. Jika ingin memberi keterangan tentang gambar, tulis keterangan sebagai chat konsumen biasa di part terpisah setelah [BREAK] sebelum tag gambar.
5. Kembalikan [NO_RESPONSE] HANYA JIKA agen memberikan jawaban yang sangat memuaskan, percakapan benar-benar selesai secara natural, dan tidak ada lagi yang perlu ditanyakan.
6. Jangan pernah mengakui bahwa Anda adalah AI. Tetaplah dalam karakter sebagai konsumen yang sedang menghadapi masalah keuangan/perbankan.
7. KONSISTENSI DATA: Jika agen meminta data pribadi (Nama/HP/Kota), berikan data DI ATAS. JANGAN MENGARANG DATA BARU yang berbeda dengan profil ini.
8. Jika ada skrip percakapan, perlakukan skrip itu sebagai arahan fleksibel: usahakan mengikuti alurnya, tetapi tetap responsif terhadap pertanyaan agen dan jangan memaksakan percakapan menjadi kaku.
9. JANGAN menulis ulang pesan agen. JANGAN gunakan format transkrip seperti "Agen:" atau "Konsumen:".
10. Output Anda harus berupa isi chat konsumen SAJA, bukan dialog dua arah, bukan analisis, bukan narasi panggung.
11. Jika agen salah paham atau memberi jawaban ngawur, reaksi Anda harus sesuai karakter: bisa bingung, kesal, kritis, atau minta penjelasan ulang. Tetap sebagai konsumen.
12. Jika Anda ingin meminta tindak lanjut ke OJK, lakukan secara realistis sesuai peran konsumen, misalnya meminta arahan, kanal pelaporan, atau langkah berikutnya. Jangan menuntut tindakan internal yang mustahil Anda verifikasi saat itu juga kecuali memang sesuai karakter marah.
13. Jangan mengakhiri percakapan terlalu cepat. Dalam 3-4 pesan pertama, Anda WAJIB fokus menjelaskan masalah dan TIDAK BOLEH menutup percakapan dengan alasan apapun. JANGAN PERNAH merespons greeting pertama agen dengan pamit atau menutup sesi — greeting pertama HARUS dijawab dengan penjelasan masalah atau sapaan balik yang menyampaikan inti keluhan. Selama agen masih relevan dan belum selesai menjelaskan, tetap beri ruang percakapan berjalan.
14. Jangan berpura-pura tahu timer internal simulasi. Jika belum ada status waktu yang benar-benar kritis, jangan beri respons seolah sesi sudah habis.
15. BATASAN KONTEKS SKENARIO: Anda HANYA boleh membahas fakta, isu, produk, atau layanan yang secara eksplisit disebutkan dalam deskripsi skenario, skrip percakapan, atau pertanyaan agen yang masih relevan dengan masalah inti.
15a. JANGAN menambah isu, produk, layanan, atau topik baru yang tidak ada dalam skenario. Misalnya, jika skenario tentang penipuan, jangan tiba-tiba membahas cetak SLIK, pengajuan kredit, atau produk lain yang tidak terkait.
15b. Jika agen menyinggung topik di luar konteks skenario, jawab dengan sopan bahwa itu bukan masalah utama Anda saat ini, lalu arahkan percakapan kembali ke inti kasus yang sedang dibahas.
15c. Anda boleh memberikan detail tambahan yang masuk akal sebagai elaborasi dari masalah yang sudah ada di skenario, tetapi jangan memperkenalkan masalah baru yang sama sekali berbeda.
  `;

  const historyText = chatHistory
    .filter((m) => m.sender !== "system")
    .map((m) => `${m.sender === "agent" ? "[AGEN]" : "[KONSUMEN]"} ${m.text}`)
    .join("\n");

  const prompt = `Skenario Saat Ini: ${scenario.title}\n\nRiwayat Chat:\n${historyText}\n\nInstruksi akhir:\n- Balas hanya sebagai konsumen.\n- Tulis 1 sampai 3 chat pendek yang relevan.\n- Jangan gunakan prefix nama pembicara.\n- Jangan ulangi isi pesan agen.\n- Hindari mengulang pola kalimat atau frasa yang sama seperti balasan sebelumnya kecuali memang sangat natural.\n\nBalas sebagai konsumen:`;

  const { modelId, provider } = resolveModelProvider(config.selectedModel);
  const isOpenRouter = provider === "openrouter";

  const providerSystemInstruction = isOpenRouter && hasScript
    ? `${systemInstruction}\n\nOPENROUTER SCRIPT MODE (WAJIB PATUH):\n- Ikuti system instruction dan skrip percakapan dengan ketat, tetapi tetap terdengar seperti chat manusia sungguhan.\n- Jangan menambah detail baru yang tidak ada di identitas, masalah, atau skrip kecuali benar-benar diperlukan untuk menjawab secara natural.\n- Prioritaskan konsistensi karakter, alur skrip, dan jawaban singkat yang relevan.\n- Jika skrip memberi arah percakapan, anggap itu sebagai batas perilaku utama, bukan sekadar saran ringan.\n- Hindari jawaban template yang berulang, frasa klise yang sama, atau struktur kalimat yang terlalu seragam di setiap balasan.\n- Bila ragu, pilih jawaban yang paling dekat dengan isi skrip dan riwayat chat, sambil tetap mempertahankan variasi diksi yang wajar.`
    : systemInstruction;

  const callPayload = {
    model: modelId,
    systemInstruction: providerSystemInstruction,
    contents: [{ role: "user" as const, parts: [{ text: prompt }] }],
    temperature: isOpenRouter && hasScript
      ? Math.min(0.82, 0.55)
      : isOpenRouter
        ? 0.55
        : 0.82,
    usageContext,
    userId,
  };

  try {
    const response = isOpenRouter
      ? await generateOpenRouterContent(callPayload)
      : await generateGeminiContent(callPayload);

    if (!response.success) {
      return { success: false, error: response.error || "AI tidak tersedia." };
    }
    const rawText =
      typeof response.text === "string" ? response.text : "[NO_RESPONSE]";
    const sanitizedText = sanitizeConsumerText(rawText);
    return { success: true, text: sanitizedText || "[NO_RESPONSE]" };
  } catch (error) {
    console.error("[KETIK] Error:", error);
    return { success: false, error: "Gangguan AI. Coba lagi." };
  }
}

/**
 * Generate AI review response with Gemini-first + OpenRouter fallback.
 * Both Gemini and OpenRouter responses use `sanitizeOutput: false` so that
 * structured JSON is returned raw; the caller sanitizes individual string
 * fields after parsing.
 */
async function generateKetikReviewAiResponse(options: {
  systemInstruction: string;
  contents: { role: string; parts: { text: string }[] }[];
  userId: string;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  const usageContext: UsageContext = { module: "ketik", action: "coaching_review" };

  // Try Gemini first
  try {
    const geminiResp = await generateGeminiContent({
      model: "gemini-3.1-flash-lite",
      systemInstruction: options.systemInstruction,
      contents: options.contents as any,
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
      usageContext,
      userId: options.userId,
      sanitizeOutput: false,
    });
    if (geminiResp.success && geminiResp.text) {
      return geminiResp;
    }
    console.warn("[KETIK Review] Gemini failed, falling back to OpenRouter:", geminiResp.error);
  } catch (err) {
    console.warn("[KETIK Review] Gemini exception, falling back to OpenRouter:", err);
  }

  // Fallback to OpenRouter
  try {
    const orResp = await generateOpenRouterContent({
      model: "openai/gpt-4o-mini",
      systemInstruction: options.systemInstruction,
      contents: options.contents,
      responseMimeType: "application/json",
      usageContext,
      userId: options.userId,
      sanitizeOutput: false,
    });
    return orResp;
  } catch (err) {
    console.error("[KETIK Review] OpenRouter fallback also failed:", err);
    return { success: false, error: "AI tidak tersedia dari provider manapun." };
  }
}

/**
 * Sanitize individual string fields of a parsed KETIK review result.
 * Applied AFTER JSON.parse to avoid corrupting structured output.
 */
function sanitizeKetikReviewResult(result: any): void {
  if (!result || typeof result !== "object") return;
  if (typeof result.summary === "string") {
    result.summary = sanitizeAiResponse(result.summary);
  }
  if (Array.isArray(result.strengths)) {
    result.strengths = result.strengths.map((s: any) =>
      typeof s === "string" ? sanitizeAiResponse(s) : s,
    );
  }
  if (Array.isArray(result.weaknesses)) {
    result.weaknesses = result.weaknesses.map((w: any) =>
      typeof w === "string" ? sanitizeAiResponse(w) : w,
    );
  }
  if (Array.isArray(result.coachingFocus)) {
    result.coachingFocus = result.coachingFocus.map((c: any) =>
      typeof c === "string" ? sanitizeAiResponse(c) : c,
    );
  }
}

export async function triggerKetikAIReview(
  sessionId: string,
  userId: string,
): Promise<any> {
  const adminClient = createAdminClient();
  let canMarkFailed = false;

  try {
    const { data: session, error: sessionError } = await adminClient
      .from("ketik_history")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      console.error(
        `[triggerKetikAIReview] Session not found or unauthorized: ${sessionId}`,
      );
      throw new Error("Session not found or unauthorized");
    }

    canMarkFailed = true;

    if (session.review_status === "completed") {
      return { status: "skipped" };
    }

    const { data: existingJob } = await adminClient
      .from("ketik_review_jobs")
      .select("id, status")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!existingJob) {
      const { error: insertError } = await adminClient
        .from("ketik_review_jobs")
        .insert({
          session_id: sessionId,
          status: "queued",
          lease_owner: null,
          lease_expires_at: null,
          error_message: null,
        });

      // Duplicate insert race: treat as idempotent success
      if (insertError) {
        if ((insertError as { code?: string }).code !== "23505") {
          throw insertError;
        }
      }
    } else if (existingJob.status === "completed" || existingJob.status === "processing") {
      return { status: existingJob.status === "completed" ? "skipped" : "processing" };
    }

    await adminClient
      .from("ketik_history")
      .update({ review_status: "pending" })
      .eq("id", sessionId);

    return { status: "queued" };
  } catch (error) {
    console.error(`[triggerKetikAIReview] Error for session ${sessionId}:`, error);
    if (canMarkFailed) {
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
    }
    throw error;
  }
}

export async function claimAndProcessKetikReviewJob(
  sessionId: string,
  workerId: string = "system-auto",
): Promise<any> {
  const adminClient = createAdminClient();

  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from("ketik_review_jobs")
    .update({
      status: "processing",
      lease_owner: workerId,
      lease_expires_at: leaseExpiresAt,
      error_message: null,
    })
    .eq("session_id", sessionId)
    .or(
      `status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${nowIso})`,
    )
    .select("id, attempt_count");

  if (claimError) throw claimError;

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from("ketik_review_jobs")
      .select("status")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!current) return { status: "skipped" };
    if (current.status === "completed") return { status: "completed" };
    if (current.status === "failed")
      return { status: "failed", error: "Job previously failed" };
    return { status: "processing" };
  }

  const nextAttempt = (claimed[0].attempt_count || 0) + 1;
  if (nextAttempt > 3) {
    await adminClient
      .from("ketik_review_jobs")
      .update({
        status: "failed",
        error_message: "Max attempts reached",
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq("session_id", sessionId);
    await adminClient
      .from("ketik_history")
      .update({ review_status: "failed" })
      .eq("id", sessionId);
    return { status: "failed", error: "Max attempts reached" };
  }

  await adminClient
    .from("ketik_review_jobs")
    .update({ attempt_count: nextAttempt })
    .eq("session_id", sessionId);

  try {
    return await processKetikReviewJob(sessionId, workerId);
  } catch (error: any) {
    const error_message =
      error instanceof Error ? error.message : "Unknown processing error";
    await adminClient
      .from("ketik_review_jobs")
      .update({
        status: "failed",
        error_message,
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq("session_id", sessionId);
    await adminClient
      .from("ketik_history")
      .update({ review_status: "failed" })
      .eq("id", sessionId);
    return { status: "failed", error: error_message };
  }
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    coachingFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
    scores: {
      type: Type.OBJECT,
      properties: {
        final: { type: Type.NUMBER },
        empathy: { type: Type.NUMBER },
        probing: { type: Type.NUMBER },
        typo: { type: Type.NUMBER },
        compliance: { type: Type.NUMBER },
      },
      required: ["final", "empathy", "probing", "typo", "compliance"],
    },
    typos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING },
          originalWord: { type: Type.STRING },
          correctedWord: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ["minor", "medium", "critical"],
          },
        },
        required: ["messageId", "originalWord", "correctedWord", "severity"],
      },
    },
  },
  required: [
    "summary",
    "strengths",
    "weaknesses",
    "coachingFocus",
    "scores",
    "typos",
  ],
};

export async function processKetikReviewJob(
  sessionId: string,
  leaseOwner?: string,
): Promise<any> {
  const adminClient = createAdminClient();

  const { data: session, error: sessionError } = await adminClient
    .from("ketik_history")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Session not found");
  }

  const transcript = JSON.stringify(session.messages);

  const systemInstruction = `
  You are an expert Quality Assurance (QA) and Coaching AI for a customer service contact center.
  Review the customer service chat transcript between an Agent (user) and a Consumer (consumer).
  
  Evaluation Categories (Skala 0-100):
  - Communication (naturalness, empathy, readability, professionalism)
  - Probing (depth, relevance, chronology gathering)
  - Resolution (clarity, actionable response, completeness)
  - Compliance (no misinformation, no victim blaming, no rude wording)
  - Typo & Writing (typo frequency, readability)

  Rubrik Penilaian (0-100):
  - 90-100: Sangat Baik (Excellent)
  - 75-89: Baik (Good)
  - 60-74: Cukup (Fair)
  - <60: Perlu Coaching (Needs Coaching)

  Rules for Typo Detection:
  - Ignore common Indonesian slang/informal words like 'yg', 'sy', 'kak', 'ga', 'gak', 'ok', 'oke'.
  - Identify formal typos that affect professionalism or readability.
  - Severity: 'minor' (small typo), 'medium' (repeated or confusing), 'critical' (changes meaning or unprofessional).

  IMPORTANT: ALL textual response (summary, strengths, weaknesses, coachingFocus) MUST be in Indonesian.
  `;

  const aiResponse = await generateKetikReviewAiResponse({
    systemInstruction,
    contents: [
      { role: "user", parts: [{ text: `Transcript:\n${transcript}` }] },
    ],
    userId: session.user_id,
  });

  if (!aiResponse.success || !aiResponse.text) {
    throw new Error(aiResponse.error || "AI Response failed or empty");
  }

  let reviewResult: any;
  try {
    reviewResult = JSON.parse(extractJsonObjectText(aiResponse.text));

    const clamp = (val: any) => {
      const num = Number(val);
      if (isNaN(num)) return 0;
      return Math.max(0, Math.min(100, Math.round(num)));
    };

    reviewResult.scores = {
      empathy: clamp(reviewResult.scores?.empathy),
      probing: clamp(reviewResult.scores?.probing),
      typo: clamp(reviewResult.scores?.typo),
      compliance: clamp(reviewResult.scores?.compliance),
      final: clamp(reviewResult.scores?.final),
    };

    const calculatedFinal = Math.round(
      (reviewResult.scores.empathy +
        reviewResult.scores.probing +
        reviewResult.scores.typo +
        reviewResult.scores.compliance) /
        4,
    );

    if (
      reviewResult.scores.final === 0 ||
      Math.abs(reviewResult.scores.final - calculatedFinal) > 15
    ) {
      reviewResult.scores.final = calculatedFinal;
    }

    if (!reviewResult.summary)
      reviewResult.summary = "Ringkasan tidak tersedia.";
    if (
      !Array.isArray(reviewResult.strengths) ||
      reviewResult.strengths.length === 0
    )
      reviewResult.strengths = [
        "Pertahankan profesionalisme dalam berkomunikasi.",
      ];
    if (
      !Array.isArray(reviewResult.weaknesses) ||
      reviewResult.weaknesses.length === 0
    )
      reviewResult.weaknesses = ["Terus latih teknik probing dan empati."];
    if (
      !Array.isArray(reviewResult.coachingFocus) ||
      reviewResult.coachingFocus.length === 0
    )
      reviewResult.coachingFocus = ["Fokus pada detail kebutuhan konsumen."];

    if (
      !reviewResult ||
      typeof reviewResult !== "object" ||
      !reviewResult.scores ||
      typeof reviewResult.scores.final !== "number" ||
      typeof reviewResult.summary !== "string"
    ) {
      throw new Error("Invalid AI response shape after normalization");
    }

    sanitizeKetikReviewResult(reviewResult);
  } catch (error) {
    console.error(
      "[processKetikReviewJob] Failed to parse or normalize AI response:",
      error,
      aiResponse.text,
    );
    throw new Error("AI response JSON tidak valid atau format tidak sesuai.", {
      cause: error,
    });
  }

  if (leaseOwner) {
    const renewedLeaseExpiresAt = new Date(
      Date.now() + 5 * 60 * 1000,
    ).toISOString();
    const { data: leaseRows, error: leaseError } = await adminClient
      .from("ketik_review_jobs")
      .update({ lease_expires_at: renewedLeaseExpiresAt })
      .eq("session_id", sessionId)
      .eq("status", "processing")
      .eq("lease_owner", leaseOwner)
      .select("id");

    if (leaseError) throw leaseError;

    if (!leaseRows || leaseRows.length === 0) {
      console.warn(
        `[processKetikReviewJob] Lease lost before persistence for session: ${sessionId}`,
      );
      return { status: "processing" };
    }
  }

  await adminClient
    .from("ketik_session_reviews")
    .delete()
    .eq("session_id", sessionId);

  const { error: reviewInsertError } = await adminClient
    .from("ketik_session_reviews")
    .insert({
      session_id: sessionId,
      ai_summary: reviewResult.summary,
      strengths: reviewResult.strengths,
      weaknesses: reviewResult.weaknesses,
      coaching_focus: reviewResult.coachingFocus,
    });

  if (reviewInsertError) throw reviewInsertError;

  await adminClient
    .from("ketik_typo_findings")
    .delete()
    .eq("session_id", sessionId);

  if (reviewResult.typos && reviewResult.typos.length > 0) {
    const typoInserts = reviewResult.typos.map((t: any) => ({
      session_id: sessionId,
      message_id: t.messageId,
      original_word: t.originalWord,
      corrected_word: t.correctedWord,
      severity: t.severity,
    }));

    const { error: typoInsertError } = await adminClient
      .from("ketik_typo_findings")
      .insert(typoInserts);

    if (typoInsertError) throw typoInsertError;
  }

  const { error: updateError } = await adminClient
    .from("ketik_history")
    .update({
      final_score: reviewResult.scores.final,
      empathy_score: reviewResult.scores.empathy,
      probing_score: reviewResult.scores.probing,
      typo_score: reviewResult.scores.typo,
      compliance_score: reviewResult.scores.compliance,
      review_status: "completed",
    })
    .eq("id", sessionId);

  if (updateError) throw updateError;

  // Dual-update to results
  try {
    await adminClient
      .from("results")
      .update({
        score: reviewResult.scores.final,
        status: "completed",
      })
      .eq("session_id", sessionId)
      .eq("module", "ketik");
  } catch (e) {
    console.error(e);
  }

  let jobUpdateQuery = adminClient
    .from("ketik_review_jobs")
    .update({ status: "completed", lease_owner: null, lease_expires_at: null })
    .eq("session_id", sessionId)
    .eq("status", "processing");

  if (leaseOwner) {
    jobUpdateQuery = jobUpdateQuery.eq("lease_owner", leaseOwner);
  }

  const { error: jobUpdateError } = await jobUpdateQuery;
  if (jobUpdateError) throw jobUpdateError;

  return { status: "completed" };
}

export async function getKetikReviewStatus(
  sessionId: string,
  userId: string,
): Promise<any> {
  const adminClient = createAdminClient();

  const { data: history, error } = await adminClient
    .from("ketik_history")
    .select(
      "review_status, final_score, empathy_score, probing_score, typo_score, compliance_score",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !history) return null;

  let status = history.review_status || "pending";
  let resultReady = false;
  let scores = null;
  let errorMessage: string | undefined = undefined;

  if (status === "completed") {
    // Auto-heal check: verify review row actually exists
    const { data: review, error: reviewError } = await adminClient
      .from("ketik_session_reviews")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!review || reviewError) {
      status = "failed";
      errorMessage = "Hasil analisis tidak ditemukan. Silakan jalankan ulang.";
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
      await adminClient
        .from("ketik_review_jobs")
        .update({ status: "failed", error_message: errorMessage })
        .eq("session_id", sessionId);
    } else {
      resultReady = true;
      scores = {
        final: history.final_score,
        empathy: history.empathy_score,
        probing: history.probing_score,
        typo: history.typo_score,
        compliance: history.compliance_score,
      };
    }
  }

  // Reconcile with job status when history is not terminal
  if (status !== "completed" && status !== "failed") {
    const { data: job } = await adminClient
      .from("ketik_review_jobs")
      .select("status, lease_expires_at, error_message, updated_at")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!job) {
      // No job at all — mark failed so UI can retry
      status = "failed";
      errorMessage = "Pekerjaan analisis tidak ditemukan. Silakan jalankan ulang.";
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
    } else if (job.status === "failed") {
      status = "failed";
      errorMessage = job.error_message || "Analisis AI gagal diproses. Silakan jalankan ulang.";
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
    } else if (job.status === "processing") {
      // Check if lease has expired (with 30s grace period)
      const gracePeriodMs = 30_000;
      const now = new Date();
      const leaseExpired =
        job.lease_expires_at &&
        new Date(job.lease_expires_at).getTime() + gracePeriodMs < now.getTime();
      if (leaseExpired) {
        // Stale processing — mark failed to enable retry
        status = "failed";
        errorMessage = "Analisis AI melebihi batas waktu. Silakan jalankan ulang.";
        await adminClient
          .from("ketik_review_jobs")
          .update({
            status: "failed",
            error_message: "Processing timeout — lease expired",
          })
          .eq("session_id", sessionId);
        await adminClient
          .from("ketik_history")
          .update({ review_status: "failed" })
          .eq("id", sessionId);
      } else {
        status = "processing";
      }
    } else if (job.status === "queued") {
      // Check if queued too long (5 min TTL)
      const queueTTL = 5 * 60 * 1000;
      if (
        job.updated_at &&
        new Date().getTime() - new Date(job.updated_at).getTime() > queueTTL
      ) {
        status = "failed";
        errorMessage = "Analisis AI terlalu lama mengantre. Silakan jalankan ulang.";
        await adminClient
          .from("ketik_review_jobs")
          .update({
            status: "failed",
            error_message: "Queue timeout — no worker picked up the job",
          })
          .eq("session_id", sessionId);
        await adminClient
          .from("ketik_history")
          .update({ review_status: "failed" })
          .eq("id", sessionId);
      } else {
        status = "processing";
      }
    }
  }

  // Queue lifecycle is internal; UI should treat queued as processing.
  if (status === "queued") {
    status = "processing";
  }

  return { status, resultReady, scores, errorMessage };
}

const coerceKetikModelId = (modelId?: string) =>
  TEXT_SIMULATION_MODELS.some((m) => m.id === modelId)
    ? modelId!
    : "gemini-3.1-flash-lite";
const coerceDuration = (duration?: number) => {
  if (typeof duration !== "number" || isNaN(duration)) return 5;
  return Math.max(1, Math.min(60, duration));
};

function parseSettings(stored: Partial<KetikAppSettings>): KetikAppSettings {
  const mergedScenarios = DEFAULT_KETIK_SETTINGS.scenarios.map(
    (defaultItem) => {
      const existing = stored.scenarios?.find((s) => s.id === defaultItem.id);
      return existing
        ? { ...existing, description: defaultItem.description }
        : defaultItem;
    },
  );
  const customScenarios = (stored.scenarios || []).filter(
    (s) => !DEFAULT_KETIK_SETTINGS.scenarios.find((d) => d.id === s.id),
  );

  const mergedConsumers = DEFAULT_KETIK_SETTINGS.consumerTypes.map(
    (defaultItem) => {
      const existing = stored.consumerTypes?.find(
        (s) => s.id === defaultItem.id,
      );
      return existing
        ? { ...existing, description: defaultItem.description }
        : defaultItem;
    },
  );
  const customConsumers = (stored.consumerTypes || []).filter(
    (s) => !DEFAULT_KETIK_SETTINGS.consumerTypes.find((d) => d.id === s.id),
  );

  return {
    scenarios: [...mergedScenarios, ...customScenarios],
    consumerTypes: [...mergedConsumers, ...customConsumers],
    quickTemplates:
      stored.quickTemplates || DEFAULT_KETIK_SETTINGS.quickTemplates,
    activeConsumerTypeId: stored.activeConsumerTypeId || "random",
    identitySettings: {
      displayName: stored.identitySettings?.displayName || "",
      signatureName: stored.identitySettings?.signatureName || "",
      phoneNumber: stored.identitySettings?.phoneNumber || "",
      city: stored.identitySettings?.city || "",
    },
    selectedModel: coerceKetikModelId(stored.selectedModel),
    simulationDuration: coerceDuration(stored.simulationDuration),
    responsePacingMode: stored.responsePacingMode || "realistic",
  };
}

export async function getSettings(userId: string): Promise<KetikAppSettings> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.settings?.ketik) {
    return DEFAULT_KETIK_SETTINGS;
  }

  const stored = data.settings.ketik as Partial<KetikAppSettings>;
  return parseSettings(stored);
}

export async function saveSettings(
  userId: string,
  settings: KetikAppSettings,
): Promise<void> {
  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  const updatedSettings = {
    ...(existing?.settings || {}),
    ketik: settings,
  };

  const { error } = await adminClient
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
}

export async function getHistory(
  userId: string,
): Promise<KetikSessionHistoryItem[]> {
  const adminClient = createAdminClient();

  let data, error;

  // Try 1: specific columns
  const res1 = await adminClient
    .from("ketik_history")
    .select(
      "id, date, created_at, scenario_title, consumer_name, consumer_phone, consumer_city, messages, simulation_duration, final_score, empathy_score, probing_score, typo_score, compliance_score, review_status",
    )
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(50);

  data = res1.data;
  error = res1.error;

  // Try 2: wildcard
  if (error) {
    const res2 = await adminClient
      .from("ketik_history")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(50);
    data = res2.data;
    error = res2.error;
  }

  // Try 3: results table fallback
  if (error) {
    const res3 = await adminClient
      .from("results")
      .select("session_id, created_at, metadata, score, status")
      .eq("user_id", userId)
      .eq("module", "ketik")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!res3.error && res3.data) {
      return res3.data.map((item: any) => ({
        id: item.session_id,
        date: item.created_at,
        scenarioTitle: item.metadata?.scenario_title || "Simulation Chat",
        consumerName: item.metadata?.consumer_name || "Consumer",
        consumerPhone: "",
        consumerCity: "",
        messages: [],
        simulationDuration: item.metadata?.simulation_duration,
        finalScore: item.score,
        reviewStatus: item.status || "pending",
      }));
    }
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    date: item.date || item.created_at,
    scenarioTitle: item.scenario_title || "Simulation Chat",
    consumerName: item.consumer_name || "Consumer",
    consumerPhone: item.consumer_phone,
    consumerCity: item.consumer_city,
    messages: Array.isArray(item.messages) ? item.messages : [],
    simulationDuration: item.simulation_duration,
    finalScore: item.final_score,
    empathyScore: item.empathy_score,
    probingScore: item.probing_score,
    typoScore: item.typo_score,
    complianceScore: item.compliance_score,
    reviewStatus: item.review_status,
  }));
}

export async function persistSession(
  userId: string,
  params: {
    scenarioTitle: string;
    consumerName: string;
    consumerPhone: string;
    consumerCity: string;
    messages: ChatMessage[];
    simulationDuration?: number;
  },
): Promise<KetikSessionHistoryItem> {
  const adminClient = createAdminClient();

  const sessionData = {
    user_id: userId,
    date: new Date().toISOString(),
    scenario_title: params.scenarioTitle,
    consumer_name: params.consumerName,
    consumer_phone: params.consumerPhone,
    consumer_city: params.consumerCity,
    messages: params.messages,
    simulation_duration: params.simulationDuration,
  };

  const { data, error } = await adminClient
    .from("ketik_history")
    .insert([sessionData])
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Gagal menyimpan sesi.");
  }

  // Dual-write to results table for legacy compatibility
  try {
    await adminClient.from("results").insert({
      user_id: userId,
      module: "ketik",
      session_id: data.id,
      created_at: new Date().toISOString(),
      metadata: {
        scenario_title: params.scenarioTitle,
        consumer_name: params.consumerName,
        simulation_duration: params.simulationDuration,
      },
    });
  } catch (err) {
    console.error(
      `[KETIK] Failed to dual-write to results table for session ${data.id}:`,
      err,
    );
  }

  return {
    id: data.id,
    date: data.date || data.created_at,
    scenarioTitle: data.scenario_title || params.scenarioTitle,
    consumerName: data.consumer_name || params.consumerName,
    consumerPhone: data.consumer_phone,
    consumerCity: data.consumer_city,
    messages: data.messages || params.messages,
    simulationDuration: data.simulation_duration,
    reviewStatus: data.review_status || "pending",
  };
}

export async function deleteSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("ketik_history")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Gagal menghapus sesi: ${error.message}`);

  // Dual-delete from results
  try {
    await adminClient
      .from("results")
      .delete()
      .eq("session_id", sessionId)
      .eq("module", "ketik");
  } catch (e) {
    console.error(e);
  }
}

export async function clearHistory(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("ketik_history")
    .delete()
    .eq("user_id", userId);

  if (error) throw new Error(`Gagal menghapus riwayat: ${error.message}`);

  // Dual-delete from results
  try {
    await adminClient
      .from("results")
      .delete()
      .eq("user_id", userId)
      .eq("module", "ketik");
  } catch (e) {
    console.error(e);
  }
}

export async function getReviewDetail(
  sessionId: string,
  userId: string,
): Promise<KetikReviewDetail | null> {
  const adminClient = createAdminClient();

  const { data: history, error: historyError } = await adminClient
    .from("ketik_history")
    .select(
      "review_status, final_score, empathy_score, probing_score, typo_score, compliance_score",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (historyError || !history || history.review_status !== "completed")
    return null;

  const [{ data: reviewData }, { data: typosData }] = await Promise.all([
    adminClient
      .from("ketik_session_reviews")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle(),
    adminClient
      .from("ketik_typo_findings")
      .select("*")
      .eq("session_id", sessionId),
  ]);

  if (!reviewData) return null;

  const review: KetikSessionReview = {
    id: reviewData.id,
    sessionId: reviewData.session_id,
    aiSummary: reviewData.ai_summary,
    strengths: reviewData.strengths,
    weaknesses: reviewData.weaknesses,
    coachingFocus: reviewData.coaching_focus,
    createdAt: reviewData.created_at,
  };

  const typos: KetikTypoFinding[] = (typosData || []).map((t: any) => ({
    id: t.id,
    sessionId: t.session_id,
    messageId: t.message_id,
    originalWord: t.original_word,
    correctedWord: t.corrected_word,
    severity: t.severity,
    createdAt: t.created_at,
  }));

  return {
    sessionId,
    review,
    typos,
    scores: {
      final: history.final_score,
      empathy: history.empathy_score,
      probing: history.probing_score,
      typo: history.typo_score,
      compliance: history.compliance_score,
    },
  };
}

export async function processOldestQueuedJob(
  workerId: string = "daemon-worker",
): Promise<any> {
  const adminClient = createAdminClient();

  const nowIso = new Date().toISOString();

  // Find oldest queued or stale processing job
  const { data: job, error } = await adminClient
    .from("ketik_review_jobs")
    .select("session_id")
    .or(
      `status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${nowIso})`,
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !job) return { status: "no_jobs" };

  return await claimAndProcessKetikReviewJob(job.session_id, workerId);
}
