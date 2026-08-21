import {
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  normalizeTelefunLiveModelSelection,
  type NormalizedTelefunLiveModelSelection,
  type TelefunLiveModelWarningReason,
  type TelefunTransport,
} from "@trainers/types";
import {
  GEMINI_LIVE_VOICES_BY_GENDER,
  getVoicesForModel,
  resolveGeminiLiveVoice,
  resolveVoiceForModel,
} from "./telefunVoiceRegistry";
import type { TelefunSimulationChallengeType } from "./services/simulationChallenges";
import { normalizeSimulationChallengeTypes } from "./services/simulationChallenges";

export type { TelefunTransport } from "@trainers/types";

const HISTORICAL_OPENAI_REALTIME_MODEL_IDS = new Set([
  "gpt-realtime-2.1",
  "gpt-realtime-2.1-mini",
]);

export function isHistoricalTelefunOpenAiSelection(
  modelId: unknown,
  transport: unknown,
): boolean {
  return (
    (typeof modelId === "string" &&
      (HISTORICAL_OPENAI_REALTIME_MODEL_IDS.has(modelId) ||
        modelId.startsWith("gpt-realtime-"))) ||
    transport === "openai-audio" ||
    transport === "openai-webrtc"
  );
}

export function normalizeTelefunBrowserSelection(
  modelId?: unknown,
  transport?: unknown,
): NormalizedTelefunLiveModelSelection {
  if (isHistoricalTelefunOpenAiSelection(modelId, transport)) {
    return {
      ...normalizeTelefunLiveModelSelection(DEFAULT_TELEFUN_LIVE_MODEL_ID),
      didFallback: true,
      warningReason: "provider-unavailable",
    };
  }
  const normalized = normalizeTelefunLiveModelSelection(modelId, transport);
  if (normalized.model.provider !== "gemini") {
    return {
      ...normalizeTelefunLiveModelSelection(DEFAULT_TELEFUN_LIVE_MODEL_ID),
      didFallback: true,
      warningReason: "provider-unavailable",
    };
  }
  return normalized;
}

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
  simulationChallengeTypes: TelefunSimulationChallengeType[];
}

export type TelefunAppSettings = {
  selectedModel: string;
  voiceName: string;
  consumerName: string;
  consumerGender: string;
  scenarioTitle?: string;
  scenarios: TelefunScenario[];
  consumerTypes: TelefunConsumerType[];
  maxCallDuration: number; // in minutes, 0 means unlimited
  responsePacingMode: "realistic" | "training_fast";
  simulationChallengeTypes: TelefunSimulationChallengeType[];
  preferredConsumerTypeId: string;
  identitySettings: TelefunIdentitySettings;
  telefunModelId: string;
  telefunTransport?: TelefunTransport;
  telefunModelWarningReason?: TelefunLiveModelWarningReason;
  activeScenario?: TelefunScenario;
  activeConsumerType?: TelefunConsumerType;
  sessionId?: string;
  resolvedIdentity?: TelefunIdentity;
};

export const MALE_VOICES = GEMINI_LIVE_VOICES_BY_GENDER.male;
export const FEMALE_VOICES = GEMINI_LIVE_VOICES_BY_GENDER.female;

export function pickRandomVoiceForGender(gender: "male" | "female"): string {
  return resolveGeminiLiveVoice({ gender, random: Math.random });
}

export function resolveVoiceForGender(
  requestedVoice: string | undefined,
  gender: "male" | "female",
): string {
  return resolveGeminiLiveVoice({
    requestedVoice,
    gender,
    random: Math.random,
  });
}

export interface DefaultProfile {
  name: string;
  phone: string;
  city: string;
  gender: "male" | "female";
  voiceName: string;
}

