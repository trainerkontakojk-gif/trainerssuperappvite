import { expect, test } from "@playwright/test";
import { expectHermetic, openHermeticShell } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test("callback menampilkan pemulihan bila pembacaan sesi menolak", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, { path: "/" });
  await expect(
    page.getByRole("link", { name: /Buka Dashboard/ }).first(),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(async () => {
    // Inject only the rejection at the SDK boundary; the callback and router
    // remain the actual application code.
    const url = `${window.location.origin}/src/lib/supabase.ts`;
    const { supabase } = await import(/* @vite-ignore */ url);
    supabase.auth.getSession = async () => {
      throw new Error("E2E storage failure");
    };
    window.history.pushState({}, "", "/auth/callback");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByText(
      "Login Google gagal diselesaikan. Silakan kembali dan coba lagi.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Kembali ke halaman login" }),
  ).toBeVisible();
  await expect(page.getByText(/E2E storage failure/)).toHaveCount(0);
  expectHermetic(audit);
});
