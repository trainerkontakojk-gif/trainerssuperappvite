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

const WRITING_STYLE_MODES = ["realistic", "training"] as const;
const CONSUMER_NAME_MENTION_PATTERNS = [
  "random",
  "upfront",
  "middle",
  "late",
  "none",
] as const;

export const DEFAULT_PDKT_MODEL_ID = "gemini-3.8-flash";

/**
 * Karakter konsumen cadangan bila katalog `/pdkt/consumer-types` belum
 * termuat. Sumber utamanya tetap katalog backend.
 */
export const PDKT_FALLBACK_CONSUMER_TYPES: PdktConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    description: "Sangat marah, emosional, tidak sabar.",
    difficulty: "Hard",
    tone: "Marah, menggunakan tanda seru.",
  },
  {
    id: "bingung",
    name: "Bingung dan kurang paham teknologi",
    description: "Kebingungan, tidak paham teknologi.",
    difficulty: "Medium",
    tone: "Bingung, ragu-ragu.",
  },
  {
    id: "kritis",
    name: "Kritis & Detail",
    description: "Kritis, menanyakan dasar hukum.",
    difficulty: "Hard",
    tone: "Kritis, logis, skeptis.",
  },
  {
    id: "ramah",
    name: "Ramah & Kooperatif",
    description: "Ramah, sopan, kooperatif.",
    difficulty: "Easy",
    tone: "Ramah, sopan.",
  },
  {
    id: "terburu-buru",
    name: "Terburu-buru",
    description: "Ingin jawaban singkat dan cepat.",
    difficulty: "Medium",
    tone: "Singkat, padat.",
  },
  {
    id: "pasrah",
    name: "Pasrah & Sedih",
    description: "Putus asa, nada sedih.",
    difficulty: "Medium",
    tone: "Sedih, memohon bantuan.",
  },
];

import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../lib/aiModels";
export { TEXT_MODELS };


const LEGACY_MODEL_IDS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

export function coercePdktModelId(modelId?: string | null): string {
  if (TEXT_MODELS.some((model) => model.id === modelId)) {
    return modelId as string;
  }

  if (typeof modelId === "string") {
    if (LEGACY_MODEL_IDS.has(modelId) || modelId.includes("/")) {
      return "gpt-5.4-mini";
    }
  }

  return DEFAULT_PDKT_MODEL_ID;
}

export function coerceWritingStyleMode(
  value?: string | null,
): "realistic" | "training" {
  return WRITING_STYLE_MODES.some((mode) => mode === value) && value != null
    ? (value as "realistic" | "training")
    : "training";
}

export function coerceConsumerNameMentionPattern(
  value?: string | null,
): "random" | "upfront" | "middle" | "late" | "none" {
  return CONSUMER_NAME_MENTION_PATTERNS.some((pattern) => pattern === value) && value != null
    ? (value as "random" | "upfront" | "middle" | "late" | "none")
    : "random";
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

type PdktCustomIdentity = NonNullable<PdktAppSettings["customIdentity"]>;

function firstNonBlank(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function resolvePdktScenarioIdentity({
  scenario,
  customIdentity,
  fallbackIdentity,
}: {
  scenario: PdktScenario;
  customIdentity?: PdktCustomIdentity;
  fallbackIdentity: PdktIdentity;
}): PdktIdentity {
  const scenarioIdentity = scenario.identity;

  return {
    name: firstNonBlank(
      scenarioIdentity?.name,
      customIdentity?.senderName,
      fallbackIdentity.name,
    ),
    email: firstNonBlank(
      scenarioIdentity?.email,
      customIdentity?.email,
      fallbackIdentity.email,
    ),
    city: firstNonBlank(
      scenarioIdentity?.city,
      customIdentity?.city,
      fallbackIdentity.city,
    ),
    bodyName: firstNonBlank(
      scenarioIdentity?.bodyName,
      scenarioIdentity?.name,
      customIdentity?.bodyName,
      customIdentity?.senderName,
      fallbackIdentity.bodyName,
    ),
  };
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

  const identity = resolvePdktScenarioIdentity({
    scenario,
    customIdentity: settings.customIdentity,
    fallbackIdentity,
  });

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