export const DEFAULT_IDENTITY_POOL: DefaultProfile[] = [
  { name: "Agus Setiawan", phone: "0812-3456-7890", city: "Jakarta Selatan", gender: "male", voiceName: "Fenrir" },
  { name: "Siti Rahayu", phone: "0813-4567-8901", city: "Bandung", gender: "female", voiceName: "Kore" },
  { name: "Budi Hartono", phone: "0814-5678-9012", city: "Surabaya", gender: "male", voiceName: "Charon" },
  { name: "Dewi Lestari", phone: "0815-6789-0123", city: "Medan", gender: "female", voiceName: "Aoede" },
  { name: "Hendra Wijaya", phone: "0816-7890-1234", city: "Semarang", gender: "male", voiceName: "Charon" },
  { name: "Rina Marlina", phone: "0817-8901-2345", city: "Yogyakarta", gender: "female", voiceName: "Kore" },
  { name: "Andi Pratama", phone: "0818-9012-3456", city: "Makassar", gender: "male", voiceName: "Puck" },
  { name: "Fitri Handayani", phone: "0819-0123-4567", city: "Palembang", gender: "female", voiceName: "Aoede" },
  { name: "Rudi Hermawan", phone: "0821-1234-5678", city: "Tangerang", gender: "male", voiceName: "Puck" },
  { name: "Mega Ayuningtyas", phone: "0822-2345-6789", city: "Bekasi", gender: "female", voiceName: "Leda" },
  { name: "Dian Permana", phone: "0823-3456-7890", city: "Depok", gender: "male", voiceName: "Fenrir" },
  { name: "Lina Kusuma", phone: "0824-4567-8901", city: "Bogor", gender: "female", voiceName: "Kore" },
  // ── Tambahan variasi (total 50) — ragam suku, usia & daerah ──
  { name: "Lukman Hakim", phone: "0811-2233-4455", city: "Banda Aceh", gender: "male", voiceName: "Orus" },
  { name: "Cut Marlia", phone: "0821-3344-5566", city: "Banda Aceh", gender: "female", voiceName: "Leda" },
  { name: "Teuku Fariz", phone: "0852-1122-3344", city: "Lhokseumawe", gender: "male", voiceName: "Fenrir" },
  { name: "Johan Panjaitan", phone: "0812-7788-9900", city: "Medan", gender: "male", voiceName: "Charon" },
  { name: "Boruk Sihombing", phone: "0813-8899-0011", city: "Padang", gender: "female", voiceName: "Aoede" },
  { name: "Uda Syafril", phone: "0822-5566-7788", city: "Padang", gender: "male", voiceName: "Puck" },
  { name: "Uni Deswita", phone: "0823-6677-8899", city: "Pekanbaru", gender: "female", voiceName: "Kore" },
  { name: "Farhan Maulana", phone: "0856-1234-5678", city: "Bandar Lampung", gender: "male", voiceName: "Orus" },
  { name: "Nabila Zahra", phone: "0857-2345-6789", city: "Palembang", gender: "female", voiceName: "Leda" },
  { name: "Ujang Komarudin", phone: "0819-3456-7890", city: "Bandung", gender: "male", voiceName: "Charon" },
  { name: "Eneng Suryani", phone: "0817-4567-8901", city: "Cirebon", gender: "female", voiceName: "Kore" },
  { name: "Slamet Riyadi", phone: "0812-9876-5432", city: "Solo", gender: "male", voiceName: "Fenrir" },
  { name: "Tuti Alawiyah", phone: "0813-8765-4321", city: "Yogyakarta", gender: "female", voiceName: "Aoede" },
  { name: "Gilang Ramadhan", phone: "0851-1111-2222", city: "Malang", gender: "male", voiceName: "Puck" },
  { name: "Citra Kirana", phone: "0852-2222-3333", city: "Kediri", gender: "female", voiceName: "Leda" },
  { name: "I Made Wirata", phone: "0811-3333-4444", city: "Denpasar", gender: "male", voiceName: "Orus" },
  { name: "Ni Luh Ayu", phone: "0819-4444-5555", city: "Mataram", gender: "female", voiceName: "Aoede" },
  { name: "Yohanes Korwa", phone: "0821-5555-6666", city: "Jayapura", gender: "male", voiceName: "Charon" },
  { name: "Maria Matulessy", phone: "0822-6666-7777", city: "Ambon", gender: "female", voiceName: "Kore" },
  { name: "La Ode Haris", phone: "0853-7777-8888", city: "Kendari", gender: "male", voiceName: "Fenrir" },
  { name: "Wa Ode Sitti", phone: "0853-8888-9999", city: "Kendari", gender: "female", voiceName: "Leda" },
  { name: "Daeng Makkawaru", phone: "0812-1212-3434", city: "Makassar", gender: "male", voiceName: "Puck" },
  { name: "Andi Tenri", phone: "0813-1313-3535", city: "Parepare", gender: "female", voiceName: "Aoede" },
  { name: "Petrus Ola", phone: "0823-7878-8989", city: "Kupang", gender: "male", voiceName: "Orus" },
  { name: "Maria Florida", phone: "0823-7979-9090", city: "Kupang", gender: "female", voiceName: "Kore" },
  { name: "Jamaluddin Sulaiman", phone: "0857-1010-2020", city: "Ternate", gender: "male", voiceName: "Charon" },
  { name: "Nuraini Taha", phone: "0857-2020-3030", city: "Manado", gender: "female", voiceName: "Leda" },
  { name: "Ahmad Rifai", phone: "0815-3030-4040", city: "Balikpapan", gender: "male", voiceName: "Fenrir" },
  { name: "Siti Masitah", phone: "0815-4040-5050", city: "Samarinda", gender: "female", voiceName: "Aoede" },
  { name: "Haji Mukhtar", phone: "0821-6060-7070", city: "Banjarmasin", gender: "male", voiceName: "Puck" },
  { name: "Norhalimah", phone: "0822-7070-8080", city: "Pontianak", gender: "female", voiceName: "Kore" },
  { name: "Bayu Anggara", phone: "0895-1234-5678", city: "Batam", gender: "male", voiceName: "Orus" },
  { name: "Wulan Dari", phone: "0896-2345-6789", city: "Jambi", gender: "female", voiceName: "Leda" },
  { name: "Fajar Nugroho", phone: "0812-6060-8080", city: "Jakarta Timur", gender: "male", voiceName: "Charon" },
  { name: "Ayu Kartika", phone: "0813-7070-9090", city: "Bekasi", gender: "female", voiceName: "Kore" },
  { name: "Bambang Pamungkas", phone: "0811-8080-9090", city: "Tangerang Selatan", gender: "male", voiceName: "Fenrir" },
  { name: "Nurul Hidayah", phone: "0858-9090-1010", city: "Serang", gender: "female", voiceName: "Aoede" },
  { name: "Gusti Ngurah", phone: "0818-2020-3030", city: "Denpasar", gender: "male", voiceName: "Puck" },
  { name: "Kadek Marlina", phone: "0819-3030-4040", city: "Gianyar", gender: "female", voiceName: "Leda" },
];

