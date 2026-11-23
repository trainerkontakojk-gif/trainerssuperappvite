import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { openHermeticShell } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

const env = readLoopbackEnv();
const suffix = randomUUID().slice(0, 8);
const thinkingScopes = [
  "ketik_reply",
  "ketik_review",
  "pdkt_reply",
  "pdkt_evaluation",
  "telefun_transcription",
  "telefun_assessment",
  "telefun_coaching",
  "sidak_forecast",
] as const;
let admin: Awaited<ReturnType<typeof createUserWithJwt>>;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;

function thinkingTableExists(): boolean {
  return runSql(
    env,
    "SELECT to_regclass('public.ai_thinking_policy') IS NOT NULL",
  ) === "t";
}

async function clearThinkingPolicies(): Promise<void> {
  if (!thinkingTableExists()) return;
  for (const scope of thinkingScopes) {
    const response = await callApi(
      "DELETE",
      `/monitoring/thinking/${scope}`,
      admin.token,
    );
    expect(response.status, `reset ${scope}`).toBe(200);
  }
  runSql(env, "DELETE FROM ai_thinking_policy_audit;");
}

async function callApi(
  method: string,
  path: string,
  token: string,
  body?: unknown,
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ai${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function bridgeThinkingApi(
  route: import("@playwright/test").Route,
  token: string,
) {
  const request = route.request();
  const url = new URL(request.url());
  const response = await tnaApiRequest(
    app,
    `http://localhost${url.pathname}${url.search}`,
    {
      method: request.method(),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(request.postData() ? { body: request.postData()! } : {}),
    },
  );
  await route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: await response.text(),
  });
}

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  admin = await createUserWithJwt(env, "admin", `thinking-${suffix}`);
  trainer = await createUserWithJwt(env, "trainer", `thinking-${suffix}`);
  agent = await createUserWithJwt(env, "agent", `thinking-${suffix}`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.beforeEach(async () => {
  await clearThinkingPolicies();
});

test.afterAll(async () => {
  await clearThinkingPolicies();
  for (const user of [admin, trainer, agent].filter(Boolean)) {
    runSql(env, `DELETE FROM activity_logs WHERE user_id='${user.userId}'`);
    expect(
      (await createAdmin(env).auth.admin.deleteUser(user.userId)).error,
    ).toBeNull();
  }
});

test("admin changes a thinking level in Monitoring → Model and sees its persisted audit", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openHermeticShell(page, {
    path: "/monitoring/model",
    auth: { role: "admin", fullName: "E2E admin" },
    beforeNavigate: async (target) => {
      await target.route(
        "**/api/v1/ai/monitoring/thinking**",
        (route) => bridgeThinkingApi(route, admin.token),
      );
      await target.route("**/api/v1/ai/monitoring/models**", (route) =>
        bridgeThinkingApi(route, admin.token),
      );
    },
  });

  await expect(
    page.getByRole("heading", { name: "Thinking level per use case" }),
  ).toBeVisible();
  const thinkingSection = page
    .getByRole("heading", { name: "Thinking level per use case" })
    .locator("xpath=ancestor::section[1]");
  const row = thinkingSection
    .locator("table")
    .first()
    .locator("tbody tr")
    .filter({ hasText: "Balasan simulasi KETIK" });
  await row.getByRole("button", { name: "Ubah" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("radio", { name: "Medium" }).check();
  await page.screenshot({
    path: `/tmp/ai-thinking-level-dialog-${suffix}.png`,
  });
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();

  await expect(row.getByRole("cell").nth(1)).toContainText("Medium");
  await expect(
    thinkingSection.getByRole("heading", {
      name: "Riwayat Perubahan Thinking Level",
    }),
  ).toBeVisible();
  const auditRow = thinkingSection
    .locator("table")
    .nth(1)
    .getByRole("row", { name: /Balasan simulasi KETIK/ });
  await expect(auditRow.getByRole("cell").nth(3)).toHaveText("E2E admin");
  expect(
    runSql(
      env,
      "SELECT thinking_level FROM ai_thinking_policy WHERE scope='ketik_reply'",
    ),
  ).toBe("MEDIUM");

  const audit = await callApi("GET", "/monitoring/thinking/audit", admin.token);
  expect(audit.status).toBe(200);
  const body = (await audit.json()) as {
    success: true;
    data: { items: Array<{ scope: string; newThinkingLevel: string | null }> };
  };
  expect(body.data.items[0]).toMatchObject({
    scope: "ketik_reply",
    newThinkingLevel: "MEDIUM",
  });
  expect(pageErrors).toEqual([]);
});

test("saved policy remains committed when its follow-up reload fails", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  let mutationCommitted = false;
  await openHermeticShell(page, {
    path: "/monitoring/model",
    auth: { role: "admin", fullName: "E2E admin" },
    beforeNavigate: async (target) => {
      await target.route(
        "**/api/v1/ai/monitoring/thinking**",
        async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (
            mutationCommitted &&
            request.method() === "GET" &&
            url.pathname === "/api/v1/ai/monitoring/thinking"
          ) {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                success: false,
                error: { code: "DB_ERROR", message: "reload unavailable" },
              }),
            });
            return;
          }
          await bridgeThinkingApi(route, admin.token);
          if (request.method() === "PUT") mutationCommitted = true;
        },
      );
      await target.route("**/api/v1/ai/monitoring/models**", (route) =>
        bridgeThinkingApi(route, admin.token),
      );
    },
  });

  const thinkingSection = page
    .getByRole("heading", { name: "Thinking level per use case" })
    .locator("xpath=ancestor::section[1]");
  const row = thinkingSection
    .locator("table")
    .first()
    .locator("tbody tr")
    .filter({ hasText: "Balasan simulasi KETIK" });
  await row.getByRole("button", { name: "Ubah" }).click();
  await page.getByRole("radio", { name: "Medium" }).check();
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Pengaturan thinking level gagal dimuat.",
  );
  expect(
    runSql(
      env,
      "SELECT thinking_level FROM ai_thinking_policy WHERE scope='ketik_reply'",
    ),
  ).toBe("MEDIUM");
  const audit = await callApi("GET", "/monitoring/thinking/audit", admin.token);
  expect(audit.status).toBe(200);
  const body = (await audit.json()) as {
    success: true;
    data: { items: Array<{ scope: string; newThinkingLevel: string | null }> };
  };
  expect(body.data.items[0]).toMatchObject({
    scope: "ketik_reply",
    newThinkingLevel: "MEDIUM",
  });
  expect(browserErrors).toEqual([]);
});

test("trainer shares model-policy access; agent is denied", async () => {
  const getResponse = await callApi(
    "GET",
    "/monitoring/thinking",
    trainer.token,
  );
  expect(getResponse.status).toBe(200);

  const putResponse = await callApi(
    "PUT",
    "/monitoring/thinking/ketik_reply",
    trainer.token,
    { thinkingLevel: "HIGH" },
  );
  expect(putResponse.status).toBe(200);

  const deniedGet = await callApi("GET", "/monitoring/thinking", agent.token);
  expect(deniedGet.status).toBe(403);

  const deniedPut = await callApi(
    "PUT",
    "/monitoring/thinking/ketik_reply",
    agent.token,
    { thinkingLevel: "LOW" },
  );
  expect(deniedPut.status).toBe(403);
});
