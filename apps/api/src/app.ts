import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ApiResponse, UserProfile } from "@trainers/types";
import { env } from "./lib/env";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import { sidak } from "./routes/sidak";
import { ketik } from "./routes/ketik";
import { pdkt } from "./routes/pdkt";
import { ai } from "./routes/ai";
import { profiler } from "./routes/profiler";
import { adminRouter } from "./routes/admin";
import { telefun } from "./routes/telefun";

const allowedOrigins =
  env.NODE_ENV === "production"
    ? env.ALLOWED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) || []
    : ["http://localhost:3000"];

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
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
  })
  .use("/v1/*", authMiddleware)
  .get("/v1/me", (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    return c.json({ success: true, data: { user, profile } });
  })
  .route("/v1/sidak", sidak)
  .route("/v1/ketik", ketik)
  .route("/v1/pdkt", pdkt)
  .route("/v1/ai", ai)
  .route("/v1/profiler", profiler)
  .route("/v1/admin", adminRouter)
  .route("/v1/telefun", telefun);

export type AppType = typeof routes;
export default app;