function pickIdentityProfileForGender(
  gender: "male" | "female",
): DefaultProfile {
  const pool = DEFAULT_IDENTITY_POOL.filter(
    (profile) => profile.gender === gender,
  );
  return (
    pool[Math.floor(Math.random() * pool.length)] ?? DEFAULT_IDENTITY_POOL[0]
  );
}

function resolveGender(g?: "male" | "female" | "random"): "male" | "female" {
  if (g === "random" || !g) {
    return Math.random() > 0.5 ? "male" : "female";
  }
  return g;
}

export function resolveFinalIdentity(
  identitySettings: TelefunIdentitySettings,
  telefunModelId: string = DEFAULT_TELEFUN_LIVE_MODEL_ID,
): TelefunIdentity {
  const hasName = identitySettings.displayName.trim().length > 0;
  const hasPhone = identitySettings.phoneNumber.trim().length > 0;
  const hasCity = identitySettings.city.trim().length > 0;

  // When gender is "random", pick a random profile first, then use its gender
  const finalGender =
    identitySettings.gender === "random"
      ? pickIdentityProfileForGender(Math.random() > 0.5 ? "male" : "female")
          .gender
      : resolveGender(identitySettings.gender);

  const fallbackProfile = pickIdentityProfileForGender(finalGender);

  const resolvedVoice = resolveVoiceForModel({
    modelId: telefunModelId,
    requestedVoice: identitySettings.voiceName || undefined,
    gender: finalGender,
    random: Math.random,
  });

  if (hasName && hasPhone && hasCity) {
    return {
      name: identitySettings.displayName,
      phone: identitySettings.phoneNumber,
      city: identitySettings.city,
      gender: finalGender,
      voiceName: resolvedVoice,
      signatureName: identitySettings.signatureName,
    };
  }

  return {
    name: hasName ? identitySettings.displayName : fallbackProfile.name,
    phone: hasPhone ? identitySettings.phoneNumber : fallbackProfile.phone,
    city: hasCity ? identitySettings.city : fallbackProfile.city,
    gender: finalGender,
    voiceName: resolvedVoice,
    signatureName: identitySettings.signatureName,
  };
}

