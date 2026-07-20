export interface TelefunProviderReadinessInput {
  geminiConfigured: boolean;
  openAIEnabled: boolean;
  openAIConfigured: boolean;
}

export interface TelefunHealthRuntimeInput {
  uptime: number;
  timestamp: string;
}

export interface TelefunHealthCorsInput {
  allowedOrigins: string;
  requestOrigin?: string;
}

export interface TelefunHealthCorsResult {
  allowed: boolean;
  headers: Record<string, string>;
}

export function normalizeTelefunOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

export function resolveTelefunHealthCors({
  allowedOrigins,
  requestOrigin,
}: TelefunHealthCorsInput): TelefunHealthCorsResult {
  const allowHeaders = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
  };

  if (allowedOrigins.trim() === "*") {
    return {
      allowed: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        ...allowHeaders,
      },
    };
  }

  const varyHeaders = { Vary: "Origin" };
  if (!requestOrigin) {
    return { allowed: true, headers: varyHeaders };
  }

  const normalizedRequestOrigin = normalizeTelefunOrigin(requestOrigin);
  const allowed = allowedOrigins
    .split(",")
    .map((origin) => normalizeTelefunOrigin(origin.trim()))
    .filter(Boolean)
    .includes(normalizedRequestOrigin);

  if (!allowed) {
    return { allowed: false, headers: varyHeaders };
  }

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": normalizedRequestOrigin,
      ...allowHeaders,
      ...varyHeaders,
    },
  };
}

export function buildTelefunHealthPayload(
  provider: TelefunProviderReadinessInput,
  runtime: TelefunHealthRuntimeInput,
) {
  const openAIReady = provider.openAIEnabled && provider.openAIConfigured;
  return {
    status: "ok" as const,
    uptime: runtime.uptime,
    timestamp: runtime.timestamp,
    readiness: {
      acceptingSessions: provider.geminiConfigured || openAIReady,
      providers: {
        gemini: {
          enabled: true,
          configured: provider.geminiConfigured,
          ready: provider.geminiConfigured,
        },
        openai: {
          enabled: provider.openAIEnabled,
          configured: provider.openAIConfigured,
          ready: openAIReady,
        },
      },
    },
  };
}
