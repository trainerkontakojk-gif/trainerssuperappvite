import {
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
  EmailMessage,
  PdktSessionConfig,
  WritingStyleMode,
  ResolvedConsumerNameMentionPattern,
} from "@trainers/types";
import { generateGeminiContent } from "../lib/gemini";
import { generateOpenRouterContent } from "../lib/openrouter";
import { resolveModelProvider } from "../lib/ai-models";
import { UsageContext } from "../lib/ai-usage";
import { createAdminClient } from "../lib/supabase";
import {
  LICENSED_COMPANY_NAMES,
  SCENARIO_COMPANY_CATEGORY_MAP,
} from "./pdkt-company-names";
import { resolvePdktTemplateBody } from "./pdkt-template-resolver";
import { generatePdktScenarioImages } from "./pdkt/image-generation";
import { parseJsonFromModelText } from "../lib/ai-json";
export { parseJsonFromModelText };
import {
  buildPdktEmailGenerationPolicy,
  buildPdktSystemInstruction,
  renderPdktIdentityByMentionPattern,
  validatePdktEmailPolicyCompliance,
  buildPdktRetryHint,
  getRealisticWritingInstruction as policyGetRealisticWritingInstruction,
  getConsumerNameMentionInstruction as policyGetConsumerNameMentionInstruction,
  getCompanyNameInstruction as policyGetCompanyNameInstruction,
} from "./pdkt-email-policy";

// ── Constants ───────────────────────────────────────────

const DEFAULT_SCENARIOS: PdktScenario[] = [
  {
    id: "pinjol",
    category: "Pinjol",
    title: "Pinjol Ilegal",
    description:
      "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.",
    isActive: true,
    isLicensed: false,
  },
  {
    id: "penipuan",
    category: "Penipuan",
    title: "Penipuan Undian",
    description:
      "Konsumen menerima pesan menang undian dan diminta transfer pajak pemenang.",
    isActive: true,
    isLicensed: false,
  },
  {
    id: "slik",
    category: "SLIK",
    title: "Pengecekan SLIK",
    description:
      "Konsumen ingin mengecek status BI Checking / SLIK karena pengajuan KPR ditolak.",
    isActive: true,
    isLicensed: true,
  },
  {
    id: "asuransi",
    category: "Asuransi",
    title: "Klaim Asuransi Ditolak",
    description:
      "Konsumen mengeluh karena klaim asuransi kesehatannya ditolak dengan alasan yang tidak jelas.",
    isActive: true,
    isLicensed: true,
  },
  {
    id: "investasi",
    category: "Investasi",
    title: "Investasi Bodong",
    description:
      "Konsumen melaporkan adanya tawaran investasi dengan imbal hasil tidak wajar (ponzi).",
    isActive: true,
    isLicensed: false,
  },
  {
    id: "kartu-kredit",
    category: "Perbankan",
    title: "Tagihan Kartu Kredit",
    description:
      "Konsumen keberatan dengan adanya biaya administrasi atau tagihan yang tidak dikenal di kartu kreditnya.",
    isActive: true,
    isLicensed: true,
  },
];

