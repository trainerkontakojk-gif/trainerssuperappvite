import { z } from "zod";
import { DEFAULT_AI_MODEL_ID } from "./ai-models";
import type { SimulationSubjectSnapshot } from "./simulation-subject";

// Public copy only. Provider/database detail belongs in backend logs, never here.
export const KETIK_ERROR_MESSAGES = {
  ASSIGNMENT_LOAD_FAILED: "Penugasan belum bisa dimuat. Coba lagi.",
  ASSIGNMENT_SAVE_FAILED: "Penugasan belum bisa disimpan. Coba lagi.",
  ASSIGNMENT_CONFLICT:
    "Pengaturan atau penugasan sudah berubah. Muat ulang sebelum mencoba lagi.",
  ASSIGNMENT_FORBIDDEN: "Anda tidak memiliki akses ke penugasan ini.",
  ASSIGNMENT_INVALID_RECIPIENT:
    "Akun penerima aktif tidak ditemukan atau tidak mendukung penugasan.",
  ASSIGNMENT_INVALID_CONFIGURATION:
    "Aktifkan skenario dan pilih karakter konsumen sebelum menugaskan.",
  SETTINGS_LOAD_FAILED: "Pengaturan belum bisa dimuat. Coba lagi.",
  SETTINGS_SAVE_FAILED: "Pengaturan belum bisa disimpan. Coba lagi.",
  TEMPLATES_SAVE_FAILED: "Template belum bisa disimpan. Coba lagi.",
  HISTORY_LOAD_FAILED: "Riwayat belum bisa dimuat. Coba lagi.",
  HISTORY_DELETE_FAILED: "Riwayat belum bisa dihapus. Coba lagi.",
  SESSION_SAVE_FAILED: "Percakapan belum bisa disimpan. Coba lagi.",
  REVIEW_LOAD_FAILED: "Hasil telaah belum bisa dimuat. Coba lagi.",
  REVIEW_FAILED: "Telaah belum bisa diproses. Coba lagi.",
  RERUN_LIMIT:
    "Telaah ulang untuk sesi ini sudah dipakai. Agent dan leader bisa menelaah ulang 1 kali per sesi.",
  AI_ERROR: "AI belum bisa membalas chat. Coba lagi.",
  NOT_FOUND: "Sesi tidak ditemukan.",
} as const;

// ── KETIK Types ────────────────────────────────────────
export type ChatSender = "agent" | "consumer" | "system";

export const KETIK_PROMPT_LIMITS = {
  scenarioDescription: 12_000,
  scenarioScript: 20_000,
  consumerDescription: 4_000,
  chatMessageText: 20_000,
  imageAlt: 500,
} as const;

export interface PacingMeta {
  mode: "realistic" | "training_fast";
  band: "short" | "normal" | "long" | "slow" | "follow_up" | "greeting_reply";
  plannedDelayMs: number;
  timerClamped: boolean;
}

export interface KetikQuickTemplate {
  id: string;
  keyword: string;
  content: string;
}

export function mergeKetikQuickTemplates(
  globalTemplates: KetikQuickTemplate[],
  personalTemplates: KetikQuickTemplate[],
): KetikQuickTemplate[] {
  const globalIds = new Set(globalTemplates.map((template) => template.id));
  const globalKeywords = new Set(
    globalTemplates.map((template) => template.keyword.trim().toLowerCase()),
  );

  return [
    ...globalTemplates,
    ...personalTemplates.filter(
      (template) =>
        !globalIds.has(template.id) &&
        !globalKeywords.has(template.keyword.trim().toLowerCase()),
    ),
  ];
}

export interface KetikIdentitySettings {
  displayName: string;
  signatureName: string;
  phoneNumber: string;
  city: string;
}

export interface KetikAppSettings {
  scenarios: KetikScenario[];
  consumerTypes: KetikConsumerType[];
  quickTemplates: KetikQuickTemplate[];
  globalQuickTemplates?: KetikQuickTemplate[];
  personalQuickTemplates?: KetikQuickTemplate[];
  activeConsumerTypeId: string;
  identitySettings: KetikIdentitySettings;
  selectedModel: string;
  simulationDuration: number;
  responsePacingMode: "realistic" | "training_fast";
}

