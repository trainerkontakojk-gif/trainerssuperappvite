import type {
  PdktConsumerType,
  PdktIdentity,
  PdktScenario,
  PdktSessionConfig,
  ResolvedConsumerNameMentionPattern,
  WritingStyleMode,
} from "@trainers/types";

export type PdktAppSettings = {
  scenarios: PdktScenario[];
  consumerTypes: PdktConsumerType[];
  enableImageGeneration: boolean;
  globalConsumerTypeId: string;
  selectedModel: string;
  consumerNameMentionPattern: "random" | "upfront" | "middle" | "late" | "none";
  writingStyleMode: WritingStyleMode;
  customIdentity?: {
    senderName: string;
    email: string;
    city: string;
    bodyName: string;
  };
};

export const DEFAULT_PDKT_MODEL_ID = "gemini-3.1-flash-lite";

export const TEXT_MODELS = [
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Preview)" },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
  { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B (OpenRouter)" },
  { id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (OR)" },
  { id: "google/gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite (OR)" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (OpenRouter)" },
  { id: "qwen/qwen3.5-flash-02-23", name: "Qwen 3.5 Flash (OpenRouter)" },
];

const DUMMY_CITIES = [
  "Jakarta Selatan",
  "Jakarta Pusat",
  "Jakarta Barat",
  "Jakarta Timur",
  "Jakarta Utara",
  "Surabaya",
  "Bandung",
  "Medan",
  "Semarang",
  "Makassar",
  "Palembang",
  "Tangerang",
  "Depok",
  "Bekasi",
  "Bogor",
  "Yogyakarta",
  "Malang",
  "Denpasar",
  "Balikpapan",
  "Samarinda",
  "Banjarmasin",
  "Pontianak",
  "Manado",
  "Padang",
  "Pekanbaru",
];

const DUMMY_PROFILES = [
  { name: "Budi Santoso", email: "budi.santoso88@gmail.com" },
  { name: "Siti Aminah", email: "siti.aminah_real@yahoo.com" },
  { name: "Agus Setiawan", email: "agus.setiawan.work@gmail.com" },
  { name: "Dewi Lestari", email: "dewi.lestari1990@outlook.com" },
  { name: "Rudi Hartono", email: "rudi.hartono.bisnis@gmail.com" },
];

export function coercePdktModelId(modelId?: string | null): string {
  const exists = TEXT_MODELS.some((model) => model.id === modelId);
  return exists ? (modelId as string) : DEFAULT_PDKT_MODEL_ID;
}

export function resolveConsumerNameMentionPattern(
  value?: string | null,
): ResolvedConsumerNameMentionPattern {
  if (value && value !== "random") {
    return value as ResolvedConsumerNameMentionPattern;
  }

  const patterns: ResolvedConsumerNameMentionPattern[] = [
    "upfront",
    "middle",
    "late",
    "none",
  ];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

export function generatePdktSessionConfig(
  settings: PdktAppSettings,
  scenario: PdktScenario,
  fallbackIdentity: PdktIdentity,
): PdktSessionConfig {
  let selectedConsumerType: PdktConsumerType;
  if (
    settings.globalConsumerTypeId &&
    settings.globalConsumerTypeId !== "random"
  ) {
    selectedConsumerType =
      settings.consumerTypes.find(
        (t) => t.id === settings.globalConsumerTypeId,
      ) ||
      settings.consumerTypes[
        Math.floor(Math.random() * settings.consumerTypes.length)
      ];
  } else {
    selectedConsumerType =
      settings.consumerTypes[
        Math.floor(Math.random() * settings.consumerTypes.length)
      ];
  }

  const customIdentity = settings.customIdentity;

  const identity: PdktIdentity = {
    name: customIdentity?.senderName || fallbackIdentity.name,
    email: customIdentity?.email || fallbackIdentity.email,
    city: customIdentity?.city || fallbackIdentity.city,
    bodyName:
      customIdentity?.bodyName ||
      customIdentity?.senderName ||
      fallbackIdentity.bodyName,
  };

  const resolvedConsumerNameMentionPattern = resolveConsumerNameMentionPattern(
    settings.consumerNameMentionPattern,
  );

  return {
    scenarios: [scenario],
    consumerType: selectedConsumerType,
    identity,
    enableImageGeneration: settings.enableImageGeneration ?? true,
    selectedModel: coercePdktModelId(settings.selectedModel),
    resolvedConsumerNameMentionPattern,
    writingStyleMode: settings.writingStyleMode || "training",
  };
}
