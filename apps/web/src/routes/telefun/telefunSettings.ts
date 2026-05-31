export enum ConsumerDifficulty {
  Easy = "Easy",
  Medium = "Medium",
  Hard = "Hard",
  Random = "Random",
}

export interface TelefunScenario {
  id: string;
  title: string;
  instruction: string;
  isActive: boolean;
  category?: string;
  script?: string;
}

export interface TelefunConsumerType {
  id: string;
  name: string;
  gender: string;
  description: string;
  difficulty?: ConsumerDifficulty;
}

export interface TelefunIdentitySettings {
  displayName: string;
  gender: "male" | "female" | "random";
  phoneNumber: string;
  city: string;
  signatureName: string;
  voiceName: string;
}

export interface TelefunIdentity {
  name: string;
  phone: string;
  city: string;
  gender: "male" | "female";
  voiceName: string;
  signatureName: string;
}

export type TelefunTransport = "gemini-live" | "openai-audio";

export interface TelefunVoiceModel {
  id: string;
  name: string;
  telefunTransport: TelefunTransport;
  description: string;
  disabled: boolean;
}

export interface TelefunSessionConfig {
  scenarios: TelefunScenario[];
  consumerType: TelefunConsumerType;
  identity: TelefunIdentity;
  selectedModel: string;
  simulationDuration: number;
  maxCallDuration: number;
  responsePacingMode: "realistic" | "training_fast";
  telefunTransport?: TelefunTransport;
  telefunModelId: string;
  realisticModeEnabled: boolean;
  realisticModeDisruptionTypes?: string[];
}

export type TelefunAppSettings = {
  selectedModel: string;
  voiceName: string;
  systemInstruction: string;
  consumerName: string;
  consumerGender: string;
  scenarioTitle?: string;
  scenarios: TelefunScenario[];
  consumerTypes: TelefunConsumerType[];
  maxCallDuration: number; // in minutes, 0 means unlimited
  responsePacingMode: "realistic" | "training_fast";
  realisticModeEnabled: boolean;
  realisticModeDisruptionTypes: string[];
  preferredConsumerTypeId: string;
  identitySettings: TelefunIdentitySettings;
  telefunModelId: string;
  telefunTransport?: TelefunTransport;
  activeScenario?: TelefunScenario;
  activeConsumerType?: TelefunConsumerType;
  sessionId?: string;
  resolvedIdentity?: TelefunIdentity;
};




export const VOICE_MODELS: TelefunVoiceModel[] = [
  {
    id: 'gemini-3.1-flash-live-preview',
    name: 'Gemini 3.1 Flash Live',
    telefunTransport: 'gemini-live',
    description: 'Generasi terbaru dengan pemahaman konteks terbaik.',
    disabled: false
  },
  {
    id: 'gemini-3.0-flash-live-preview',
    name: 'Gemini 3.0 Flash Live',
    telefunTransport: 'gemini-live',
    description: 'Stabil dan optimal untuk latensi rendah.',
    disabled: false
  },
  {
    id: 'openai-gpt4o-realtime',
    name: 'GPT-4o Realtime',
    telefunTransport: 'openai-audio',
    description: 'Model OpenAI dengan kapabilitas audio native.',
    disabled: true
  }
];

export const MALE_VOICES = [
  "Fenrir",
  "Charon",
  "Dipper",
  "Puck",
  "Ursa",
] as const;
export const FEMALE_VOICES = [
  "Kore",
  "Aoede",
  "Capella",
  "Lyra",
  "Vega",
] as const;

