import { 
  PdktScenario, 
  PdktConsumerType, 
  PdktIdentity, 
  EmailMessage, 
  PdktSessionConfig,
  WritingStyleMode,
  ResolvedConsumerNameMentionPattern,
} from '@trainers/types';
import { generateGeminiContent } from '../lib/gemini';
import { generateOpenRouterContent } from '../lib/openrouter';
import { resolveModelProvider } from '../lib/ai-models';
import { UsageContext } from '../lib/ai-usage';
import { createAdminClient } from '../lib/supabase';

// ── Constants ───────────────────────────────────────────

const LICENSED_COMPANY_NAMES: Record<string, string[]> = {
  Perbankan: [
    'Bank Central Asia (BCA)',
    'Bank Mandiri',
    'Bank Rakyat Indonesia (BRI)',
    'Bank Negara Indonesia (BNI)',
    'Bank Tabungan Negara (BTN)',
    'Bank CIMB Niaga',
    'Bank Danamon Indonesia',
    'Bank Permata',
    'Bank Maybank Indonesia',
    'Bank Panin',
    'Bank OCBC NISP',
    'Bank Syariah Indonesia (BSI)',
    'Bank Mega',
    'Bank UOB Indonesia',
    'Bank Sinarmas',
  ],
  Asuransi: [
    'Prudential Indonesia',
    'Allianz Life Indonesia',
    'AXA Mandiri Financial Services',
    'Manulife Indonesia',
    'AIA Financial',
    'BNI Life Insurance',
    'BRI Life',
    'Sinarmas MSIG Life',
    'Sequis Life',
    'FWD Insurance Indonesia',
    'Great Eastern Life Indonesia',
    'Sun Life Financial Indonesia',
  ],
};

const SCENARIO_COMPANY_CATEGORY_MAP: Record<string, string> = {
  'Pengecekan SLIK': 'Perbankan',
  'Tagihan Kartu Kredit': 'Perbankan',
  'Klaim Asuransi Ditolak': 'Asuransi',
};

const DEFAULT_SCENARIOS: PdktScenario[] = [
  { id: 'pinjol', category: 'Pinjol', title: 'Pinjol Ilegal', description: 'Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.', isActive: true, isLicensed: false },
  { id: 'penipuan', category: 'Penipuan', title: 'Penipuan Undian', description: 'Konsumen menerima pesan menang undian dan diminta transfer pajak pemenang.', isActive: true, isLicensed: false },
  { id: 'slik', category: 'SLIK', title: 'Pengecekan SLIK', description: 'Konsumen ingin mengecek status BI Checking / SLIK karena pengajuan KPR ditolak.', isActive: true, isLicensed: true },
  { id: 'asuransi', category: 'Asuransi', title: 'Klaim Asuransi Ditolak', description: 'Konsumen mengeluh karena klaim asuransi kesehatannya ditolak dengan alasan yang tidak jelas.', isActive: true, isLicensed: true },
  { id: 'investasi', category: 'Investasi', title: 'Investasi Bodong', description: 'Konsumen melaporkan adanya tawaran investasi dengan imbal hasil tidak wajar (ponzi).', isActive: true, isLicensed: false },
  { id: 'kartu-kredit', category: 'Perbankan', title: 'Tagihan Kartu Kredit', description: 'Konsumen keberatan dengan adanya biaya administrasi atau tagihan yang tidak dikenal di kartu kreditnya.', isActive: true, isLicensed: true },
];