const DEFAULT_CONSUMER_TYPES: PdktConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    description:
      "Konsumen sangat marah, emosional, dan tidak sabaran. Merasa dirugikan dan menuntut solusi instan. Sering menggunakan tanda seru.",
    difficulty: "Hard",
    tone: "Sangat marah, emosional, tidak sabar, dan sering menggunakan tanda seru.",
  },
  {
    id: "bingung",
    name: "Bingung & Gaptek",
    description:
      "Konsumen kebingungan, tidak terlalu paham teknologi (gaptek), dan sering bertanya ulang untuk memastikan hal-hal dasar.",
    difficulty: "Medium",
    tone: "Bingung, ragu-ragu, dan menggunakan bahasa yang sangat awam.",
  },
  {
    id: "kritis",
    name: "Kritis & Detail",
    description:
      "Konsumen sangat kritis, menanyakan detail aturan, dasar hukum, dan tidak mudah percaya dengan jawaban template. Ingin tahu SOP-nya.",
    difficulty: "Hard",
    tone: "Kritis, logis, menuntut detail, dan skeptis.",
  },
  {
    id: "ramah",
    name: "Ramah & Kooperatif",
    description:
      "Konsumen sangat ramah, sopan, dan kooperatif dalam memberikan data yang diminta. Sangat menghargai bantuan petugas.",
    difficulty: "Easy",
    tone: "Sangat ramah, sopan, dan menghargai.",
  },
  {
    id: "terburu-buru",
    name: "Terburu-buru",
    description:
      "Konsumen sedang dalam perjalanan atau rapat, ingin jawaban singkat dan cepat tanpa banyak basa-basi.",
    difficulty: "Medium",
    tone: "Singkat, padat, dan terkesan terburu-buru.",
  },
  {
    id: "pasrah",
    name: "Pasrah & Sedih",
    description:
      "Konsumen merasa putus asa karena masalah keuangan ini, berbicara dengan nada sedih dan memohon bantuan.",
    difficulty: "Medium",
    tone: "Sedih, putus asa, dan memohon bantuan.",
  },
];

const DUMMY_CITIES = [
  "Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Timur", "Jakarta Utara",
  "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Tangerang",
  "Depok", "Bekasi", "Bogor", "Yogyakarta", "Malang", "Denpasar", "Balikpapan",
  "Samarinda", "Banjarmasin", "Pontianak", "Manado", "Padang", "Pekanbaru",
];

const DUMMY_PROFILES = [
  { name: "Budi Santoso", email: "budi.santoso88@gmail.com" },
  { name: "Siti Aminah", email: "siti.aminah_real@yahoo.com" },
  { name: "Agus Setiawan", email: "agus.setiawan.work@gmail.com" },
  { name: "Dewi Lestari", email: "dewi.lestari1990@outlook.com" },
  { name: "Rudi Hartono", email: "rudi.hartono.bisnis@gmail.com" },
  { name: "Ratna Sari", email: "ratna.sari.cantik@gmail.com" },
  { name: "Eko Prasetyo", email: "eko.prasetyo77@yahoo.co.id" },
  { name: "Sri Wahyuni", email: "sri.wahyuni.guru@gmail.com" },
  { name: "Hendra Wijaya", email: "hendra.wijaya.store@gmail.com" },
  { name: "Nurul Hidayah", email: "nurul.hidayah.family@gmail.com" },
  { name: "Bambang Pamungkas", email: "bambang.pamungkas.bola@gmail.com" },
  { name: "Lina Marlina", email: "lina.marlina.shop@gmail.com" },
  { name: "Dedi Supriyadi", email: "dedi.supriyadi.teknik@gmail.com" },
  { name: "Rina Wati", email: "rina.wati.kue@gmail.com" },
  { name: "Fajar Nugroho", email: "fajar.nugroho.dev@gmail.com" },
  { name: "Yanti Susanti", email: "yanti.susanti.salon@gmail.com" },
  { name: "Iwan Fals", email: "iwan.fals.fans@gmail.com" },
  { name: "Maya Putri", email: "maya.putri.travel@gmail.com" },
  { name: "Reza Rahadian", email: "reza.rahadian.actor@gmail.com" },
  { name: "Indah Permatasari", email: "indah.permatasari.model@gmail.com" },
];

// ── Helpers ─────────────────────────────────────────────

export function getScenarios(): PdktScenario[] {
  return DEFAULT_SCENARIOS;
}

export function getConsumerTypes(): PdktConsumerType[] {
  return DEFAULT_CONSUMER_TYPES;
}

export function generateRandomIdentity(): PdktIdentity {
  const profile =
    DUMMY_PROFILES[Math.floor(Math.random() * DUMMY_PROFILES.length)];
  const city = DUMMY_CITIES[Math.floor(Math.random() * DUMMY_CITIES.length)];
  return {
    name: profile.name,
    email: profile.email,
    city,
    bodyName: profile.name.split(" ")[0],
  };
}

