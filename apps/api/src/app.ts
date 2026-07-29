import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ApiResponse } from "@trainers/types";
import { env } from "./lib/env";
import { authMiddleware, type AuthVariables } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import {
  applySecurityHeaders,
  securityHeadersMiddleware,
} from "./middleware/securityHeaders";
import { sidak } from "./routes/sidak";
import { ketik } from "./routes/ketik";
import { pdkt } from "./routes/pdkt";
import { ai } from "./routes/ai";
import { profiler } from "./routes/profiler";
import { adminRouter } from "./routes/admin";
import { telefun } from "./routes/telefun";
import { getLeaderAccessStatus } from "./services/admin-service";
import { revokeOwnSessions } from "./services/account-service";

const allowedOrigins =
  env.NODE_ENV === "production"
    ? env.ALLOWED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) || []
    : env.ALLOWED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) || ["http://localhost:3000", "http://localhost:3005"];

if (env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn(
    "[API] ⚠️  ALLOWED_ORIGINS is empty in production. CORS will block all cross-origin requests.",
  );
  console.warn(
    "[API] Set ALLOWED_ORIGINS to your web service URL (e.g. https://web-xxx.up.railway.app)",
  );
}

const app = new Hono().basePath("/api");

app.use("*", securityHeadersMiddleware);
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposeHeaders: ["x-settings-version"],
  }),
);
app.use(requestLogger);
app.use("/v1/*", rateLimitMiddleware);

app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`);

  const originHeader = c.req.header("Origin");
  const matchedOrigin =
    originHeader && allowedOrigins.includes(originHeader) ? originHeader : null;

  applySecurityHeaders(c.res.headers);

  if (matchedOrigin) {
    c.header("Access-Control-Allow-Origin", matchedOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Expose-Headers", "x-settings-version");
    c.header("Vary", "Origin", { append: true });
  } else {
    c.res.headers.delete("Access-Control-Allow-Origin");
    c.res.headers.delete("Access-Control-Allow-Credentials");
  }

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
  .post("/me/revoke-sessions", async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const authHeader = c.req.header("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!accessToken) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Unauthorized",
          },
        },
        401,
      );
    }

    try {
      const data = await revokeOwnSessions({
        accessToken,
        userId: user.id,
        actorName: profile.full_name || user.email || "System",
      });
      return c.json({ success: true, data });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: "SESSION_REVOKE_FAILED",
            message: "Gagal logout dari semua perangkat. Silakan coba lagi.",
          },
        },
        500,
      );
    }
  })
  .route("/sidak", sidak)
  .route("/ketik", ketik)
  .route("/pdkt", pdkt)
  .route("/ai", ai)
  .route("/profiler", profiler)
  .route("/admin", adminRouter)
  .route("/telefun", telefun);

// Combined for RPC type export — no `.use()` calls, clean type inference
const _allRoutes = new Hono().route("/", healthCheck).route("/v1", v1Api);

// ── Actual app with middleware ──
app.route("/", healthCheck).use("/v1/*", authMiddleware).route("/v1", v1Api);

export type AppType = typeof _allRoutes;
export type KetikRouteType = typeof ketik;
export type HealthRouteType = typeof healthCheck;
export default app;