const DEFAULT_CONSUMER_TYPES: PdktConsumerType[] = [
  { id: 'marah', name: 'Marah & Emosional', description: 'Konsumen sangat marah, emosional, dan tidak sabaran. Merasa dirugikan dan menuntut solusi instan. Sering menggunakan tanda seru.', difficulty: 'Hard', tone: 'Sangat marah, emosional, tidak sabar, dan sering menggunakan tanda seru.' },
  { id: 'bingung', name: 'Bingung & Gaptek', description: 'Konsumen kebingungan, tidak terlalu paham teknologi (gaptek), dan sering bertanya ulang untuk memastikan hal-hal dasar.', difficulty: 'Medium', tone: 'Bingung, ragu-ragu, dan menggunakan bahasa yang sangat awam.' },
  { id: 'kritis', name: 'Kritis & Detail', description: 'Konsumen sangat kritis, menanyakan detail aturan, dasar hukum, dan tidak mudah percaya dengan jawaban template. Ingin tahu SOP-nya.', difficulty: 'Hard', tone: 'Kritis, logis, menuntut detail, dan skeptis.' },
  { id: 'ramah', name: 'Ramah & Kooperatif', description: 'Konsumen sangat ramah, sopan, dan kooperatif dalam memberikan data yang diminta. Sangat menghargai bantuan petugas.', difficulty: 'Easy', tone: 'Sangat ramah, sopan, dan menghargai.' },
  { id: 'terburu-buru', name: 'Terburu-buru', description: 'Konsumen sedang dalam perjalanan atau rapat, ingin jawaban singkat dan cepat tanpa banyak basa-basi.', difficulty: 'Medium', tone: 'Singkat, padat, dan terkesan terburu-buru.' },
  { id: 'pasrah', name: 'Pasrah & Sedih', description: 'Konsumen merasa putus asa karena masalah keuangan ini, berbicara dengan nada sedih dan memohon bantuan.', difficulty: 'Medium', tone: 'Sedih, putus asa, dan memohon bantuan.' },
];

const DUMMY_PROFILES = [
  { name: 'Budi Santoso', email: 'budi.santoso88@gmail.com' },
  { name: 'Siti Aminah', email: 'siti.aminah_real@yahoo.com' },
  { name: 'Agus Setiawan', email: 'agus.setiawan.work@gmail.com' },
  { name: 'Dewi Lestari', email: 'dewi.lestari1990@outlook.com' },
  { name: 'Rudi Hartono', email: 'rudi.hartono.bisnis@gmail.com' },
];

// ── Helpers ─────────────────────────────────────────────

export function getScenarios(): PdktScenario[] {
  return DEFAULT_SCENARIOS;
}

export function getConsumerTypes(): PdktConsumerType[] {
  return DEFAULT_CONSUMER_TYPES;
}

export function generateRandomIdentity(): PdktIdentity {
  const profile = DUMMY_PROFILES[Math.floor(Math.random() * DUMMY_PROFILES.length)];
  return { name: profile.name, email: profile.email, city: 'Jakarta', bodyName: profile.name.split(' ')[0] };
}

export function normalizeSubject(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length > 60) return '';
  
  const leakyPatterns = [
    /penipuan/i, /fraud/i, /gagal login/i, /transaksi tidak dikenal/i,
    /slik/i, /terror/i, /penagihan/i, /pinjol/i, /pinjaman online/i,
    /investasi bodong/i, /asuransi/i, /leasing/i, /bank.*blokir/i,
    /rekening.*diblokir/i, /dana.*hilang/i, /uang.*raib/i
  ];
  
  for (const pattern of leakyPatterns) {
    if (pattern.test(trimmed)) return '';
  }
  return trimmed;
}

export function parseJsonFromModelText(raw: string): any {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1].trim()); } catch { /* fallthrough */ } }
  const bracketMatch = trimmed.match(/\{[\s\S]*\}/);
  if (bracketMatch?.[0]) { return JSON.parse(bracketMatch[0]); }
  throw new Error('Tidak ada data JSON valid dari model.');
}

export function isTransientAiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('500') ||
    message.includes('503') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('sedang sibuk') ||
    message.includes('kesalahan koneksi') ||
    message.includes('temporarily unavailable')
  );
}