const TELEFUN_GENDERS = ["random", "male", "female"] as const;
const RESPONSE_PACING_MODES = ["realistic", "training_fast"] as const;

function coerceTelefunGender(
  value: unknown,
): TelefunIdentitySettings["gender"] {
  return TELEFUN_GENDERS.includes(value as TelefunIdentitySettings["gender"])
    ? (value as TelefunIdentitySettings["gender"])
    : "random";
}

function coerceResponsePacingMode(
  value: unknown,
): TelefunAppSettings["responsePacingMode"] {
  return RESPONSE_PACING_MODES.includes(
    value as TelefunAppSettings["responsePacingMode"],
  )
    ? (value as TelefunAppSettings["responsePacingMode"])
    : "realistic";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function coerceTelefunDifficulty(value: unknown): ConsumerDifficulty {
  return Object.values(ConsumerDifficulty).includes(value as ConsumerDifficulty)
    ? (value as ConsumerDifficulty)
    : ConsumerDifficulty.Medium;
}

export function coerceIdentityVoiceForModel(params: {
  modelId: string;
  voiceName: string;
  gender: TelefunIdentitySettings["gender"];
}): string {
  const normalizedModel = normalizeTelefunBrowserSelection(params.modelId);
  if (!params.voiceName || params.gender === "random") return "";
  return getVoicesForModel(normalizedModel.model.id, params.gender).some(
    (voice) => voice === params.voiceName,
  )
    ? params.voiceName
    : "";
}

function coerceTelefunScenarios(value: unknown): TelefunScenario[] {
  if (!Array.isArray(value)) return DEFAULT_TELEFUN_SETTINGS.scenarios;

  const scenarios = value
    .filter(isRecord)
    .map((item): TelefunScenario | null => {
      const id = coerceString(item.id);
      const title = coerceString(item.title);
      const instruction = coerceString(item.instruction);
      if (!id || !title || !instruction) return null;
      return {
        id,
        title,
        instruction,
        isActive: item.isActive !== false,
        category: coerceString(item.category) || "Umum",
        script: coerceString(item.script),
      };
    })
    .filter((item): item is TelefunScenario => item !== null);

  return scenarios.length > 0 ? scenarios : DEFAULT_TELEFUN_SETTINGS.scenarios;
}

export function normalizeTelefunConsumerDifficulty(
  consumerType: TelefunConsumerType,
): TelefunConsumerType {
  return consumerType.id === "pasrah"
    ? { ...consumerType, difficulty: ConsumerDifficulty.Hard }
    : consumerType;
}

function normalizeTelefunConsumerType(
  item: Record<string, unknown>,
): TelefunConsumerType | null {
  const id = coerceString(item.id);
  const name = coerceString(item.name);
  const description = coerceString(item.description);
  if (!id || !name || !description) return null;

  return normalizeTelefunConsumerDifficulty({
    id,
    name,
    description,
    difficulty: coerceTelefunDifficulty(item.difficulty),
    gender: coerceString(item.gender) || "random",
  });
}

function coerceTelefunConsumerTypes(value: unknown): TelefunConsumerType[] {
  if (!Array.isArray(value)) return DEFAULT_TELEFUN_SETTINGS.consumerTypes;

  const consumerTypes = value
    .filter(isRecord)
    .map(normalizeTelefunConsumerType)
    .filter((item): item is TelefunConsumerType => item !== null);

  return consumerTypes.length > 0
    ? consumerTypes
    : DEFAULT_TELEFUN_SETTINGS.consumerTypes;
}

export function parseTelefunSettings(
  parsed: Record<string, unknown>,
): TelefunAppSettings {
  const normalizedLiveModel = normalizeTelefunBrowserSelection(
    parsed.telefunModelId ?? parsed.selectedModel,
    parsed.telefunTransport,
  );
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
      const rawVoice = (identityRaw.voiceName as string) || "";
      const gender = coerceTelefunGender(identityRaw.gender);
      identitySettings = {
        displayName: (identityRaw.displayName as string) || "",
        gender,
        phoneNumber: (identityRaw.phoneNumber as string) || "",
        city: (identityRaw.city as string) || "",
        signatureName: (identityRaw.signatureName as string) || "",
        voiceName: rawVoice,
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

  identitySettings = {
    ...identitySettings,
    voiceName: coerceIdentityVoiceForModel({
      modelId: normalizedLiveModel.model.id,
      voiceName: identitySettings.voiceName,
      gender: identitySettings.gender,
    }),
  };

  const rawChallengeTypes =
    parsed.simulationChallengeTypes ??
    // Deprecated compatibility read for settings saved before prompt-first runtime.
    parsed.realisticModeDisruptionTypes;
  const normalized: TelefunAppSettings = {
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
    simulationChallengeTypes:
      normalizeSimulationChallengeTypes(rawChallengeTypes),
    selectedModel: normalizedLiveModel.model.id,
    voiceName:
      parsed.voiceName === undefined
        ? "Kore"
        : coerceIdentityVoiceForModel({
            modelId: normalizedLiveModel.model.id,
            voiceName: coerceString(parsed.voiceName),
            gender: identitySettings.gender,
          }),
    telefunModelId: normalizedLiveModel.model.id,
    telefunTransport: normalizedLiveModel.transport,
    telefunModelWarningReason: normalizedLiveModel.warningReason,
  };
  delete (normalized as unknown as Record<string, unknown>)
    .realisticModeEnabled;
  delete (normalized as unknown as Record<string, unknown>)
    .realisticModeDisruptionTypes;
  delete (normalized as unknown as Record<string, unknown>).systemInstruction;
  return normalized;
}

export const VOICE_OPTIONS = [
  { id: "Puck", name: "Puck" },
  { id: "Charon", name: "Charon" },
  { id: "Fenrir", name: "Fenrir" },
  { id: "Orus", name: "Orus" },
  { id: "Kore", name: "Kore" },
  { id: "Leda", name: "Leda" },
  { id: "Aoede", name: "Aoede" },
];

export const CONSUMER_GENDERS = [
  { id: "male", name: "Laki-laki" },
  { id: "female", name: "Perempuan" },
];

export const DEFAULT_CONSUMER_TYPES: TelefunConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    gender: "random",
    description:
      "Konsumen sangat marah, nada bicara tinggi, emosional, dan tidak sabaran. Merasa dirugikan dan menuntut solusi instan. Sering meninggikan suara, memotong pembicaraan agen, dan menggunakan kalimat pendek yang tegas. Tetap terdengar seperti orang sungguhan yang sedang komplain via telepon, bukan karakter fiksi.",
    difficulty: ConsumerDifficulty.Hard,
  },
  {
    id: "bingung",
    name: "Bingung & Gaptek",
    gender: "random",
    description:
      'Konsumen awam, agak bingung, dan kurang paham istilah teknis atau alur prosedur. Sering minta penjelasan ulang dengan bahasa sederhana, banyak jeda dan gumaman ("ehm", "anu", "begitu ya?"). Tetap terasa natural seperti orang yang benar-benar butuh dibantu, bukan dibuat bodoh-bodohan.',
    difficulty: ConsumerDifficulty.Medium,
  },
  {
    id: "kritis",
    name: "Kritis & Detail",
    gender: "random",
    description:
      "Konsumen teliti, skeptis, dan cepat menangkap jawaban yang terasa template atau normatif. Suka meminta dasar aturan, alur resmi, atau SOP yang relevan. Tetap bicara sebagai konsumen yang cerdas dan hati-hati, bukan seperti auditor atau pegawai internal. Pertanyaan spesifik dan terstruktur.",
    difficulty: ConsumerDifficulty.Hard,
  },
  {
    id: "ramah",
    name: "Ramah & Kooperatif",
    gender: "random",
    description:
      "Konsumen sopan, tenang, dan kooperatif. Mau mengikuti arahan agen dan memberikan data yang diminta, tetapi tetap punya masalah yang ingin diselesaikan. Gaya bicara hangat dan wajar, tidak terlalu formal. Sering mengucapkan terima kasih dan menghargai bantuan agen.",
    difficulty: ConsumerDifficulty.Easy,
  },
  {
    id: "terburu-buru",
    name: "Terburu-buru",
    gender: "random",
    description:
      "Konsumen sedang sempit waktu, misalnya di jalan atau di sela kerja. Ingin jawaban cepat, langsung, dan praktis. Mudah memotong pembicaraan yang terlalu panjang, tetapi tetap realistis dan tidak asal marah. Cenderung memberi respons singkat dan mendesak.",
    difficulty: ConsumerDifficulty.Medium,
  },
  {
    id: "pasrah",
    name: "Pasrah & Sedih",
    gender: "random",
    description:
      "Konsumen lelah, tertekan, dan hampir menangis karena masalahnya belum selesai. Nada bicara sedih, lirih, dan penuh jeda; sesekali terdengar suara patah-patah, terisak pelan, atau napas berat yang natural. Fokus pada beban emosional dan kesulitan nyata, bukan detail baru. Empati yang tepat membuatnya mau mendengar, tetapi tetap butuh arahan konkret; jangan dibuat seolah masalah selesai hanya karena sudah didengar.",
    difficulty: ConsumerDifficulty.Hard,
  },
];

