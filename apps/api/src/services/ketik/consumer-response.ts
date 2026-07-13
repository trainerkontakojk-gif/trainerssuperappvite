import {
  KetikScenario,
  KetikConsumerType,
  ChatMessage,
} from "@trainers/types";
import { generateGeminiContent } from "../../lib/gemini";
import { generateOpenRouterContent } from "../../lib/openrouter";
import { generateDeepSeekContent } from "../../lib/deepseek";
import { resolveModelProvider } from "../../lib/ai-models";
import { UsageContext } from "../../lib/ai-usage";

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

export function sanitizeConsumerText(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText
    .trim()
    .replace(/^(Agen|Agent|CS|Customer Service)\s*:\s*[\s\S]*?\n{1,2}/i, "")
    .replace(
      /^(Konsumen|Pelanggan|Customer|Nasabah|Klien|User|Pengguna|Bapak\/Ibu)\s*:\s*/i,
      "",
    )
    .replace(/\(pesan chat sebelumnya\)/gi, "")
    .replace(/\[pesan( chat)? sebelumnya\]/gi, "")
    .replace(/\[NO_RESPONSE\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

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

export interface SessionTimingContext {
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
  const isDeepSeek = provider === "deepseek";
  const usesConservativeTemperature = isOpenRouter || isDeepSeek;

  const providerSystemInstruction =
    usesConservativeTemperature && hasScript
      ? `${systemInstruction}\n\nMODEL SCRIPT MODE (WAJIB PATUH):\n- Ikuti system instruction dan skrip percakapan dengan ketat, tetapi tetap terdengar seperti chat manusia sungguhan.\n- Jangan menambah detail baru yang tidak ada di identitas, masalah, atau skrip kecuali benar-benar diperlukan untuk menjawab secara natural.\n- Prioritaskan konsistensi karakter, alur skrip, dan jawaban singkat yang relevan.\n- Jika skrip memberi arah percakapan, anggap itu sebagai batas perilaku utama, bukan sekadar saran ringan.\n- Hindari jawaban template yang berulang, frasa klise yang sama, atau struktur kalimat yang terlalu seragam di setiap balasan.\n- Bila ragu, pilih jawaban yang paling dekat dengan isi skrip dan riwayat chat, sambil tetap mempertahankan variasi diksi yang wajar.`
      : systemInstruction;

  const callPayload = {
    model: modelId,
    systemInstruction: providerSystemInstruction,
    contents: [{ role: "user" as const, parts: [{ text: prompt }] }],
    temperature: usesConservativeTemperature ? 0.55 : 0.82,
    usageContext,
    userId,
  };

  try {
    const response = isOpenRouter
      ? await generateOpenRouterContent(callPayload)
      : isDeepSeek
        ? await generateDeepSeekContent(callPayload)
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