export function renderTemplate(body: string, identity: PdktIdentity, pattern: ResolvedConsumerNameMentionPattern): string {
  const text = body.replace(/\{\{consumer_name\}\}/g, '').trim();
  
  if (pattern === 'none') return text;

  const name = identity.name;
  
  if (pattern === 'upfront') {
    return `Halo, saya ${name}.\n\n${text}`;
  } else if (pattern === 'late') {
    return `${text}\n\nSalam,\n${name}`;
  } else {
    // Middle: try to find a middle spot (between paragraphs) or just append
    const paragraphs = text.split('\n\n');
    if (paragraphs.length >= 2) {
      const mid = Math.floor(paragraphs.length / 2);
      paragraphs.splice(mid, 0, `Oya, saya ${name} mau menambahkan sedikit detail lagi.`);
      return paragraphs.join('\n\n');
    }
    return `${text}\n\n(Saya ${name})`;
  }
}

export function getRealisticWritingInstruction(mode: WritingStyleMode): string {
  if (mode !== 'realistic') return "";

  return `
    GAYA PENULISAN REALISTIS (WAJIB):
    - Tambahkan minimal 2 dan maksimal 5 typo (salah ketik) acak pada kata-kata di dalam email.
    - Gunakan CAPSLOCK pada 1 hingga 3 kata atau frasa pendek untuk menunjukkan penekanan emosi atau kebingungan.
    - Gunakan minimal 3 kata atau ungkapan bahasa informal/bahasa sehari-hari yang tidak baku.
    - Sertakan minimal 1 bagian di mana Anda menjelaskan masalah secara sedikit berbelit-belit atau mengulang poin yang sama untuk menunjukkan kesulitan dalam menjelaskan masalah.
    - Meskipun gaya penulisan tidak sempurna, pastikan informasi inti keluhan (jenis masalah, nama LJK, dan dampak) tetap dapat diidentifikasi.
  `;
}

export function getConsumerNameMentionInstruction(pattern: ResolvedConsumerNameMentionPattern): string {
  switch (pattern) {
    case 'upfront':
      return 'ATURAN NAMA KONSUMEN: Anda boleh menyebut nama di awal email, termasuk pada salam pembuka atau paragraf pertama.';
    case 'middle':
      return 'ATURAN NAMA KONSUMEN: Jangan sebut nama di awal email atau salam pembuka. Jika nama muncul, letakkan di bagian tengah isi email.';
    case 'late':
      return 'ATURAN NAMA KONSUMEN: Jangan sebut nama di awal email atau bagian tengah. Jika nama muncul, letakkan menjelang akhir email atau dekat penutup.';
    case 'none':
      return 'ATURAN NAMA KONSUMEN: Jangan sebut nama Anda sama sekali di salam, body, maupun penutup email. Jangan mengarang nama konsumen jika nama tidak disebut.';
  }
}

export function getCompanyNameInstruction(scenario?: PdktScenario): string {
  if (!scenario?.isLicensed) {
    return `1. PENAMAAN PERUSAHAAN: WAJIB mengarang NAMA entitas/perusahaan fiktif yang diadukan. JANGAN menggunakan kata "Bank", "Asuransi", atau "Sekuritas" karena entitas ilegal tidak berhak menggunakan nama tersebut. Contoh: "Pinjaman Kilat Nusantara", "Dana Cepat 88", "Investasi Cuan Jaya".`;
  }

  const category = SCENARIO_COMPANY_CATEGORY_MAP[scenario.title] || 'Perbankan';
  const names = LICENSED_COMPANY_NAMES[category] || [];
  const namesList = names.map(n => `- ${n}`).join('\n');

  return `1. PENAMAAN PERUSAHAAN: Gunakan SALAH SATU NAMA RESMI perusahaan berikut untuk LJK yang diadukan:\n${namesList}\nPilih salah satu nama dari daftar di atas. JANGAN mengarang nama perusahaan lain.`;
}

