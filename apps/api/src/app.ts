import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ApiResponse } from "@trainers/types";
import { env } from "./lib/env";
import {
  authMiddleware,
  type AuthVariables,
} from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import { sidak } from "./routes/sidak";
import { ketik } from "./routes/ketik";
import { pdkt } from "./routes/pdkt";
import { ai } from "./routes/ai";
import { profiler } from "./routes/profiler";
import { adminRouter } from "./routes/admin";
import { telefun } from "./routes/telefun";
import { getLeaderAccessStatus } from "./services/admin-service";

const allowedOrigins =
  env.NODE_ENV === "production"
    ? env.ALLOWED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) || []
    : ["http://localhost:3000", "http://localhost:3005"];

if (env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn(
    "[API] ⚠️  ALLOWED_ORIGINS is empty in production. CORS will block all cross-origin requests.",
  );
  console.warn(
    "[API] Set ALLOWED_ORIGINS to your web service URL (e.g. https://web-xxx.up.railway.app)",
  );
}

const app = new Hono().basePath("/api");

app.use("*", cors({ origin: allowedOrigins, credentials: true }));
app.use(requestLogger);
app.use("/v1/*", rateLimitMiddleware);

app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`);
  if (err instanceof HTTPException) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: {
          code: err.res ? String(err.res.status) : "HTTP_ERROR",
          message: err.message,
        },
      },
      err.status,
    );
  }
  return c.json<ApiResponse<never>>(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500,
  );
});

app.notFound((c) => {
  return c.json<ApiResponse<never>>(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404,
  );
});

// ── Non-v1 routes (no auth middleware) ──
const healthCheck = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/auth/me", (c) => {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: {
          code: "DEPRECATED",
          message:
            "Endpoint ini sudah tidak digunakan. Gunakan /v1/me dengan autentikasi.",
        },
      },
      410,
    );
  });

// ── V1 routes (behind auth middleware) ──
const v1Api = new Hono<{ Variables: AuthVariables }>()
  .get("/me/access-status", async (c) => {
    const user = c.get("user");
    try {
      const status = await getLeaderAccessStatus(user.id);
      return c.json({ success: true, data: status });
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: e.message || "Gagal memuat status akses",
          },
        },
        500,
      );
    }
  })
  .get("/me", (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    return c.json({ success: true, data: { user, profile } });
  })
  .route("/sidak", sidak)
  .route("/ketik", ketik)
  .route("/pdkt", pdkt)
  .route("/ai", ai)
  .route("/profiler", profiler)
  .route("/admin", adminRouter)
  .route("/telefun", telefun);

// Combined for RPC type export — no `.use()` calls, clean type inference
const _allRoutes = new Hono()
  .route("/", healthCheck)
  .route("/v1", v1Api);

// ── Actual app with middleware ──
app
  .route("/", healthCheck)
  .use("/v1/*", authMiddleware)
  .route("/v1", v1Api);

export type AppType = typeof _allRoutes;
export type KetikRouteType = typeof ketik;
export type HealthRouteType = typeof healthCheck;
export default app;
