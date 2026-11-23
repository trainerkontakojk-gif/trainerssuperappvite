export const AI_THINKING_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;
export type AiThinkingLevel = (typeof AI_THINKING_LEVELS)[number];

export const AI_THINKING_SCOPES = [
  "ketik_reply",
  "ketik_review",
  "pdkt_reply",
  "pdkt_evaluation",
  "telefun_transcription",
  "telefun_assessment",
  "telefun_coaching",
  "sidak_forecast",
] as const;
export type AiThinkingScope = (typeof AI_THINKING_SCOPES)[number];

export interface AiThinkingScopeDefinition {
  scope: AiThinkingScope;
  label: string;
  description: string;
  codeDefault: AiThinkingLevel | null;
}

export const AI_THINKING_SCOPE_DEFINITIONS: Record<
  AiThinkingScope,
  AiThinkingScopeDefinition
> = {
  ketik_reply: {
    scope: "ketik_reply",
    label: "Balasan simulasi KETIK",
    description: "Balasan konsumen AI selama simulasi percakapan KETIK.",
    codeDefault: "LOW",
  },
  ketik_review: {
    scope: "ketik_review",
    label: "Review jawaban KETIK",
    description: "Penilaian dan fallback review percakapan KETIK.",
    codeDefault: null,
  },
  pdkt_reply: {
    scope: "pdkt_reply",
    label: "Balasan simulasi PDKT",
    description: "Pembuatan balasan email konsumen PDKT.",
    codeDefault: "LOW",
  },
  pdkt_evaluation: {
    scope: "pdkt_evaluation",
    label: "Penilaian simulasi PDKT",
    description: "Evaluasi balasan agen dalam simulasi PDKT.",
    codeDefault: null,
  },
  telefun_transcription: {
    scope: "telefun_transcription",
    label: "Transkripsi Telefun",
    description: "Transkripsi verbatim suara agen dari rekaman Telefun.",
    codeDefault: "LOW",
  },
  telefun_assessment: {
    scope: "telefun_assessment",
    label: "Penilaian Telefun",
    description: "Analisis suara dan anotasi replay Telefun.",
    codeDefault: null,
  },
  telefun_coaching: {
    scope: "telefun_coaching",
    label: "Coaching Telefun",
    description: "Rekomendasi coaching setelah penilaian Telefun.",
    codeDefault: "MEDIUM",
  },
  sidak_forecast: {
    scope: "sidak_forecast",
    label: "Prediksi dashboard SIDAK",
    description: "Narasi insight forecast dashboard SIDAK.",
    codeDefault: "LOW",
  },
};

export function isAiThinkingScope(scope: unknown): scope is AiThinkingScope {
  return (
    typeof scope === "string" &&
    (AI_THINKING_SCOPES as readonly string[]).includes(scope)
  );
}

export function isAiThinkingLevel(level: unknown): level is AiThinkingLevel {
  return (
    typeof level === "string" &&
    (AI_THINKING_LEVELS as readonly string[]).includes(level)
  );
}

export interface AiThinkingPolicyItem {
  scope: AiThinkingScope;
  label: string;
  description: string;
  thinkingLevel: AiThinkingLevel | null;
  source: "policy" | "code";
  codeDefault: AiThinkingLevel | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AiThinkingPolicyAuditEntry {
  id: string;
  scope: AiThinkingScope;
  oldThinkingLevel: AiThinkingLevel | null;
  newThinkingLevel: AiThinkingLevel | null;
  changedBy: string | null;
  changedByName?: string | null;
  changedAt: string;
}

export interface AiThinkingPolicyListResponse {
  items: AiThinkingPolicyItem[];
  models: Array<{
    id: string;
    name: string;
    supportedLevels: readonly AiThinkingLevel[] | null;
  }>;
}

export interface AiThinkingPolicyAuditListResponse {
  items: AiThinkingPolicyAuditEntry[];
}