export function getSystemInstruction(config: PdktSessionConfig, hasCustomImages: boolean): string {
  const scenario = config.scenarios[0];
  const scenarioDescription = scenario 
    ? `[${scenario.category}] ${scenario.title}: ${scenario.description}`
    : "Tidak ada skenario spesifik.";

  const templateGuidance = scenario?.sampleEmailTemplate?.body 
    ? `TEMPLATE REFERENSI: Anda bisa merujuk pada gaya bahasa template berikut, namun buatlah versi yang lebih panjang dan bertele-tele:\n"${scenario.sampleEmailTemplate.body}"`
    : "";

  let imageInstruction: string;
  if (hasCustomImages) {
    imageInstruction = "User (Program) sudah melampirkan bukti gambar secara manual. Fokus saja pada cerita keluhannya.";
  } else if (config.enableImageGeneration) {
    imageInstruction = "Buatlah 1 sampai 3 prompt visual (deskripsi gambar) untuk bukti lampiran.";
  } else {
    imageInstruction = "JANGAN membuat prompt gambar visual apapun.";
  }

  const writingStyleMode = config.writingStyleMode || 'training';

  return `
    Anda adalah Simulator Konsumen untuk pelatihan Agen Email Kontak OJK 157.
    
    PROFIL PENGIRIM:
    Nama Akun: ${config.identity.name}
    Email: ${config.identity.email}
    Nama Panggilan/Asli: ${config.identity.bodyName || config.identity.name}
    Kota Domisili: ${config.identity.city}

    PENTING: Gunakan profil di atas secara KONSISTEN.
    ${getConsumerNameMentionInstruction(config.resolvedConsumerNameMentionPattern)}
    ${config.resolvedConsumerNameMentionPattern === 'none' ? 'Jangan menyebut nama diri Anda sama sekali.' : ''}
    
    KARAKTER: ${config.consumerType.name} (${config.consumerType.description})
    
    MASALAH: ${scenarioDescription}
    ${templateGuidance}
    ${imageInstruction}
    ${getRealisticWritingInstruction(writingStyleMode)}
    
    ATURAN WAJIB:
    ${getCompanyNameInstruction(scenario)}
    2. GAYA PENULISAN: Buatlah isi email yang SANGAT PANJANG (500-1000 kata), BERTELE-TELE, dan PENUH DETAIL curhatan tidak relevan. Jangan gunakan bullet points. Gunakan 5-8 paragraf yang dipisahkan dengan baris kosong (\n\n). JANGAN menulis dalam 1 paragraf saja — setiap paragraf harus membahas aspek berbeda (kronologi, detail masalah, dampak emosional, harapan, dll).
    3. FORMAT OUTPUT: HANYA JSON.
    { 
      "subject": "Subjek singkat & samar (maks 6 kata), atau kosong.", 
      "body": "Paragraf 1...\n\nParagraf 2...\n\nParagraf 3...\n\nParagraf 4...\n\nParagraf 5...",
      "imagePrompts": ["Deskripsi gambar 1"]
    }
   `;
}

// ── AI Services ─────────────────────────────────────────

async function callAI(options: {
  model: string;
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  responseMimeType?: string;
  usageContext?: UsageContext;
  userId?: string;
}) {
  const { modelId, provider } = resolveModelProvider(options.model);
  const isOpenRouter = provider === 'openrouter';

  const payload = {
    model: modelId,
    systemInstruction: options.systemInstruction,
    contents: [{ role: 'user' as const, parts: [{ text: options.prompt }] }],
    temperature: options.temperature ?? 0.7,
    responseMimeType: options.responseMimeType,
    usageContext: options.usageContext,
    userId: options.userId,
  };

  return isOpenRouter
    ? await generateOpenRouterContent(payload)
    : await generateGeminiContent(payload);
}