export function pickRandomVoiceForGender(gender: "male" | "female"): string {
  const pool = gender === "male" ? MALE_VOICES : FEMALE_VOICES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function resolveVoiceForGender(
  requestedVoice: string | undefined,
  gender: "male" | "female",
): string {
  const pool = gender === "male" ? MALE_VOICES : FEMALE_VOICES;
  if (requestedVoice && (pool as readonly string[]).includes(requestedVoice)) {
    return requestedVoice;
  }
  return pickRandomVoiceForGender(gender);
}

export interface DefaultProfile {
  name: string;
  phone: string;
  city: string;
  gender: "male" | "female";
  voiceName: string;
}

export const DEFAULT_IDENTITY_POOL: DefaultProfile[] = [
  {
    name: "Agus Setiawan",
    phone: "0812-3456-7890",
    city: "Jakarta",
    gender: "male",
    voiceName: "Fenrir",
  },
  {
    name: "Siti Rahayu",
    phone: "0813-4567-8901",
    city: "Bandung",
    gender: "female",
    voiceName: "Kore",
  },
  {
    name: "Budi Hartono",
    phone: "0814-5678-9012",
    city: "Surabaya",
    gender: "male",
    voiceName: "Charon",
  },
  {
    name: "Dewi Lestari",
    phone: "0815-6789-0123",
    city: "Medan",
    gender: "female",
    voiceName: "Aoede",
  },
  {
    name: "Hendra Wijaya",
    phone: "0816-7890-1234",
    city: "Semarang",
    gender: "male",
    voiceName: "Dipper",
  },
  {
    name: "Rina Marlina",
    phone: "0817-8901-2345",
    city: "Yogyakarta",
    gender: "female",
    voiceName: "Capella",
  },
  {
    name: "Andi Pratama",
    phone: "0818-9012-3456",
    city: "Makassar",
    gender: "male",
    voiceName: "Puck",
  },
  {
    name: "Fitri Handayani",
    phone: "0819-0123-4567",
    city: "Palembang",
    gender: "female",
    voiceName: "Lyra",
  },
  {
    name: "Rudi Hermawan",
    phone: "0821-1234-5678",
    city: "Tangerang",
    gender: "male",
    voiceName: "Ursa",
  },
  {
    name: "Mega Ayuningtyas",
    phone: "0822-2345-6789",
    city: "Bekasi",
    gender: "female",
    voiceName: "Vega",
  },
  {
    name: "Dian Permana",
    phone: "0823-3456-7890",
    city: "Depok",
    gender: "male",
    voiceName: "Fenrir",
  },
  {
    name: "Lina Kusuma",
    phone: "0824-4567-8901",
    city: "Bogor",
    gender: "female",
    voiceName: "Kore",
  },
];

export function resolveFinalIdentity(
  identitySettings: TelefunIdentitySettings,
): TelefunIdentity {
  const hasName = identitySettings.displayName.trim().length > 0;
  const hasPhone = identitySettings.phoneNumber.trim().length > 0;
  const hasCity = identitySettings.city.trim().length > 0;

  const allEmpty = !hasName && !hasPhone && !hasCity;
  const allFilled = hasName && hasPhone && hasCity;

  const resolveGender = (g?: "male" | "female" | "random") => {
    if (g === "random" || !g) return Math.random() > 0.5 ? "male" : "female";
    return g;
  };

  if (allEmpty) {
    const profile =
      DEFAULT_IDENTITY_POOL[
        Math.floor(Math.random() * DEFAULT_IDENTITY_POOL.length)
      ];
    return {
      name: profile.name,
      phone: profile.phone,
      city: profile.city,
      gender: profile.gender,
      voiceName: profile.voiceName,
      signatureName: identitySettings.signatureName,
    };
  }

  if (allFilled) {
    const resolvedGender = resolveGender(identitySettings.gender);
    return {
      name: identitySettings.displayName,
      phone: identitySettings.phoneNumber,
      city: identitySettings.city,
      gender: resolvedGender,
      voiceName: resolveVoiceForGender(
        identitySettings.voiceName || undefined,
        resolvedGender,
      ),
      signatureName: identitySettings.signatureName,
    };
  }

  const profile =
    DEFAULT_IDENTITY_POOL[
      Math.floor(Math.random() * DEFAULT_IDENTITY_POOL.length)
    ];
  const resolvedGender = hasName
    ? resolveGender(identitySettings.gender)
    : profile.gender;
  return {
    name: hasName ? identitySettings.displayName : profile.name,
    phone: hasPhone ? identitySettings.phoneNumber : profile.phone,
    city: hasCity ? identitySettings.city : profile.city,
    gender: resolvedGender,
    voiceName: hasName
      ? resolveVoiceForGender(
          identitySettings.voiceName || undefined,
          resolvedGender,
        )
      : profile.voiceName,
    signatureName: identitySettings.signatureName,
  };
}

const TELEFUN_GENDERS = ["random", "male", "female"] as const;
const RESPONSE_PACING_MODES = ["realistic", "training_fast"] as const;
const TELEFUN_TRANSPORTS = ["gemini-live", "openai-audio"] as const;

function coerceTelefunGender(value: unknown): TelefunIdentitySettings["gender"] {
  return TELEFUN_GENDERS.includes(value as TelefunIdentitySettings["gender"])
    ? (value as TelefunIdentitySettings["gender"])
    : "random";
}

function coerceResponsePacingMode(value: unknown): TelefunAppSettings["responsePacingMode"] {
  return RESPONSE_PACING_MODES.includes(value as TelefunAppSettings["responsePacingMode"])
    ? (value as TelefunAppSettings["responsePacingMode"])
    : "realistic";
}

function coerceTelefunTransport(value: unknown): TelefunTransport {
  return TELEFUN_TRANSPORTS.includes(value as TelefunTransport)
    ? (value as TelefunTransport)
    : "gemini-live";
}

function coerceTelefunScenarios(value: unknown): TelefunScenario[] {
  return Array.isArray(value)
    ? (value as TelefunScenario[])
    : DEFAULT_TELEFUN_SETTINGS.scenarios;
}

function coerceTelefunConsumerTypes(value: unknown): TelefunConsumerType[] {
  return Array.isArray(value)
    ? (value as TelefunConsumerType[])
    : DEFAULT_TELEFUN_SETTINGS.consumerTypes;
}

export function parseTelefunSettings(
  parsed: Record<string, unknown>,
): TelefunAppSettings {
  const identityRaw = parsed.identitySettings as
    | Record<string, unknown>
    | undefined;

  let identitySettings: TelefunIdentitySettings;
  if (identityRaw) {
    if ("mode" in identityRaw && !("displayName" in identityRaw)) {
      const oldMode = identityRaw.mode as string;
      const oldFixedName = (identityRaw.fixedName as string) || "";
      const oldFixedGender = (identityRaw.fixedGender as string) || "";
      identitySettings = {
        displayName: oldMode === "fixed" ? oldFixedName : "",
        gender:
          oldMode === "fixed" ? coerceTelefunGender(oldFixedGender) : "random",
        phoneNumber: (identityRaw.fixedPhone as string) || "",
        city: (identityRaw.fixedCity as string) || "",
        signatureName: "",
        voiceName: (identityRaw.fixedGender === "female"
          ? "Kore"
          : "Fenrir") as string,
      };
    } else {
      identitySettings = {
        displayName: (identityRaw.displayName as string) || "",
        gender: coerceTelefunGender(identityRaw.gender),
        phoneNumber: (identityRaw.phoneNumber as string) || "",
        city: (identityRaw.city as string) || "",
        signatureName: (identityRaw.signatureName as string) || "",
        voiceName: (identityRaw.voiceName as string) || "",
      };
    }
  } else {
    identitySettings = {
      displayName: "",
      gender: "random",
      phoneNumber: "",
      city: "",
      signatureName: "",
      voiceName: "",
    };
  }

  return {
    ...DEFAULT_TELEFUN_SETTINGS,
    ...parsed,
    scenarios: coerceTelefunScenarios(parsed.scenarios),
    consumerTypes: coerceTelefunConsumerTypes(parsed.consumerTypes),
    identitySettings,
    maxCallDuration:
      typeof parsed.maxCallDuration === "number"
        ? parsed.maxCallDuration
        : DEFAULT_TELEFUN_SETTINGS.maxCallDuration,
    responsePacingMode: coerceResponsePacingMode(parsed.responsePacingMode),
    realisticModeEnabled: parsed.realisticModeEnabled === true,
    realisticModeDisruptionTypes: Array.isArray(
      parsed.realisticModeDisruptionTypes,
    )
      ? parsed.realisticModeDisruptionTypes.slice(0, 3)
      : [],
    telefunTransport: coerceTelefunTransport(parsed.telefunTransport),
  };
}

export const VOICE_OPTIONS = [
  { id: "Kore", name: "Kore" },
  { id: "Puck", name: "Puck" },
  { id: "Charon", name: "Charon" },
  { id: "Aoede", name: "Aoede" },
  { id: "Fenrir", name: "Fenrir" },
  { id: "Leda", name: "Leda" },
  { id: "Orus", name: "Orus" },
  { id: "Dipper", name: "Dipper" },
  { id: "Ursa", name: "Ursa" },
  { id: "Capella", name: "Capella" },
  { id: "Lyra", name: "Lyra" },
  { id: "Vega", name: "Vega" },
];

export const CONSUMER_GENDERS = [
  { id: "male", name: "Laki-laki" },
  { id: "female", name: "Perempuan" },
];

export const DISRUPTION_TYPES = [
  { id: "technical_term_confusion", name: "Bingung Istilah Teknis" },
  { id: "repeated_question", name: "Pertanyaan Berulang" },
  { id: "misunderstanding", name: "Salah Paham" },
  { id: "interruption", name: "Interupsi" },
  { id: "incomplete_data", name: "Data Tidak Lengkap" },
  { id: "unclear_voice", name: "Suara Tidak Jelas" },
  { id: "emotional_escalation", name: "Eskalasi Emosional" },
];

export const DEFAULT_CONSUMER_TYPES: TelefunConsumerType[] = [
  {
    id: 'marah',
    name: 'Marah & Emosional',
    gender: 'random',
    description: 'Konsumen sangat marah, nada bicara tinggi, emosional, dan tidak sabaran. Merasa dirugikan dan menuntut solusi instan. Sering meninggikan suara, memotong pembicaraan agen, dan menggunakan kalimat pendek yang tegas. Tetap terdengar seperti orang sungguhan yang sedang komplain via telepon, bukan karakter fiksi.',
    difficulty: ConsumerDifficulty.Hard
  },
  {
    id: 'bingung',
    name: 'Bingung & Gaptek',
    gender: 'random',
    description: 'Konsumen awam, agak bingung, dan kurang paham istilah teknis atau alur prosedur. Sering minta penjelasan ulang dengan bahasa sederhana, banyak jeda dan gumaman ("ehm", "anu", "begitu ya?"). Tetap terasa natural seperti orang yang benar-benar butuh dibantu, bukan dibuat bodoh-bodohan.',
    difficulty: ConsumerDifficulty.Medium
  },
  {
    id: 'kritis',
    name: 'Kritis & Detail',
    gender: 'random',
    description: 'Konsumen teliti, skeptis, dan cepat menangkap jawaban yang terasa template atau normatif. Suka meminta dasar aturan, alur resmi, atau SOP yang relevan. Tetap bicara sebagai konsumen yang cerdas dan hati-hati, bukan seperti auditor atau pegawai internal. Pertanyaan spesifik dan terstruktur.',
    difficulty: ConsumerDifficulty.Hard
  },
  {
    id: 'ramah',
    name: 'Ramah & Kooperatif',
    gender: 'random',
    description: 'Konsumen sopan, tenang, dan kooperatif. Mau mengikuti arahan agen dan memberikan data yang diminta, tetapi tetap punya masalah yang ingin diselesaikan. Gaya bicara hangat dan wajar, tidak terlalu formal. Sering mengucapkan terima kasih dan menghargai bantuan agen.',
    difficulty: ConsumerDifficulty.Easy
  },
  {
    id: 'terburu-buru',
    name: 'Terburu-buru',
    gender: 'random',
    description: 'Konsumen sedang sempit waktu, misalnya di jalan atau di sela kerja. Ingin jawaban cepat, langsung, dan praktis. Mudah memotong pembicaraan yang terlalu panjang, tetapi tetap realistis dan tidak asal marah. Cenderung memberi respons singkat dan mendesak.',
    difficulty: ConsumerDifficulty.Medium
  },
  {
    id: 'pasrah',
    name: 'Pasrah & Sedih',
    gender: 'random',
    description: 'Konsumen lelah dan putus asa karena masalahnya belum selesai. Nada bicara sedih, khawatir, dan penuh harap saat menghubungi OJK. Tetap manusiawi, tidak melodramatis, dan cenderung mencari kepastian langkah berikutnya. Sering menghela napas atau bicara pelan.',
    difficulty: ConsumerDifficulty.Medium
  }
];



export const DEFAULT_SCENARIOS: TelefunScenario[] = [
  {
    id: 'pinjol',
    category: 'Pinjol',
    title: 'Pinjol Ilegal',
    instruction: 'Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.',
    isActive: true,
  },
  {
    id: 'penipuan',
    category: 'Penipuan',
    title: 'Penipuan Undian',
    instruction: 'Konsumen menerima pesan menang undian dan diminta transfer pajak pemenang.',
    isActive: true,
  },
  {
    id: 'slik',
    category: 'SLIK',
    title: 'Pengecekan SLIK',
    instruction: 'Konsumen ingin mengecek status BI Checking / SLIK karena pengajuan KPR ditolak.',
    isActive: true,
  },
  {
    id: 'asuransi',
    category: 'Asuransi',
    title: 'Klaim Asuransi Ditolak',
    instruction: 'Konsumen mengeluh karena klaim asuransi kesehatannya ditolak dengan alasan yang tidak jelas.',
    isActive: true,
  },
  {
    id: 'investasi',
    category: 'Investasi',
    title: 'Investasi Bodong',
    instruction: 'Konsumen melaporkan adanya tawaran investasi dengan imbal hasil tidak wajar (ponzi).',
    isActive: true,
  },
  {
    id: 'kartu-kredit',
    category: 'Perbankan',
    title: 'Tagihan Kartu Kredit',
    instruction: 'Konsumen keberatan dengan adanya biaya administrasi atau tagihan yang tidak dikenal di kartu kreditnya.',
    isActive: true,
  }
];

export const DEFAULT_TELEFUN_SETTINGS: TelefunAppSettings = {
  selectedModel: "gemini-3.1-flash-live-preview",
  voiceName: "Kore",
  systemInstruction:
    "Anda adalah konsumen yang menghubungi OJK. Bantu agen melatih kemampuan komunikasi.",
  consumerName: "Budi Santoso",
  consumerGender: "male",
  scenarios: DEFAULT_SCENARIOS,
  consumerTypes: DEFAULT_CONSUMER_TYPES,
  maxCallDuration: 5,
  responsePacingMode: "realistic",
  realisticModeEnabled: false,
  realisticModeDisruptionTypes: [],
  preferredConsumerTypeId: "marah",
  identitySettings: {
    displayName: "",
    gender: "random",
    phoneNumber: "",
    city: "",
    signatureName: "",
    voiceName: "",
  },
  telefunModelId: "gemini-3.1-flash-live-preview",
  telefunTransport: "gemini-live",
};