export const DEFAULT_KETIK_SCENARIOS: KetikScenario[] = [
  {
    id: "pinjol",
    category: "Pinjol",
    title: "Pinjol Ilegal",
    description:
      "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam. Sudah dua minggu penagih menelepon dan mengirim pesan ancaman, dan sejak kemarin teman serta rekan kerjanya ikut dihubungi. Konsumen malu dan takut, dan belum tahu harus melapor ke mana.",
    isActive: true,
  },
  {
    id: "penipuan",
    category: "Penipuan",
    title: "Penipuan Undian",
    description:
      "Konsumen menerima pesan menang undian dan diminta transfer pajak pemenang. Konsumen sudah mentransfer satu kali, lalu diminta transfer lagi untuk biaya administrasi, dan mulai curiga tertipu.",
    isActive: true,
  },
  {
    id: "slik",
    category: "SLIK",
    title: "Pengecekan SLIK",
    description:
      "Konsumen ingin mengecek status BI Checking / SLIK karena pengajuan KPR ditolak. Konsumen merasa selalu membayar cicilan tepat waktu, dan uang muka rumah sudah disiapkan sehingga ia khawatir kehilangan rumah incarannya.",
    isActive: true,
  },
  {
    id: "asuransi",
    category: "Asuransi",
    title: "Klaim Asuransi Ditolak",
    description:
      "Konsumen mengeluh karena klaim asuransi kesehatannya ditolak dengan alasan yang tidak jelas. Biaya rawat inap sudah dibayar sendiri, dan pihak asuransi hanya menjawab bahwa klaim tidak sesuai ketentuan polis.",
    isActive: true,
  },
  {
    id: "investasi",
    category: "Investasi",
    title: "Investasi Bodong",
    description:
      "Konsumen melaporkan adanya tawaran investasi dengan imbal hasil tidak wajar (ponzi). Konsumen sudah menyetor sebagian tabungannya karena diajak kerabat, dan sebulan terakhir imbal hasil yang dijanjikan berhenti dibayar.",
    isActive: true,
  },
  {
    id: "kartu-kredit",
    category: "Perbankan",
    title: "Tagihan Kartu Kredit",
    description:
      "Konsumen keberatan dengan adanya biaya administrasi atau tagihan yang tidak dikenal di kartu kreditnya. Tagihan itu muncul di lembar tagihan bulan ini, dan konsumen merasa tidak pernah melakukan transaksi tersebut.",
    isActive: true,
  },
];

export const DEFAULT_KETIK_CONSUMER_TYPES: KetikConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    description:
      "Konsumen sedang sangat kesal karena merasa dirugikan. Nada chat tegas, mendesak, tidak sabar dengan penjelasan panjang, dan makin kesal bila jawaban agen terasa normatif atau template.",
    difficulty: "Sulit",
  },
  {
    id: "bingung",
    name: "Bingung & Gaptek",
    description:
      "Konsumen awam, agak bingung, dan kurang paham istilah teknis atau alur digital.",
    difficulty: "Sedang",
  },
  {
    id: "kritis",
    name: "Kritis & Detail",
    description:
      "Konsumen teliti, skeptis, dan cepat menangkap jawaban yang terasa template atau berubah-ubah. Suka menanyakan dasar dan bukti.",
    difficulty: "Sulit",
  },
  {
    id: "ramah",
    name: "Ramah & Kooperatif",
    description:
      "Konsumen sopan, tenang, dan kooperatif. Mau mengikuti arahan agen.",
    difficulty: "Mudah",
  },
  {
    id: "terburu-buru",
    name: "Terburu-buru",
    description:
      "Konsumen sedang sempit waktu, ingin jawaban cepat, langsung, dan praktis.",
    difficulty: "Sedang",
  },
  {
    id: "pasrah",
    name: "Pasrah & Sedih",
    description:
      "Konsumen lelah dan putus asa karena masalahnya belum selesai.",
    difficulty: "Sedang",
  },
];

