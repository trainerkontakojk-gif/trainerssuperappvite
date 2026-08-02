import { Context, Next } from "hono";

export interface TelefunDistributedRateLimitClient {
  rpc(
    functionName: "consume_telefun_realtime_rate_limit",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export type TelefunRateLimitScope = "session-create" | "session-write";

export class TelefunDistributedRateLimitError extends Error {
  constructor() {
    super("distributed rate limit unavailable");
    this.name = "TelefunDistributedRateLimitError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function consumeTelefunDistributedRateLimit(input: {
  client: TelefunDistributedRateLimitClient;
  userId: string;
  sessionId?: string;
  provider: "openai-webrtc" | "gemini-live" | "openai-websocket";
  scope: TelefunRateLimitScope;
  requestLimit: number;
  windowSeconds?: number;
}): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: string;
  reason: string;
}> {
  const scopeKey = [
    `user:${input.userId}`,
    ...(input.sessionId ? [`session:${input.sessionId}`] : []),
    `provider:${input.provider}`,
    input.scope,
  ].join(":");
  let result: { data: unknown; error: unknown };
  try {
    result = await input.client.rpc("consume_telefun_realtime_rate_limit", {
      p_scope_key: scopeKey,
      p_user_id: input.userId,
      p_session_id: input.sessionId ?? null,
      p_provider: input.provider,
      p_window_seconds: Math.max(
        1,
        Math.min(3_600, Math.floor(input.windowSeconds ?? 60)),
      ),
      p_request_limit: Math.max(
        1,
        Math.min(10_000, Math.floor(input.requestLimit)),
      ),
    });
  } catch {
    throw new TelefunDistributedRateLimitError();
  }
  const row =
    Array.isArray(result.data) && result.data.length === 1
      ? result.data[0]
      : result.data;
  if (result.error || !isRecord(row)) {
    throw new TelefunDistributedRateLimitError();
  }
  const remaining = row.remaining;
  const resetAt = row.reset_at;
  const reason = row.reason;
  if (
    typeof row.allowed !== "boolean" ||
    typeof remaining !== "number" ||
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    typeof resetAt !== "string" ||
    resetAt.length > 64 ||
    typeof reason !== "string" ||
    reason.length > 128
  ) {
    throw new TelefunDistributedRateLimitError();
  }
  return {
    allowed: row.allowed,
    remaining,
    resetAt,
    reason,
  };
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const globalStore = new Map<string, RateLimitEntry>();
const aiStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 200;
const MAX_AI_REQUESTS = 50;

function getKey(c: Context): string {
  const profile = c.get("profile") as
    | { role?: string; full_name?: string }
    | undefined;
  const user = c.get("user") as { id?: string } | undefined;
  if (profile && user?.id) return `user:${user.id}`;
  const forwarded = c.req.header("x-forwarded-for");
  return `ip:${forwarded?.split(",")[0]?.trim() || "local"}`;
}

export const rateLimitMiddleware = async (c: Context, next: Next) => {
  const forwarded = c.req.header("x-forwarded-for");
  const key = `ip:${forwarded?.split(",")[0]?.trim() || "local"}`;
  const now = Date.now();
  let entry = globalStore.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    globalStore.set(key, entry);
  }

  entry.count++;

  c.res.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  c.res.headers.set(
    "X-RateLimit-Remaining",
    String(Math.max(0, MAX_REQUESTS - entry.count)),
  );
  c.res.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(entry.resetAt / 1000)),
  );

  if (entry.count > MAX_REQUESTS) {
    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
      },
      429,
    );
  }

  await next();
};

export const aiRateLimitMiddleware = async (c: Context, next: Next) => {
  const key = getKey(c);
  const now = Date.now();
  let entry = aiStore.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    aiStore.set(key, entry);
  }

  entry.count++;

  c.res.headers.set("X-AiRateLimit-Limit", String(MAX_AI_REQUESTS));
  c.res.headers.set(
    "X-AiRateLimit-Remaining",
    String(Math.max(0, MAX_AI_REQUESTS - entry.count)),
  );
  c.res.headers.set(
    "X-AiRateLimit-Reset",
    String(Math.ceil(entry.resetAt / 1000)),
  );

  if (entry.count > MAX_AI_REQUESTS) {
    return c.json(
      {
        success: false,
        error: {
          code: "AI_RATE_LIMITED",
          message: "AI requests limit reached. Please try again later.",
        },
      },
      429,
    );
  }

  await next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of globalStore) {
    if (now >= entry.resetAt) globalStore.delete(key);
  }
  for (const [key, entry] of aiStore) {
    if (now >= entry.resetAt) aiStore.delete(key);
  }
}, 60_000);
