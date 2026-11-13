import {
  AI_MODELS,
  AiModelInfo,
  AIProvider,
  DEFAULT_AI_MODEL_ID,
} from "./ai-models";

export const AI_TASKS = [
  "ketik_review",
  "ketik_review_fallback",
  "telefun_assessment",
  "sidak_forecast",
  "default_text",
] as const;

export type AiTask = (typeof AI_TASKS)[number];

export interface AiTaskDefinition {
  task: AiTask;
  label: string;
  description: string;
  codeDefault: string;
  requires: {
    supportsText?: boolean;
    supportsImage?: boolean;
    supportsAudioInput?: boolean;
  };
  providers?: readonly AIProvider[];
}

export const AI_TASK_DEFINITIONS: Record<AiTask, AiTaskDefinition> = {
  ketik_review: {
    task: "ketik_review",
    label: "Review KETIK (Utama)",
    description: "Evaluasi coaching simulasi percakapan teks KETIK.",
    codeDefault: "gemini-3.8-flash",
    requires: { supportsText: true },
  },
  ketik_review_fallback: {
    task: "ketik_review_fallback",
    label: "Review KETIK (Fallback)",
    description:
      "Model cadangan bila model utama KETIK mengalami timeout atau kegagalan provider.",
    codeDefault: "gpt-5.4-mini",
    requires: { supportsText: true },
  },
  telefun_assessment: {
    task: "telefun_assessment",
    label: "Penilaian Telefun",
    description:
      "Scoring audio, content review, coaching summary, dan anotasi Telefun.",
    codeDefault: "gemini-3.8-flash",
    requires: { supportsText: true, supportsAudioInput: true },
  },
  sidak_forecast: {
    task: "sidak_forecast",
    label: "Prediksi Dashboard SIDAK",
    description: "Narasi ringkasan forecast dan insight performa SIDAK.",
    codeDefault: "gemini-3.8-flash",
    requires: { supportsText: true },
  },
  default_text: {
    task: "default_text",
    label: "Model Teks Default",
    description:
      "Fallback umum untuk simulasi KETIK dan PDKT saat opsi selectedModel kosong.",
    codeDefault: DEFAULT_AI_MODEL_ID,
    requires: { supportsText: true },
  },
};

export function isAiTask(task: unknown): task is AiTask {
  return typeof task === "string" && (AI_TASKS as readonly string[]).includes(task);
}

export function eligibleModelsForTask(task: AiTask): AiModelInfo[] {
  const def = AI_TASK_DEFINITIONS[task];
  if (!def) return [];

  return AI_MODELS.filter((model) => {
    const caps = model.capabilities;
    if (!caps) return false;

    if (def.requires.supportsText && !caps.supportsText) return false;
    if (def.requires.supportsImage && !caps.supportsImage) return false;
    if (def.requires.supportsAudioInput && !caps.supportsAudioInput) return false;

    if (def.providers && !def.providers.includes(model.provider)) return false;

    return true;
  });
}

export interface AiModelPolicyItem {
  task: AiTask;
  label: string;
  description: string;
  modelId: string;
  source: "policy" | "code";
  codeDefault: string;
  eligible: Array<{
    id: string;
    name: string;
    provider: AIProvider;
    hasPricing: boolean;
  }>;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AiModelPolicyAuditEntry {
  id: string;
  task: AiTask;
  oldModelId: string | null;
  newModelId: string;
  changedBy: string | null;
  changedByName?: string | null;
  changedAt: string;
}

export interface AiModelPolicyListResponse {
  items: AiModelPolicyItem[];
}

export interface AiModelPolicyAuditListResponse {
  items: AiModelPolicyAuditEntry[];
}
