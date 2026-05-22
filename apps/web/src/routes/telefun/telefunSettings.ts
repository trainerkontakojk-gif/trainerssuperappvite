export interface TelefunScenario {
  id: string;
  title: string;
  instruction: string;
  isActive: boolean;
}

export interface TelefunConsumerType {
  id: string;
  name: string;
  gender: string;
  description: string;
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

export interface TelefunSessionConfig {
  scenarios: TelefunScenario[];
  consumerType: TelefunConsumerType;
  identity: TelefunIdentity;
  selectedModel: string;
  simulationDuration: number;
  maxCallDuration: number;
  responsePacingMode: "realistic" | "training_fast";
  telefunTransport?: "gemini-live" | "openai-audio";
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
  telefunTransport?: "gemini-live" | "openai-audio";
};

export const VOICE_MODELS = [
  {
    id: "gemini-3.1-flash-live-preview",
    name: "Gemini 3.1 Flash Live (Preview)",
  },
  {
    id: "gemini-3.0-flash-live-preview",
    name: "Gemini 3.0 Flash Live (Preview)",
  },
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
          oldMode === "fixed" ? (oldFixedGender as any) || "random" : "random",
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
        gender: (identityRaw.gender as any) || "random",
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
    scenarios: (parsed.scenarios as any) || DEFAULT_TELEFUN_SETTINGS.scenarios,
    consumerTypes:
      (parsed.consumerTypes as any) || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
    identitySettings,
    maxCallDuration:
      typeof parsed.maxCallDuration === "number"
        ? parsed.maxCallDuration
        : DEFAULT_TELEFUN_SETTINGS.maxCallDuration,
    responsePacingMode:
      (parsed.responsePacingMode as any) ||
      DEFAULT_TELEFUN_SETTINGS.responsePacingMode,
    realisticModeEnabled: parsed.realisticModeEnabled === true,
    realisticModeDisruptionTypes: Array.isArray(
      parsed.realisticModeDisruptionTypes,
    )
      ? parsed.realisticModeDisruptionTypes.slice(0, 3)
      : [],
    telefunTransport:
      (parsed.telefunTransport as any) ||
      DEFAULT_TELEFUN_SETTINGS.telefunTransport,
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
  { id: "background_noise", name: "Kebisingan Latar" },
  { id: "interruption", name: "Interupsi Konsumen" },
  { id: "stuttering", name: "Gagap/Ragu" },
  { id: "bad_connection", name: "Koneksi Buruk" },
];

export const DEFAULT_CONSUMER_TYPES: TelefunConsumerType[] = [
  {
    id: "default-male",
    name: "Budi Santoso",
    gender: "male",
    description: "Konsumen pria dewasa, sopan dan kooperatif.",
  },
  {
    id: "default-female",
    name: "Siti Rahma",
    gender: "female",
    description: "Konsumen wanita dewasa, ramah namun teliti.",
  },
  {
    id: "angry-male",
    name: "Rudi Hartono",
    gender: "male",
    description: "Konsumen pria yang sedang kesal dan mudah terpancing emosi.",
  },
  {
    id: "confused-female",
    name: "Dewi Lestari",
    gender: "female",
    description:
      "Konsumen wanita yang bingung dan kurang paham istilah teknis.",
  },
];

export const SCENARIO_PRESETS = [
  {
    title: "Pengaduan Pinjol Ilegal",
    instruction:
      "Anda adalah konsumen yang menjadi korban pinjaman online ilegal. Anda merasa dirugikan dan ingin melaporkan ke OJK. Anda kesal karena diancam debt collector dan bunga membengkak.",
  },
  {
    title: "Laporan Investasi Bodong",
    instruction:
      "Anda adalah konsumen yang tertipu investasi bodong berkedok forex. Anda kehilangan Rp50 juta dan ingin melaporkan ke OJK. Anda panik dan ingin tahu langkah hukum.",
  },
  {
    title: "Klaim Asuransi Ditolak",
    instruction:
      "Anda adalah nasabah asuransi yang klaimnya ditolak dengan alasan tidak jelas. Anda sudah memiliki polis selama 3 tahun dan merasa kecewa. Anda ingin mengadu ke OJK.",
  },
  {
    title: "Layanan Customer Service Bank",
    instruction:
      "Anda adalah nasabah bank yang kartu ATM-nya ditelan mesin dan tidak mendapat bantuan dari CS. Anda frustrasi dan ingin melaporkan bank ke OJK.",
  },
  {
    title: "Konsultasi Produk Keuangan",
    instruction:
      "Anda adalah konsumen awam yang ingin bertanya tentang produk keuangan syariah. Anda ramah namun bingung dengan istilah-istilah perbankan.",
  },
];

export const DEFAULT_SCENARIOS: TelefunScenario[] = [
  ...SCENARIO_PRESETS.map((p, i) => ({
    id: `preset-${i}`,
    title: p.title,
    instruction: p.instruction,
    isActive: true,
  })),
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
  preferredConsumerTypeId: "default-male",
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