export function normalizeSubject(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length > 60) return "";

  const leakyPatterns = [
    /penipuan/i,
    /fraud/i,
    /gagal login/i,
    /transaksi tidak dikenal/i,
    /slik/i,
    /terror/i,
    /penagihan/i,
    /pinjol/i,
    /pinjaman online/i,
    /investasi bodong/i,
    /asuransi/i,
    /leasing/i,
    /bank.*blokir/i,
    /rekening.*diblokir/i,
    /dana.*hilang/i,
    /uang.*raib/i,
  ];

  for (const pattern of leakyPatterns) {
    if (pattern.test(trimmed)) return "";
  }
  return trimmed;
}

export function isTransientAiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("503") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("sedang sibuk") ||
    message.includes("kesalahan koneksi") ||
    message.includes("temporarily unavailable")
  );
}

export function getRealisticWritingInstruction(mode: WritingStyleMode): string {
  return policyGetRealisticWritingInstruction(mode);
}

export function getConsumerNameMentionInstruction(
  pattern: ResolvedConsumerNameMentionPattern,
): string {
  return policyGetConsumerNameMentionInstruction(pattern);
}

export function getCompanyNameInstruction(scenario?: PdktScenario): string {
  return policyGetCompanyNameInstruction(scenario);
}

export function getSystemInstruction(
  config: PdktSessionConfig,
  hasCustomImages: boolean,
): string {
  const scenario = config.scenarios[0];
  if (!scenario) return "Tidak ada skenario.";
  const policy = buildPdktEmailGenerationPolicy(config, scenario, "initial_email");
  return buildPdktSystemInstruction(policy, hasCustomImages);
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
  const isOpenRouter = provider === "openrouter";

  const payload = {
    model: modelId,
    systemInstruction: options.systemInstruction,
    contents: [{ role: "user" as const, parts: [{ text: options.prompt }] }],
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
): Promise<{
  success: boolean;
  subject?: string;
  body?: string;
  error?: string;
}> {
  // Handle Forced Sample Template if specified in scenario
  if (scenario.alwaysUseSampleEmail && scenario.sampleEmailTemplate?.body) {
    const resolved = resolvePdktTemplateBody({
      subject: scenario.sampleEmailTemplate.subject || "",
      body: scenario.sampleEmailTemplate.body,
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    if (resolved.leftoverPlaceholders.length > 0) {
      return {
        success: false,
        error: `Template masih mengandung placeholder: ${resolved.leftoverPlaceholders.join(", ")}`,
      };
    }

    return {
      success: true,
      subject: resolved.subject,
      body: resolved.body,
    };
  }

  const modelId = config.selectedModel || "gemini-3.1-flash-lite";
  const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
  const systemInstruction = buildPdktSystemInstruction(policy);

  const prompt = `Buat template email panjang dan natural untuk skenario: [${scenario.category}] ${scenario.title}. Detail: ${scenario.description}. PENTING: Email harus 500-1000 kata, terdiri dari 5-8 paragraf terpisah (gunakan \\n\\n antar paragraf). Jangan tulis dalam 1 paragraf saja.`;

  const executeGeneration = async (retryPrompt?: string) => {
    const finalPrompt = retryPrompt
      ? `${prompt}\n\nREVISI: ${retryPrompt}`
      : prompt;
    const response = await callAI({
      model: modelId,
      prompt: finalPrompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext: usageContext || {
        module: "pdkt",
        action: "generate_template",
      },
      userId,
    });

    if (!response.success) {
      throw new Error(response.error || "Gagal generate template.");
    }

    const responseText = response.text || "{}";
    const jsonResponse = parseJsonFromModelText(responseText);

    const resolved = resolvePdktTemplateBody({
      subject: jsonResponse.subject || "",
      body: jsonResponse.body || "",
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    const subject = normalizeSubject(resolved.subject) || resolved.subject;
    const body = resolved.body;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const violations = validatePdktEmailPolicyCompliance({ subject, body }, policy);

    return {
      subject,
      body,
      wordCount,
      leftoverPlaceholders: resolved.leftoverPlaceholders,
      violations,
    };
  };

  try {
    let result = await executeGeneration();

    if (
      result.leftoverPlaceholders.length > 0 ||
      result.wordCount < 500 ||
      result.violations.length > 0
    ) {
      const placeholderHint =
        result.leftoverPlaceholders.length > 0
          ? `Template sebelumnya masih mengandung placeholder ${result.leftoverPlaceholders.join(", ")}. Ganti semuanya dengan teks konkret tanpa tanda kurung siku atau kurung kurawal.`
          : "";
      const lengthHint =
        result.wordCount < 500
          ? "Template sebelumnya terlalu pendek. Buat jauh lebih panjang, detail, dan bertele-tele (target 500-1000 kata, minimal 500 kata, 5-8 paragraf terpisah dengan baris kosong, tanpa bullet points)."
          : "";
      const violationHint =
        result.violations.length > 0
          ? buildPdktRetryHint(result.violations, policy)
          : "";

      try {
        result = await executeGeneration(
          [placeholderHint, lengthHint, violationHint].filter(Boolean).join(" "),
        );
      } catch (err) {
        console.warn("[PDKT] Template retry failed, using first attempt:", err);
      }
    }

    if (result.leftoverPlaceholders.length > 0) {
      return {
        success: false,
        error: `Template masih mengandung placeholder: ${result.leftoverPlaceholders.join(", ")}`,
      };
    }

    if (result.wordCount < 500) {
      return {
        success: false,
        error:
          "Hasil template terlalu pendek. Silakan klik Generate ulang untuk mencoba lagi.",
      };
    }

    if (result.violations.length > 0) {
      return {
        success: false,
        error:
          "Hasil template masih melanggar aturan nama atau gaya penulisan. Silakan klik Generate ulang untuk mencoba lagi.",
      };
    }

    return {
      success: true,
      subject: result.subject,
      body: result.body,
    };
  } catch (error: any) {
    console.error("[PDKT] Template error:", error);
    return {
      success: false,
      error: error.message || "Gagal generate template.",
    };
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
    const rendered = resolvePdktTemplateBody({
      subject: scenario.sampleEmailTemplate.subject || "",
      body: scenario.sampleEmailTemplate.body,
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    if (rendered.leftoverPlaceholders.length > 0) {
      return {
        success: false,
        error: `Template masih mengandung placeholder: ${rendered.leftoverPlaceholders.join(", ")}`,
      };
    }

    const attachments = scenario.attachmentImages || [];
    return {
      success: true,
      message: {
        id: Date.now().toString(),
        from: config.identity.email,
        to: "konsumen@ojk.go.id",
        subject: rendered.subject,
        body: rendered.body,
        timestamp: new Date().toISOString(),
        isAgent: false,
        attachments,
        attachmentSource: attachments.length > 0 ? "manual" : "none",
      },
    };
  }

  // AI Generation Flow
  const customAttachments: string[] = scenario.attachmentImages || [];
  const hasCustomImages = customAttachments.length > 0;
  const model = config.selectedModel || "gemini-3.1-flash-lite";
  const policy = buildPdktEmailGenerationPolicy(
    config,
    scenario,
    "initial_email",
  );
  const systemInstruction = buildPdktSystemInstruction(policy, hasCustomImages);

  const prompt = `Tulis email pengaduan pertama Anda sekarang. Masalah: ${scenario.title}. Karakter: ${config.consumerType.name}. PENTING: Email harus 500-1000 kata, terdiri dari 5-8 paragraf terpisah (gunakan \\n\\n antar paragraf). Jangan tulis dalam 1 paragraf saja.`;

  const executeSessionGeneration = async (retryPrompt?: string) => {
    const finalPrompt = retryPrompt
      ? `${prompt}\n\nREVISI: ${retryPrompt}`
      : prompt;
    const response = await callAI({
      model,
      prompt: finalPrompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext: usageContext || { module: "pdkt", action: "init_email" },
      userId,
    });

    if (!response.success) {
      throw new Error(response.error || "Layanan AI tidak tersedia.");
    }

    const responseText = response.text || "{}";
    const jsonResponse = parseJsonFromModelText(responseText);

    const { subject, body } = renderPdktIdentityByMentionPattern(
      jsonResponse.body || "",
      jsonResponse.subject || "",
      policy,
    );

    const normalizedSubject = normalizeSubject(subject) || subject;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const violations = validatePdktEmailPolicyCompliance(
      { subject: normalizedSubject, body },
      policy,
    );

    return {
      subject: normalizedSubject,
      body,
      wordCount,
      violations,
    };
  };

  try {
    let result = await executeSessionGeneration();

    if (result.violations.length > 0 || result.wordCount < 500) {
      const violationHint =
        result.violations.length > 0
          ? buildPdktRetryHint(result.violations, policy)
          : "";
      const lengthHint =
        result.wordCount < 500
          ? "Email terlalu pendek. Buat jauh lebih panjang (target 500-1000 kata, minimal 500 kata, 5-8 paragraf terpisah dengan baris kosong, tanpa bullet points)."
          : "";

      try {
        result = await executeSessionGeneration(
          [violationHint, lengthHint].filter(Boolean).join(" "),
        );
      } catch (err) {
        console.warn(
          "[PDKT] Session init retry failed, using first attempt:",
          err,
        );
      }
    }

    if (result.violations.length > 0) {
      return {
        success: false,
        error:
          "Email awal masih melanggar aturan nama atau gaya penulisan. Silakan coba lagi.",
      };
    }

    // Resolve attachments: Manual has priority over AI
    let attachments = customAttachments;
    let attachmentSource: "manual" | "ai" | "none" = hasCustomImages
      ? "manual"
      : "none";

    if (!hasCustomImages && config.enableImageGeneration) {
      try {
        const imageResult = await generatePdktScenarioImages(
          scenario,
          { subject: result.subject, body: result.body },
          config,
          usageContext || { module: "pdkt", action: "generate_ai_images" },
          userId,
        );

        if (imageResult.success && imageResult.images.length > 0) {
          attachments = imageResult.images;
          attachmentSource = "ai";
        }
      } catch (imgError) {
        console.warn(
          "[PDKT] AI Image generation failed, continuing with no attachments:",
          imgError,
        );
      }
    }

    return {
      success: true,
      message: {
        id: Date.now().toString(),
        from: config.identity.email,
        to: "konsumen@ojk.go.id",
        subject: result.subject,
        body: result.body,
        timestamp: new Date().toISOString(),
        isAgent: false,
        attachments,
        attachmentSource,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Gagal memulai sesi email.",
    };
  }
}

export async function evaluateAgentResponse(
  config: PdktSessionConfig,
  emails: EmailMessage[],
  usageContext?: UsageContext,
  userId?: string,
): Promise<{
  success: boolean;
  score?: number;
  feedback?: string;
  typos?: string[];
  clarityIssues?: string[];
  contentGaps?: string[];
  error?: string;
}> {
  const modelId = config.selectedModel || "gemini-3.1-flash-lite";

  const lastAgentReply = [...emails].reverse().find((e) => e.isAgent);
  const firstInbound = emails.find((e) => !e.isAgent);

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
        systemInstruction:
          "Anda adalah supervisor QA yang memberikan penilaian objektif dalam format JSON.",
        responseMimeType: "application/json",
        temperature: 0.2,
        usageContext: usageContext || {
          module: "pdkt",
          action: "evaluate_response",
        },
        userId,
      });

      if (!response.success)
        throw new Error(response.error || "Gagal mendapatkan respons AI.");

      const evalText = response.text || "{}";
      const result = parseJsonFromModelText(evalText);

      return {
        success: true,
        score: result.score ?? 0,
        typos: result.typos || [],
        clarityIssues: result.clarityIssues || [],
        contentGaps: result.contentGaps || [],
        feedback: result.feedback || "Tidak ada masukan.",
      };
    } catch (error) {
      lastError = error;
      if (!isTransientAiError(error) || attempt === retryDelaysMs.length) break;

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt]),
      );
    }
  }

  return {
    success: false,
    error: lastError?.message || "Gagal mendapatkan respons AI.",
  };
}

// ── Database Services ───────────────────────────────────

export async function fetchMailboxItems(supabaseClient: any, userId: string) {
  const { data, error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .order("last_activity_at", { ascending: false });

  if (error) throw new Error(error.message || "Gagal mengambil data mailbox.");

  if (!data || data.length === 0) {
    console.warn(
      "[PDKT] Empty mailbox for user:", userId,
      "- verify RLS policies, user_id mismatch, or data existence",
    );
  }

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
  },
) {
  const { data, error } = await supabaseClient.rpc(
    "submit_pdkt_mailbox_batch",
    {
      p_client_request_id: payload.client_request_id || null,
      p_sender_name: payload.sender_name,
      p_sender_email: payload.sender_email,
      p_subject: payload.subject,
      p_snippet: payload.snippet,
      p_scenario_snapshot: payload.scenario_snapshot,
      p_config_snapshot: payload.config_snapshot,
      p_inbound_email: payload.inbound_email,
    },
  );

  if (error) throw new Error(error.message || "Gagal membuat item mailbox.");
  return data;
}

export async function softDeleteMailboxItem(
  supabaseClient: any,
  id: string,
  userId: string,
) {
  const { data, error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message || "Gagal menghapus item mailbox.");
  return data;
}

export async function submitMailboxReply(
  supabaseClient: any,
  payload: {
    mailboxId: string;
    reply?: any;
    timeTaken: number;
  },
) {
  const { data: historyId, error } = await supabaseClient.rpc(
    "submit_pdkt_mailbox_reply",
    {
      p_mailbox_id: payload.mailboxId,
      p_agent_reply: payload.reply,
      p_time_taken: payload.timeTaken,
    },
  );

  if (error) throw new Error(error.message || "Gagal mengirim balasan mailbox.");
  return historyId;
}

export async function processPdktEvaluation(
  historyId: string,
  userId: string,
): Promise<any> {
  const adminClient = createAdminClient();

  const { data: history, error: fetchError } = await adminClient
    .from("pdkt_history")
    .select("*")
    .eq("id", historyId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !history) {
    throw new Error("PDKT History not found");
  }

  if (history.evaluation_status === "completed" && history.evaluation) {
    return history.evaluation;
  }

  const nowIso = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from("pdkt_history")
    .update({
      evaluation_status: "processing",
      evaluation_started_at: nowIso,
      evaluation_error: null,
    })
    .eq("id", historyId)
    .eq("user_id", userId)
    .or(
      `evaluation_started_at.is.null,evaluation_started_at.lt.${staleThreshold}`,
    )
    .neq("evaluation_status", "completed")
    .select("id");

  if (claimError) {
    throw new Error("Failed to claim evaluation");
  }

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from("pdkt_history")
      .select("evaluation_status, evaluation")
      .eq("id", historyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (current?.evaluation_status === "completed") {
      if (current.evaluation) return current.evaluation;
      throw new Error("Evaluation marked completed but no results found");
    }

    throw new Error("Evaluation is already in progress");
  }

  try {
    const config = history.config;
    const emails = history.emails;

    const result = await evaluateAgentResponse(
      config,
      emails,
      { module: "pdkt", action: "async_evaluate_agent_response" },
      userId,
    );

    if (!result.success) {
      throw new Error(result.error || "Evaluation failed without message");
    }

    const evaluationData = {
      score: result.score,
      feedback: result.feedback,
      typos: result.typos,
      clarityIssues: result.clarityIssues,
      contentGaps: result.contentGaps,
    };

    const { data: saved, error: updateEndError } = await adminClient
      .from("pdkt_history")
      .update({
        evaluation: evaluationData,
        evaluation_status: "completed",
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq("id", historyId)
      .eq("evaluation_started_at", nowIso)
      .select("id");

    if (updateEndError) {
      throw new Error("Failed to save evaluation results");
    }

    if (!saved || saved.length === 0) {
      console.warn(
        `[processPdktEvaluation] Lease lost before save for history: ${historyId}`,
      );
      return evaluationData;
    }

    return evaluationData;
  } catch (err: any) {
    console.error(`[PDKT] Error evaluating history ${historyId}:`, err);
    await adminClient
      .from("pdkt_history")
      .update({
        evaluation_status: "failed",
        evaluation_error: err?.message || String(err),
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq("id", historyId)
      .eq("evaluation_started_at", nowIso);

    throw err;
  }
}
