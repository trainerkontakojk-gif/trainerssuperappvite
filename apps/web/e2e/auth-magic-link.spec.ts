import { test, expect } from "@playwright/test";

/**
 * Real magic link e2e — hanya jalan kalau E2E_TEST_EMAIL ada di env.
 * Untuk Pi: set di .env.local atau export E2E_TEST_EMAIL=...
 * Jangan commit email/token ke repo (handoff.md:425).
 *
 * Flow: generateLink via Supabase Admin API → page.goto(magicLink) → verify session.
 * Butuh: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY di env.
 *
 * Di Pi: pi run --cwd ... 'E2E_TEST_EMAIL=test@muamalat.co.id npx playwright test auth-magic-link'
 *
 * SUPABASE_URL wajib loopback (Supabase lokal). Host lain ditolak (throw, bukan
 * skip) sebelum request apa pun: generate_link dengan service-role menulis token
 * auth di project tujuan. Lihat plans/markdown/e2e-webserver-isolation.md (G2).
 */
const E2E_EMAIL = process.env.E2E_TEST_EMAIL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertLoopbackSupabase(raw: string): void {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    // An unparsable URL is refused below like any other non-loopback host.
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
    throw new Error(
      `[e2e guard] auth-magic-link refuses non-loopback SUPABASE_URL host: ${host || "(invalid URL)"}`,
    );
  }
}

test.describe("Auth — Magic Link (real)", () => {
  test.skip(!E2E_EMAIL, "E2E_TEST_EMAIL not set — skip real magic link test (mock only)");

  test("should login via magic link and reach dashboard", async ({ page, request }) => {
    test.skip(!SUPABASE_URL, "SUPABASE_URL not set");
    assertLoopbackSupabase(SUPABASE_URL!);
    test.skip(!SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY not set");

    // 1. Generate magic link via Admin API (tidak kirim email beneran)
    const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      headers: {
        apikey: SERVICE_KEY!,
        Authorization: `Bearer ${SERVICE_KEY!}`,
        "Content-Type": "application/json",
      },
      data: {
        type: "magiclink",
        email: E2E_EMAIL,
        options: {
          redirectTo: "http://localhost:3005/auth/callback",
        },
      },
    });

    if (!res.ok()) {
      const body = await res.text();
      test.skip(true, `generateLink failed [${res.status()}] ${body.slice(0, 300)}`);
      return;
    }

    const json = await res.json();
    const actionLink: string | undefined = json?.properties?.action_link ?? json?.action_link;

    if (!actionLink) {
      test.skip(true, "No action_link returned from generateLink");
      return;
    }

    console.log(`[magic-link] generated for ${E2E_EMAIL}`);

    // 2. Buka magic link — Supabase akan set session + redirect ke /auth/callback
    await page.goto(actionLink);
    await page.waitForURL("**/auth/callback**", { timeout: 15000 }).catch(() => {});

    // 3. Tunggu redirect ke dashboard atau landing authenticated
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log(`[magic-link] after goto: ${url}`);

    // 4. Verify: coba buka dashboard, harus tidak redirect ke / lagi
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/$/);
    // Dashboard header harus ada kalau session berhasil
    await expect(page.locator("h1", { hasText: "Pusat Kendali" })).toBeVisible({ timeout: 10000 });
  });
});
