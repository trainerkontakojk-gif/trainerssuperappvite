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

import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../lib/aiModels";
export { TEXT_MODELS };

const DUMMY_CITIES = [
  "Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Timur", "Jakarta Utara",
  "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Tangerang",
  "Depok", "Bekasi", "Bogor", "Yogyakarta", "Malang", "Denpasar", "Balikpapan",
  "Samarinda", "Banjarmasin", "Pontianak", "Manado", "Padang", "Pekanbaru",
  // ── Tambahan variasi (total 50) ──
  "Bandar Lampung", "Batam", "Cirebon", "Solo", "Kediri", "Jember", "Mataram",
  "Kupang", "Ambon", "Jayapura", "Sorong", "Banda Aceh", "Bengkulu", "Jambi",
  "Cilegon", "Serang", "Purwokerto", "Magelang", "Palu", "Kendari",
  "Gorontalo", "Ternate", "Mamuju", "Gianyar", "Lhokseumawe",
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
  // ── Tambahan variasi (total 50) — ragam suku & daerah ──
  { name: "Lukman Hakim", email: "lukman.hakim96@gmail.com" },
  { name: "Ayu Kartika", email: "ayu.kartika.ayu@yahoo.com" },
  { name: "Slamet Riyadi", email: "slamet.riyadi.solo@gmail.com" },
  { name: "Tuti Alawiyah", email: "tuti.alawiyah.jogja@gmail.com" },
  { name: "Farhan Maulana", email: "farhan.maulana.lpg@gmail.com" },
  { name: "Nabila Zahra", email: "nabila.zahra.palembang@outlook.com" },
  { name: "Gilang Ramadhan", email: "gilang.ramadhan.malang@gmail.com" },
  { name: "Citra Kirana", email: "citra.kirana.kediri@gmail.com" },
  { name: "Bayu Anggara", email: "bayu.anggara.batam@gmail.com" },
  { name: "Wulan Dari", email: "wulan.dari.jambi@yahoo.co.id" },
  { name: "Teuku Fariz", email: "teuku.fariz.aceh@gmail.com" },
  { name: "Cut Marlia", email: "cut.marlia.aceh@outlook.com" },
  { name: "I Made Wirata", email: "i.made.wirata.bali@gmail.com" },
  { name: "Ni Luh Ayu", email: "niluh.ayu.bali@yahoo.com" },
  { name: "Ujang Komarudin", email: "ujang.komarudin.bdg@gmail.com" },
  { name: "Eneng Suryani", email: "eneng.suryani.cirebon@gmail.com" },
  { name: "La Ode Haris", email: "laode.haris.kendari@gmail.com" },
  { name: "Wa Ode Sitti", email: "waode.sitti.kendari@yahoo.com" },
  { name: "Johan Panjaitan", email: "johan.panjaitan.medan@gmail.com" },
  { name: "Boruk Sihombing", email: "boruk.sihombing.medan@outlook.com" },
  { name: "Daeng Makkawaru", email: "daeng.makkawaru.mks@gmail.com" },
  { name: "Andi Tenri", email: "andi.tenri.parepare@yahoo.com" },
  { name: "Yohanes Korwa", email: "yohanes.korwa.jayapura@gmail.com" },
  { name: "Maria Matulessy", email: "maria.matulessy.ambon@gmail.com" },
  { name: "Petrus Ola", email: "petrus.ola.kupang@gmail.com" },
  { name: "Maria Florida", email: "maria.florida.kupang@yahoo.com" },
  { name: "Jamaluddin Sulaiman", email: "jamaluddin.ternate@gmail.com" },
  { name: "Norhalimah", email: "norhalimah.banjarmasin@gmail.com" },
  { name: "Ahmad Rifai", email: "ahmad.rifai.balikpapan@gmail.com" },
  { name: "Siti Masitah", email: "siti.masitah.samarinda@outlook.com" },
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