export async function generateScenarioEmailTemplate(
  scenario: PdktScenario,
  config: PdktSessionConfig,
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; subject?: string; body?: string; error?: string }> {
  const modelId = config.selectedModel || "gemini-3.1-flash-lite";
  
  const systemInstruction = `
    Anda adalah Simulator Konsumen untuk pelatihan Agen Email Kontak OJK 157.
    Tugas Anda adalah membuat SATU CONTOH TEMPLATE EMAIL pengaduan berdasarkan skenario yang diberikan.
    
    ATURAN:
    ${getCompanyNameInstruction(scenario)}
    2. SUBJECT: Singkat (maks 6 kata), samar, tidak mengandung kata terlarang (fraud, penipuan, pinjol, dll).
    3. BODY: Gunakan placeholder {{consumer_name}} jika ingin menyebut nama diri sendiri.
    4. GAYA BAHASA: Sangat PANJANG (500-1000 kata), natural, bertele-tele, penuh detail kronologi curhatan, tanpa bullet points. Wajib 5-8 paragraf yang dipisahkan dengan baris kosong (\n\n). JANGAN menulis dalam 1 paragraf saja — setiap paragraf harus membahas aspek berbeda (kronologi awal, detail masalah, upaya yang sudah dilakukan, dampak emosional/finansial, harapan penyelesaian, dll).
    5. JANGAN menyertakan prompt gambar.
    6. JANGAN menyertakan identitas spesifik (kota, email asli) selain placeholder.
    
    FORMAT OUTPUT JSON:
    { "subject": "...", "body": "Paragraf 1...\n\nParagraf 2...\n\nParagraf 3...\n\nParagraf 4...\n\nParagraf 5..." }
  `;

  const prompt = `Buat template email panjang dan natural untuk skenario: [${scenario.category}] ${scenario.title}. Detail: ${scenario.description}. PENTING: Email harus 500-1000 kata, terdiri dari 5-8 paragraf terpisah (gunakan \\n\\n antar paragraf). Jangan tulis dalam 1 paragraf saja.`;

  const executeGeneration = async (retryPrompt?: string) => {
    const finalPrompt = retryPrompt ? `${prompt}\n\nREVISI: ${retryPrompt}` : prompt;
    const response = await callAI({
      model: modelId,
      prompt: finalPrompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext: usageContext || { module: 'pdkt', action: 'generate_template' },
      userId,
    });

    if (!response.success) {
      throw new Error(response.error || 'Gagal generate template.');
    }

    const responseText = response.text || "{}";
    const jsonResponse = parseJsonFromModelText(responseText);
    
    const subject = normalizeSubject(jsonResponse.subject);
    const body = jsonResponse.body || "";
    const wordCount = body.split(/\s+/).filter(Boolean).length;

    return { subject, body, wordCount };
  };

  try {
    let result = await executeGeneration();

    // Retry once if body is shorter than requested minimum.
    if (result.wordCount < 500) {
      result = await executeGeneration("Hasil sebelumnya terlalu pendek. Tolong buat jauh lebih panjang, detail, dan bertele-tele (target 500-1000 kata, minimal 500 kata, 5-8 paragraf terpisah dengan baris kosong, tanpa bullet points). Setiap paragraf harus membahas aspek berbeda.");
    }

    // Final validation after retry.
    if (result.wordCount < 500) {
      return { success: false, error: 'Hasil template terlalu pendek. Silakan klik Generate ulang untuk mencoba lagi.' };
    }

    return {
      success: true,
      subject: result.subject,
      body: result.body
    };
  } catch (error: any) {
    console.error('[PDKT] Template error:', error);
    return { success: false, error: error.message || 'Gagal generate template.' };
  }
}