export const DEFAULT_KETIK_QUICK_TEMPLATES: KetikQuickTemplate[] = [
  {
    id: "qt-selesai",
    keyword: "selesai",
    content:
      "Terima kasih telah menghubungi Layanan Kontak OJK 157. Semoga informasi yang kami berikan bermanfaat.",
  },
  {
    id: "qt-closing",
    keyword: "closinghdsi",
    content:
      "Demikian informasi yang dapat kami sampaikan. Jika ada hal lain yang ingin ditanyakan, silakan menghubungi kami kembali.",
  },
  {
    id: "qt-greeting",
    keyword: "greetinghdsi",
    content:
      "Selamat pagi/siang/sore, dengan Layanan Kontak OJK 157. Ada yang bisa kami bantu terkait informasi sektor jasa keuangan?",
  },
  {
    id: "qt-isiform",
    keyword: "isiformhdsi",
    content:
      "Mohon kesediaan Bapak/Ibu untuk melengkapi data diri pada link berikut agar kami dapat memproses laporan Anda lebih lanjut: [LINK_FORM]",
  },
  {
    id: "qt-tanya-akun",
    keyword: "tanyaakun",
    content:
      "Boleh diinformasikan nomor akun atau ID pelanggan yang Bapak/Ibu gunakan untuk layanan tersebut?",
  },
];

export const DEFAULT_KETIK_SETTINGS: KetikAppSettings = {
  scenarios: DEFAULT_KETIK_SCENARIOS,
  consumerTypes: DEFAULT_KETIK_CONSUMER_TYPES,
  quickTemplates: DEFAULT_KETIK_QUICK_TEMPLATES,
  activeConsumerTypeId: "random",
  identitySettings: {
    displayName: "",
    signatureName: "",
    phoneNumber: "",
    city: "",
  },
  selectedModel: DEFAULT_AI_MODEL_ID,
  simulationDuration: 5,
  responsePacingMode: "realistic",
};

export interface KetikSessionHistoryItem {
  transcriptProvenance?: "legacy" | "server_v1";
  id: string;
  date: string;
  scenarioTitle: string;
  consumerName: string;
  consumerPhone?: string;
  consumerCity?: string;
  messages: ChatMessage[];
  simulationDuration?: number;
  finalScore?: number;
  empathyScore?: number;
  probingScore?: number;
  resolutionScore?: number;
  typoScore?: number;
  complianceScore?: number;
  reviewStatus?: "pending" | "processing" | "completed" | "failed";
  simulationSubject?: SimulationSubjectSnapshot | null;
}

export interface KetikReviewDetail {
  sessionId: string;
  review: KetikSessionReview;
  typos: KetikTypoFinding[];
  scores: {
    final: number;
    empathy: number;
    probing: number;
    resolution?: number;
    typo: number;
    compliance: number;
  };
}

export interface KetikConsumerType {
  id: string;
  name: string;
  description: string;
  difficulty: "Mudah" | "Sedang" | "Sulit";
  isCustom?: boolean;
}

export interface KetikScenario {
  id: string;
  category: string;
  title: string;
  description: string;
  isActive: boolean;
  script?: string;
  images?: string[];
  imageAlts?: string[];
}

export interface KetikSessionConfig {
  scenarios: KetikScenario[];
  consumerType: KetikConsumerType;
  identity: KetikIdentity;
  selectedModel: string;
  simulationDuration: number;
  responsePacingMode: "realistic" | "training_fast";
}

export interface ChatSession {
  id: string;
  date: string;
  scenarioTitle: string;
  consumerName: string;
  consumerPhone?: string;
  consumerCity?: string;
  messages: ChatMessage[];
  finalScore?: number;
  empathyScore?: number;
  probingScore?: number;
  resolutionScore?: number;
  typoScore?: number;
  complianceScore?: number;
  reviewStatus?: "pending" | "processing" | "completed" | "failed";
  simulationSubject?: SimulationSubjectSnapshot | null;
}

// ── Evaluasi Edukatif (education layer) ─────────────────
// AI only narrates diagnosis/howToFix/exampleRewrite; the backend owns
// label/score/verdict/priorityRank deterministically from canonical scores.
export type KetikDimensionKey =
  "empathy" | "probing" | "resolution" | "typo" | "compliance";

export type KetikDimensionVerdict =
  "Sangat Baik" | "Baik" | "Cukup" | "Perlu Coaching";

export interface KetikScoreEvidence {
  messageId: string;
  quote: string;
}

/** Shape requested from the model — narration fields only. */
export interface KetikDimensionGuidanceAI {
  evidence?: KetikScoreEvidence[];
  key: KetikDimensionKey;
  /** 1-2 sentences quoting 3-6 words of the transcript. */
  diagnosis: string;
  /** Concrete fix steps, 1-2 sentences. */
  howToFix: string;
  /** before -> after rewrite example, max 500 chars. */
  exampleRewrite: string;
}

