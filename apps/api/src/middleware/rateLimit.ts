import { Context, Next } from "hono";

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