export async function initializeEmailSession(
  config: PdktSessionConfig,
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; message?: EmailMessage; error?: string }> {
  const scenario = config.scenarios[0];
  if (!scenario) return { success: false, error: "Skenario tidak ditemukan." };

  // Handle Forced Template
  if (scenario.alwaysUseSampleEmail && scenario.sampleEmailTemplate?.body) {
    const renderedBody = renderTemplate(
      scenario.sampleEmailTemplate.body, 
      config.identity, 
      config.resolvedConsumerNameMentionPattern
    );
    return {
      success: true,
      message: {
        id: Date.now().toString(),
        from: config.identity.email,
        to: "konsumen@ojk.go.id",
        subject: scenario.sampleEmailTemplate.subject || '',
        body: renderedBody,
        timestamp: new Date().toISOString(),
        isAgent: false,
        attachments: [],
      },
    };
  }

  // AI Generation Flow
  const customAttachments: string[] = scenario.attachmentImages || [];
  const hasCustomImages = customAttachments.length > 0;
  const model = config.selectedModel || "gemini-3.1-flash-lite";

  const prompt = `Tulis email pengaduan pertama Anda sekarang. Masalah: ${scenario.title}. Karakter: ${config.consumerType.name}. PENTING: Email harus 500-1000 kata, terdiri dari 5-8 paragraf terpisah (gunakan \\n\\n antar paragraf). Jangan tulis dalam 1 paragraf saja.`;

  try {
    const response = await callAI({
      model,
      prompt,
      systemInstruction: getSystemInstruction(config, hasCustomImages),
      responseMimeType: "application/json",
      usageContext: usageContext || { module: 'pdkt', action: 'init_email' },
      userId,
    });

    if (!response.success) {
      return { success: false, error: response.error || 'Layanan AI tidak tersedia.' };
    }

    const responseText = response.text || "{}";
    const jsonResponse = parseJsonFromModelText(responseText);

    return {
      success: true,
      message: {
        id: Date.now().toString(),
        from: config.identity.email,
        to: "konsumen@ojk.go.id",
        subject: normalizeSubject(jsonResponse.subject),
        body: jsonResponse.body || "Gagal memuat isi email.",
        timestamp: new Date().toISOString(),
        isAgent: false,
        attachments: customAttachments,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Gagal memulai sesi email." };
  }
}

export async function evaluateAgentResponse(
  config: PdktSessionConfig,
  emails: EmailMessage[],
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; score?: number; feedback?: string; typos?: string[]; clarityIssues?: string[]; contentGaps?: string[]; error?: string }> {
  const modelId = config.selectedModel || "gemini-3.1-flash-lite";
  
  const lastAgentReply = [...emails].reverse().find(e => e.isAgent);
  const firstInbound = emails.find(e => !e.isAgent);
  
  if (!lastAgentReply || !firstInbound) {
    return { success: false, error: "Missing email context for evaluation." };
  }

  const evaluationPrompt = `
    Anda adalah SUPERVISOR QA OJK.
    
    KELUHAN KONSUMEN:
    "${firstInbound.body}"
    
    JAWABAN AGEN:
    "${lastAgentReply.body}"
    
    TUGAS: Nilai jawaban agen (Skor Awal 100).
    1. TYPO: Salah ketik.
    2. CLARITY: Apakah mudah dimengerti? Struktur logis?
    3. RELEVANSI: Apakah menjawab masalah inti?
    
    OUTPUT JSON:
    { "score": number, "typos": string[], "clarityIssues": string[], "contentGaps": string[], "feedback": string }
  `;

  let lastError: any;
  const retryDelaysMs = [250, 500];

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      const response = await callAI({
        model: modelId,
        prompt: evaluationPrompt,
        systemInstruction: "Anda adalah supervisor QA yang memberikan penilaian objektif dalam format JSON.",
        responseMimeType: "application/json",
        temperature: 0.2,
        usageContext: usageContext || { module: 'pdkt', action: 'evaluate_response' },
        userId,
      });

      if (!response.success) throw new Error(response.error || "Gagal mendapatkan respons AI.");
      
      const evalText = response.text || "{}";
      const result = parseJsonFromModelText(evalText);

      return {
        success: true,
        score: result.score ?? 0,
        typos: result.typos || [],
        clarityIssues: result.clarityIssues || [],
        contentGaps: result.contentGaps || [],
        feedback: result.feedback || "Tidak ada masukan."
      };
    } catch (error) {
      lastError = error;
      if (!isTransientAiError(error) || attempt === retryDelaysMs.length) break;

      await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]));
    }
  }

  return { success: false, error: lastError?.message || "Gagal mendapatkan respons AI." };
}

// ── Database Services ───────────────────────────────────