/** Backend-enriched guidance persisted in ketik_session_reviews.education. */
export interface KetikDimensionGuidance extends KetikDimensionGuidanceAI {
  /** Absent on older reviews; transcript means quotes were checked by backend. */
  source?: "transcript" | "general";
  label: string;
  score: number;
  verdict: KetikDimensionVerdict;
  priorityRank: 1 | 2 | 3 | 4 | 5;
}

export interface KetikTypoEnriched {
  messageId: string;
  originalWord: string;
  correctedWord: string;
  severity: string;
  contextSentence?: string;
  whyWrong?: string;
}

export const KETIK_CONSUMER_POINT_STATUSES = [
  "answered",
  "partial",
  "unanswered",
] as const;
export type KetikConsumerPointStatus =
  (typeof KETIK_CONSUMER_POINT_STATUSES)[number];

/** Pertanyaan/permintaan konsumen dan apakah agen sudah menjawabnya. */
export interface KetikConsumerPoint {
  /** Pesan konsumen yang memuat `quote`. */
  messageId: string;
  quote: string;
  summary: string;
  status: KetikConsumerPointStatus;
  reason: string | null;
  /** Pesan agen yang menjawab; `null` bila belum ada. */
  answerMessageId: string | null;
  answerQuote: string | null;
}

export const KETIK_AGENT_NOTE_VERDICTS = ["good", "fix"] as const;
export type KetikAgentNoteVerdict = (typeof KETIK_AGENT_NOTE_VERDICTS)[number];

/** Kalimat agen yang dinilai, dengan kalimat yang lebih tepat bila perlu. */
export interface KetikAgentNote {
  messageId: string;
  quote: string;
  dimension: KetikDimensionKey;
  verdict: KetikAgentNoteVerdict;
  note: string;
  /** Kalimat pengganti; hanya untuk `verdict: "fix"`. */
  example: string | null;
}

export interface KetikEducation {
  dimensionGuidance: KetikDimensionGuidance[]; // length 5, sorted by priorityRank
  overallNextSteps?: string[];
  typosEnriched?: KetikTypoEnriched[];
  // Anotasi Telaah; tidak ada di telaah yang dibuat sebelum fitur ini.
  caseCore?: string | null;
  consumerPoints?: KetikConsumerPoint[];
  agentNotes?: KetikAgentNote[];
}

export interface KetikSessionReview {
  education?: KetikEducation | null;
  id: string;
  sessionId: string;
  aiSummary: string;
  strengths: string[];
  weaknesses: string[];
  coachingFocus: string[];
  createdAt: string;
}

export interface KetikTypoFinding {
  id: string;
  sessionId: string;
  messageId: string;
  originalWord: string;
  correctedWord: string;
  severity: string;
}

// ── Zod Validation Schemas ─────────────────────────────
export const chatSenderSchema = z.enum(["agent", "consumer", "system"]);

export const ketikScenarioSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string().max(KETIK_PROMPT_LIMITS.scenarioDescription),
  isActive: z.boolean(),
  script: z.string().max(KETIK_PROMPT_LIMITS.scenarioScript).optional(),
  images: z.array(z.string()).optional(),
  imageAlts: z.array(z.string().max(KETIK_PROMPT_LIMITS.imageAlt)).optional(),
});
export const chatMessageSchema = z.object({
  id: z.string(),
  sender: chatSenderSchema,
  text: z.string().max(KETIK_PROMPT_LIMITS.chatMessageText),
  timestamp: z.string(),
  status: z.enum(["sent", "delivered", "read"]).optional(),
  pacingMeta: z
    .object({
      mode: z.enum(["realistic", "training_fast"]),
      band: z.enum([
        "short",
        "normal",
        "long",
        "slow",
        "follow_up",
        "greeting_reply",
      ]),
      plannedDelayMs: z.number(),
      timerClamped: z.boolean(),
    })
    .optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const ketikConsumerTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().max(KETIK_PROMPT_LIMITS.consumerDescription),
  difficulty: z.enum(["Mudah", "Sedang", "Sulit"]),
  isCustom: z.boolean().optional(),
});

export const ketikQuickTemplateSchema = z.object({
  id: z.string(),
  keyword: z.string(),
  content: z.string(),
});

