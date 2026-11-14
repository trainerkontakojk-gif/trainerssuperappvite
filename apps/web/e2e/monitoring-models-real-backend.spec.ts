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
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`trainer chooses Hydrogen alongside Flash and resets through the real backend (${viewport.width})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    runSql(
      env,
      "DELETE FROM ai_model_policy; DELETE FROM ai_model_policy_audit;",
    );
    (
      await import("../../api/src/lib/ai-model-policy")
    ).invalidateAiModelPolicyCache();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
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
    await expect(
      page.locator("label", { hasText: "Gemini 3.8 Flash" }),
    ).toBeVisible();
    await page.locator("label", { hasText: "Gemini 4 Hydrogen" }).click();
    await expect(
      page.getByRole("button", { name: "Simpan Perubahan" }),
    ).toBeInViewport();
    await page.screenshot({
      path: `/tmp/hydrogen-model-dialog-${viewport.width}.png`,
    });
    await page.getByRole("button", { name: "Simpan Perubahan" }).click();
    await expect(row.getByText("Kustom (Database)")).toBeVisible();
    expect(
      runSql(
        env,
        "SELECT model_id FROM ai_model_policy WHERE task='sidak_forecast'",
      ),
    ).toBe("gemini-4-hydrogen");
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
    expect(pageErrors).toEqual([]);
  });
}
