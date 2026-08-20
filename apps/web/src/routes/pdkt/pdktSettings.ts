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

export const DEFAULT_PDKT_MODEL_ID = "gemini-3.7-flash";

import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../lib/aiModels";
export { TEXT_MODELS };

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