export const ketikIdentitySettingsSchema = z.object({
  displayName: z.string(),
  signatureName: z.string(),
  phoneNumber: z.string(),
  city: z.string(),
});

// Training-only data may be copied to another account; identity/templates must not.
export const ketikTrainingConfigurationSchema = z.object({
  scenarios: z.array(ketikScenarioSchema).min(1),
  consumerTypes: z.array(ketikConsumerTypeSchema).min(1),
  activeConsumerTypeId: z.string(),
  selectedModel: z.string().min(1),
  simulationDuration: z.number().finite().min(1).max(60),
  responsePacingMode: z.enum(["realistic", "training_fast"]),
});
export type KetikTrainingConfiguration = z.infer<
  typeof ketikTrainingConfigurationSchema
>;

export const ketikAppSettingsSchema: z.ZodType<KetikAppSettings> =
  ketikTrainingConfigurationSchema.extend({
    quickTemplates: z.array(ketikQuickTemplateSchema),
    globalQuickTemplates: z.array(ketikQuickTemplateSchema).optional(),
    personalQuickTemplates: z.array(ketikQuickTemplateSchema).optional(),
    identitySettings: ketikIdentitySettingsSchema,
  });

const ketikSettingsVersionSchema = z.union([
  z.literal("absent"),
  z.iso.datetime({ offset: true }),
]);
export const assignKetikConfigurationSchema = z.strictObject({
  sourceSettingsVersion: ketikSettingsVersionSchema,
  recipientSettingsVersion: ketikSettingsVersionSchema,
  expectedAssignmentVersion: z.uuid().nullable(),
});
export type AssignKetikConfiguration = z.infer<
  typeof assignKetikConfigurationSchema
>;

export interface KetikConfigurationAssignment {
  recipientId: string;
  assignedBy: string;
  sourceConfiguration: KetikTrainingConfiguration;
  sourceSettingsVersion: string;
  version: string;
  assignedAt: string;
}
export interface KetikAssignmentSnapshot {
  assignment: KetikConfigurationAssignment | null;
  recipientSettingsVersion: string;
}

export const ketikIdentitySchema = z.object({
  name: z.string(),
  city: z.string(),
  phone: z.string(),
  signatureName: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  voiceName: z.string().optional(),
});
export type KetikIdentity = z.infer<typeof ketikIdentitySchema>;

export const generateMessageSchema = z.object({
  scenarioId: z.string(),
  scenarioDraft: ketikScenarioSchema.optional(),
  consumerTypeId: z.string(),
  consumerTypeDraft: ketikConsumerTypeSchema.optional(),
  identity: z.object({ name: z.string(), city: z.string(), phone: z.string() }),
  selectedModel: z.string().default(DEFAULT_AI_MODEL_ID),
  simulationDuration: z.number().default(5),
  responsePacingMode: z
    .enum(["realistic", "training_fast"])
    .default("realistic"),
  chatHistory: z.array(chatMessageSchema),
  remainingSeconds: z.number().optional(),
  elapsedSeconds: z.number().optional(),
});

// ── Evaluasi Edukatif Zod (opsional — backward compatible) ──
export const ketikDimensionGuidanceAiSchema = z.object({
  evidence: z
    .array(z.object({ messageId: z.string(), quote: z.string().max(300) }))
    .max(3)
    .optional(),
  key: z.enum(["empathy", "probing", "resolution", "typo", "compliance"]),
  diagnosis: z.string().max(500),
  howToFix: z.string().max(500),
  exampleRewrite: z.string().max(500),
});

export const ketikEducationSchema = z.object({
  dimensionGuidance: z.array(
    ketikDimensionGuidanceAiSchema.extend({
      source: z.enum(["transcript", "general"]).optional(),
      label: z.string(),
      score: z.number(),
      verdict: z.enum(["Sangat Baik", "Baik", "Cukup", "Perlu Coaching"]),
      priorityRank: z.number().int().min(1).max(5),
    }),
  ),
  overallNextSteps: z.array(z.string().max(500)).optional(),
  typosEnriched: z
    .array(
      z.object({
        messageId: z.string(),
        originalWord: z.string(),
        correctedWord: z.string(),
        severity: z.string(),
        contextSentence: z.string().max(500).optional(),
        whyWrong: z.string().max(500).optional(),
      }),
    )
    .optional(),
});
