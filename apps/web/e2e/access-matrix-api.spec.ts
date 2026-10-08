import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import { createServer, type Server } from "node:http";
import { ACCESS_MATRIX as matrix } from "./helpers/accessMatrix";
import { installLoopbackFetchGuard } from "./helpers/sidakRealBackend";

const actorId = "10000000-0000-4000-8000-000000000001";
let routers: Record<string, Hono>;
let database: Server;

test.beforeAll(async () => {
  installLoopbackFetchGuard();
  database = createServer((_req, res) => {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        code: "E2E_DB_UNAVAILABLE",
        message: "Local gate-only fixture",
      }),
    );
  });
  await new Promise<void>((resolve) =>
    database.listen(0, "127.0.0.1", resolve),
  );
  const address = database.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local stub port");
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    VITE_SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_SERVICE_ROLE_KEY: "e2e-only",
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
    WFM_SCHEDULE_SUPABASE_URL: "",
    WFM_SCHEDULE_SUPABASE_KEY: "",
    WFM_SCHEDULE_API_ALLOWED_ORIGINS: "",
  });
  const [admin, ai, ketik, pdkt, profiler, sidak, telefun] = await Promise.all([
    import("../../api/src/routes/admin"),
    import("../../api/src/routes/ai"),
    import("../../api/src/routes/ketik"),
    import("../../api/src/routes/pdkt"),
    import("../../api/src/routes/profiler"),
    import("../../api/src/routes/sidak"),
    import("../../api/src/routes/telefun"),
  ]);
  routers = {
    admin: admin.adminRouter as unknown as Hono,
    ai: ai.ai as unknown as Hono,
    ketik: ketik.ketik as unknown as Hono,
    pdkt: pdkt.pdkt as unknown as Hono,
    profiler: profiler.profiler as unknown as Hono,
    sidak: sidak.sidak as unknown as Hono,
    telefun: telefun.telefun as unknown as Hono,
  };
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    database?.close((error) => (error ? reject(error) : resolve())),
  );
});

function mount(role: string) {
  const app = new Hono<{
    Variables: { user: unknown; profile: unknown; token: string };
  }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: actorId, email: "access@local.test" });
    c.set("profile", { role, status: "active", full_name: "Access E2E" });
    c.set("token", "e2e-only");
    await next();
  });
  for (const [name, router] of Object.entries(routers))
    app.route(`/v1/${name}`, router as never);
  return app;
}

// Locked from the approved source matrix; do not derive expectations from gates.
for (const role of ["admin", "trainer", "leader", "agent"]) {
  test(`${role}: every endpoint matches the approved gate matrix`, async () => {
    const app = mount(role);
    for (const row of matrix) {
      const path = row.path.replace(/:[A-Za-z]+/g, actorId);
      const response = await Promise.resolve(
        app.request(`http://local.test${path}`, {
          method: row.method,
          ...(row.method === "GET" || row.method === "DELETE"
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: "{}",
              }),
        }),
      ).catch((error: unknown) => {
        // Supabase may throw its plain error object before Hono can serialize it.
        // Only the deliberately unavailable local fixture is accepted here.
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "E2E_DB_UNAVAILABLE"
        ) {
          return Response.json(
            { success: false, error: { code: "E2E_DB_UNAVAILABLE" } },
            { status: 503 },
          );
        }
        throw error;
      });
      const body = await response.json().catch(() => null);
      if (row.roles.some((allowedRole) => allowedRole === role)) {
        expect(body?.error?.code, `${role} ${row.method} ${row.path}`).not.toBe(
          "FORBIDDEN",
        );
      } else {
        expect(response.status, `${role} ${row.method} ${row.path}`).toBe(403);
        expect(body?.error?.code).toBe("FORBIDDEN");
      }
    }
  });
}

for (const role of ["qa", "tl", "spv", "om"]) {
  test(`${role}: removed auth roles are rejected at formerly permissive gates`, async () => {
    const app = mount(role);
    for (const path of [
      "/v1/ketik/generate",
      "/v1/ketik/review",
      "/v1/pdkt/session/init",
      "/v1/ai/generate",
    ]) {
      const response = await app.request(`http://local.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status, `${role} ${path}`).toBe(403);
      expect((await response.json()).error?.code).toBe("FORBIDDEN");
    }
  });
}

for (const role of ["admin", "trainer", "leader", "agent"]) {
  test(`${role}: SIDAK data reports retain their generation gate`, async () => {
    const response = await mount(role).request(
      "http://local.test/v1/sidak/reports/data",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Invalid filter stops before persistence while proving the route still exists.
        body: JSON.stringify({ startMonth: 0 }),
      },
    );
    expect(response.status).toBe(role === "agent" ? 403 : 400);
    expect((await response.json()).error?.code).toBe(
      role === "agent" ? "FORBIDDEN" : "VALIDATION_ERROR",
    );
  });
}

for (const role of [
  "admin",
  "trainer",
  "leader",
  "agent",
  "qa",
  "tl",
  "spv",
  "om",
]) {
  test(`${role}: removed SIDAK AI and archive endpoints return 404`, async () => {
    const app = mount(role);
    const endpoints = [
      ...[
        "generate",
        "export-docx",
        "export-html",
        "export-pdf",
        "chart-data",
        "save",
      ].map((action) => ({
        method: "POST",
        path: `/v1/sidak/reports/ai/${action}`,
      })),
      { method: "GET", path: "/v1/sidak/reports/archives" },
      { method: "GET", path: `/v1/sidak/reports/archives/${actorId}` },
      { method: "DELETE", path: `/v1/sidak/reports/archives/${actorId}` },
    ];
    for (const endpoint of endpoints) {
      const response = await app.request(`http://local.test${endpoint.path}`, {
        method: endpoint.method,
        ...(endpoint.method === "POST"
          ? {
              headers: { "content-type": "application/json" },
              body: "{}",
            }
          : {}),
      });
      expect(
        response.status,
        `${role} ${endpoint.method} ${endpoint.path}`,
      ).toBe(404);
    }
  });
}

// Activity logs are an append-only audit trail (plans/markdown/management-pages-redesign.md):
// no role may delete them, so the route must not exist at all.
for (const role of ["admin", "trainer", "leader", "agent"]) {
  test(`${role}: activity logs cannot be deleted`, async () => {
    const response = await mount(role).request(
      `http://local.test/v1/admin/activity-logs/${actorId}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
}
