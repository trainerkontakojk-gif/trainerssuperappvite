export interface TelefunOpenAIReadiness {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
}

interface FetchTelefunOpenAIReadinessOptions {
  websocketUrl?: unknown;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_READINESS_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deriveTelefunHealthUrl(websocketUrl: unknown): string {
  if (typeof websocketUrl !== "string" || !websocketUrl.trim()) {
    throw new Error("VITE_TELEFUN_WS_URL belum dikonfigurasi.");
  }

  let parsed: URL;
  try {
    parsed = new URL(websocketUrl);
  } catch {
    throw new Error("VITE_TELEFUN_WS_URL tidak valid.");
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("VITE_TELEFUN_WS_URL harus berupa URL WebSocket.");
  }

  const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  return new URL("/health", `${protocol}//${parsed.host}`).toString();
}

export function parseTelefunOpenAIReadiness(
  payload: unknown,
): TelefunOpenAIReadiness {
  if (!isRecord(payload)) {
    throw new Error("Telefun health response is invalid");
  }
  const readiness = payload.readiness;
  if (!isRecord(readiness) || !isRecord(readiness.providers)) {
    throw new Error("Telefun health response is invalid");
  }
  const openai = readiness.providers.openai;
  if (
    !isRecord(openai) ||
    typeof openai.enabled !== "boolean" ||
    typeof openai.configured !== "boolean" ||
    typeof openai.ready !== "boolean"
  ) {
    throw new Error("Telefun health response is invalid");
  }

  return {
    enabled: openai.enabled,
    configured: openai.configured,
    ready: openai.ready,
  };
}

export async function fetchTelefunOpenAIReadiness({
  websocketUrl = import.meta.env.VITE_TELEFUN_WS_URL,
  fetchImpl = fetch,
  signal,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
}: FetchTelefunOpenAIReadinessOptions = {}): Promise<TelefunOpenAIReadiness> {
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  if (signal?.aborted) {
    abortRequest();
  } else {
    signal?.addEventListener("abort", abortRequest, { once: true });
  }
  const timeout = globalThis.setTimeout(abortRequest, timeoutMs);

  try {
    const response = await fetchImpl(deriveTelefunHealthUrl(websocketUrl), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Telefun health request failed (${response.status})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Telefun health response is invalid");
    }
    return parseTelefunOpenAIReadiness(payload);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
}