export async function fetchMailboxItems(supabaseClient: any, userId: string) {
  const { data, error } = await supabaseClient
    .from('pdkt_mailbox_items')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('last_activity_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createMailboxItem(
  supabaseClient: any,
  payload: {
    client_request_id?: string;
    sender_name: string;
    sender_email: string;
    subject: string;
    snippet: string;
    scenario_snapshot?: any;
    config_snapshot?: any;
    inbound_email?: any;
  }
) {
  const { data, error } = await supabaseClient.rpc('submit_pdkt_mailbox_batch', {
    p_client_request_id: payload.client_request_id || null,
    p_sender_name: payload.sender_name,
    p_sender_email: payload.sender_email,
    p_subject: payload.subject,
    p_snippet: payload.snippet,
    p_scenario_snapshot: payload.scenario_snapshot,
    p_config_snapshot: payload.config_snapshot,
    p_inbound_email: payload.inbound_email,
  });

  if (error) throw error;
  return data;
}

export async function softDeleteMailboxItem(supabaseClient: any, id: string, userId: string) {
  const { data, error } = await supabaseClient
    .from('pdkt_mailbox_items')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
  return data;
}

export async function submitMailboxReply(
  supabaseClient: any,
  payload: {
    mailboxId: string;
    reply?: any;
    timeTaken: number;
  }
) {
  const { data: historyId, error } = await supabaseClient.rpc('submit_pdkt_mailbox_reply', {
    p_mailbox_id: payload.mailboxId,
    p_agent_reply: payload.reply,
    p_time_taken: payload.timeTaken,
  });

  if (error) throw error;

  return historyId;
}

export async function processPdktEvaluation(historyId: string, userId: string): Promise<any> {
  const adminClient = createAdminClient();

  const { data: history, error: fetchError } = await adminClient
    .from('pdkt_history')
    .select('*')
    .eq('id', historyId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !history) {
    throw new Error('PDKT History not found');
  }

  if (history.evaluation_status === 'completed' && history.evaluation) {
    return history.evaluation;
  }

  const nowIso = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from('pdkt_history')
    .update({
      evaluation_status: 'processing',
      evaluation_started_at: nowIso,
      evaluation_error: null,
    })
    .eq('id', historyId)
    .eq('user_id', userId)
    .or(`evaluation_started_at.is.null,evaluation_started_at.lt.${staleThreshold}`)
    .neq('evaluation_status', 'completed')
    .select('id');

  if (claimError) {
    throw new Error('Failed to claim evaluation');
  }

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from('pdkt_history')
      .select('evaluation_status, evaluation')
      .eq('id', historyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (current?.evaluation_status === 'completed') {
      if (current.evaluation) return current.evaluation;
      throw new Error('Evaluation marked completed but no results found');
    }

    throw new Error('Evaluation is already in progress');
  }

  try {
    const config = history.config;
    const emails = history.emails;

    const result = await evaluateAgentResponse(
      config,
      emails,
      { module: 'pdkt', action: 'async_evaluate_agent_response' },
      userId
    );

    if (!result.success) {
      throw new Error(result.error || 'Evaluation failed without message');
    }

    const evaluationData = {
      score: result.score,
      feedback: result.feedback,
      typos: result.typos,
      clarityIssues: result.clarityIssues,
      contentGaps: result.contentGaps,
    };

    const { data: saved, error: updateEndError } = await adminClient
      .from('pdkt_history')
      .update({
        evaluation: evaluationData,
        evaluation_status: 'completed',
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq('id', historyId)
      .eq('evaluation_started_at', nowIso)
      .select('id');

    if (updateEndError) {
      throw new Error('Failed to save evaluation results');
    }

    if (!saved || saved.length === 0) {
      console.warn(`[processPdktEvaluation] Lease lost before save for history: ${historyId}`);
      return evaluationData;
    }

    return evaluationData;
  } catch (err: any) {
    console.error(`[PDKT] Error evaluating history ${historyId}:`, err);
    await adminClient
      .from('pdkt_history')
      .update({
        evaluation_status: 'failed',
        evaluation_error: err?.message || String(err),
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq('id', historyId)
      .eq('evaluation_started_at', nowIso);

    throw err;
  }
}
