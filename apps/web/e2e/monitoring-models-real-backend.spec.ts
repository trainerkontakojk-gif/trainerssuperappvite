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

// Shell authentication is a browser fixture. Every Model tab request executes
// the real Hono router with a real local trainer JWT and local Postgres.
const env = readLoopbackEnv();
let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  trainer = await createUserWithJwt(env, "trainer", `model-ui-${randomUUID()}`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  runSql(
    env,
    "DELETE FROM ai_model_policy; DELETE FROM ai_model_policy_audit;",
  );
});
test.afterAll(async () => {
  if (!trainer) return;
  runSql(
    env,
    `DELETE FROM ai_model_policy; DELETE FROM ai_model_policy_audit; DELETE FROM activity_logs WHERE user_id='${trainer.userId}';`,
  );
  expect(
    (await createAdmin(env).auth.admin.deleteUser(trainer.userId)).error,
  ).toBeNull();
});
test("trainer saves and resets a policy through the real backend", async ({
  page,
}) => {
  await openHermeticShell(page, {
    path: "/monitoring/model",
    beforeNavigate: async (page) => {
      await page.route("**/api/v1/ai/monitoring/models**", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const response = await tnaApiRequest(
          app,
          `http://localhost${url.pathname}${url.search}`,
          {
            method: req.method(),
            headers: {
              Authorization: `Bearer ${trainer.token}`,
              "Content-Type": "application/json",
            },
            ...(req.postData() ? { body: req.postData()! } : {}),
          },
        );
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      });
    },
  });
  const row = page.locator("tr", { hasText: "Prediksi Dashboard SIDAK" });
  await row.getByRole("button", { name: "Ubah" }).click();
  await page.locator("label", { hasText: "Gemini 3.5 Flash Lite" }).click();
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await expect(row.getByText("Kustom (Database)")).toBeVisible();
  expect(
    runSql(
      env,
      "SELECT model_id FROM ai_model_policy WHERE task='sidak_forecast'",
    ),
  ).toBe("gemini-3.5-flash-lite");
  await expect(page.getByText("E2E trainer", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Bawaan" }).click();
  await page.getByRole("button", { name: "Kembalikan", exact: true }).click();
  await expect(row.getByText("Bawaan Sistem")).toBeVisible();
  expect(
    runSql(
      env,
      "SELECT count(*) FROM ai_model_policy WHERE task='sidak_forecast'",
    ),
  ).toBe("0");
  expect(
    runSql(
      env,
      `SELECT count(*) FROM ai_model_policy_audit WHERE changed_by='${trainer.userId}'`,
    ),
  ).toBe("2");
});