export const DEFAULT_SCENARIOS: TelefunScenario[] = [
  {
    id: "pinjol",
    category: "Pinjol",
    title: "Pinjol Ilegal",
    instruction:
      "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.",
    isActive: true,
  },
  {
    id: "penipuan",
    category: "Penipuan",
    title: "Penipuan Undian",
    instruction:
      "Konsumen menerima pesan menang undian dan diminta transfer pajak pemenang.",
    isActive: true,
  },
  {
    id: "slik",
    category: "SLIK",
    title: "Pengecekan SLIK",
    instruction:
      "Konsumen ingin mengecek status BI Checking / SLIK karena pengajuan KPR ditolak.",
    isActive: true,
  },
  {
    id: "asuransi",
    category: "Asuransi",
    title: "Klaim Asuransi Ditolak",
    instruction:
      "Konsumen mengeluh karena klaim asuransi kesehatannya ditolak dengan alasan yang tidak jelas.",
    isActive: true,
  },
  {
    id: "investasi",
    category: "Investasi",
    title: "Investasi Bodong",
    instruction:
      "Konsumen melaporkan adanya tawaran investasi dengan imbal hasil tidak wajar (ponzi).",
    isActive: true,
  },
  {
    id: "kartu-kredit",
    category: "Perbankan",
    title: "Tagihan Kartu Kredit",
    instruction:
      "Konsumen keberatan dengan adanya biaya administrasi atau tagihan yang tidak dikenal di kartu kreditnya.",
    isActive: true,
  },
];

export const DEFAULT_TELEFUN_SETTINGS: TelefunAppSettings = {
  selectedModel: DEFAULT_TELEFUN_LIVE_MODEL_ID,
  voiceName: "Kore",
  consumerName: "Budi Santoso",
  consumerGender: "male",
  scenarios: DEFAULT_SCENARIOS,
  consumerTypes: DEFAULT_CONSUMER_TYPES,
  maxCallDuration: 5,
  responsePacingMode: "realistic",
  simulationChallengeTypes: [],
  preferredConsumerTypeId: "marah",
  identitySettings: {
    displayName: "",
    gender: "random",
    phoneNumber: "",
    city: "",
    signatureName: "",
    voiceName: "",
  },
  telefunModelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
  telefunTransport: "gemini-live",
};
