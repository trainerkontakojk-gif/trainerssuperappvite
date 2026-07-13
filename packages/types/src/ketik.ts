import { z } from "zod";

// ── KETIK Types ────────────────────────────────────────
export type ChatSender = "agent" | "consumer" | "system";

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
      "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.",
    isActive: true,
  },
  {
    id: "penipuan",
    category: "Penipuan",
    title: "Penipuan Undian",
    description:
      "Konsumen menerima pesan menang undian dan diminta transfer pajak pemenang.",
    isActive: true,
  },
  {
    id: "slik",
    category: "SLIK",
    title: "Pengecekan SLIK",
    description:
      "Konsumen ingin mengecek status BI Checking / SLIK karena pengajuan KPR ditolak.",
    isActive: true,
  },
  {
    id: "asuransi",
    category: "Asuransi",
    title: "Klaim Asuransi Ditolak",
    description:
      "Konsumen mengeluh karena klaim asuransi kesehatannya ditolak dengan alasan yang tidak jelas.",
    isActive: true,
  },
  {
    id: "investasi",
    category: "Investasi",
    title: "Investasi Bodong",
    description:
      "Konsumen melaporkan adanya tawaran investasi dengan imbal hasil tidak wajar (ponzi).",
    isActive: true,
  },
  {
    id: "kartu-kredit",
    category: "Perbankan",
    title: "Tagihan Kartu Kredit",
    description:
      "Konsumen keberatan dengan adanya biaya administrasi atau tagihan yang tidak dikenal di kartu kreditnya.",
    isActive: true,
  },
];

export const DEFAULT_KETIK_CONSUMER_TYPES: KetikConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    description:
      "Konsumen sedang sangat kesal karena merasa dirugikan. Nada chat tegas, mendesak, dan mudah terpancing bila jawaban agen terasa normatif.",
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
      "Konsumen teliti, skeptis, dan cepat menangkap jawaban yang terasa template.",
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
  selectedModel: "gemini-3.1-flash-lite",
  simulationDuration: 5,
  responsePacingMode: "realistic",
};

export interface KetikSessionHistoryItem {
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
  typoScore?: number;
  complianceScore?: number;
  reviewStatus?: "pending" | "processing" | "completed" | "failed";
}

export interface KetikReviewDetail {
  sessionId: string;
  review: KetikSessionReview;
  typos: KetikTypoFinding[];
  scores: {
    final: number;
    empathy: number;
    probing: number;
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
  typoScore?: number;
  complianceScore?: number;
  reviewStatus?: "pending" | "processing" | "completed" | "failed";
}

export interface KetikSessionReview {
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
  description: z.string(),
  isActive: z.boolean(),
  script: z.string().optional(),
  images: z.array(z.string()).optional(),
});
export const chatMessageSchema = z.object({
  id: z.string(),
  sender: chatSenderSchema,
  text: z.string(),
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
  description: z.string(),
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

export const ketikAppSettingsSchema: z.ZodType<KetikAppSettings> = z.object({
  scenarios: z.array(ketikScenarioSchema).min(1),
  consumerTypes: z.array(ketikConsumerTypeSchema).min(1),
  quickTemplates: z.array(ketikQuickTemplateSchema),
  activeConsumerTypeId: z.string(),
  identitySettings: ketikIdentitySettingsSchema,
  selectedModel: z.string().min(1),
  simulationDuration: z.number().finite().min(1).max(60),
  responsePacingMode: z.enum(["realistic", "training_fast"]),
});

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
  selectedModel: z.string().default("gemini-3.1-flash-lite"),
  simulationDuration: z.number().default(5),
  responsePacingMode: z
    .enum(["realistic", "training_fast"])
    .default("realistic"),
  chatHistory: z.array(chatMessageSchema),
  remainingSeconds: z.number().optional(),
  elapsedSeconds: z.number().optional(),
});
