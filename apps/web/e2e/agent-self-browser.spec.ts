import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { buildMockAuth } from "./helpers/mockAuth";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Agent self views — hermetic (plan `plans/markdown/agent-self-sidak-ktp.md`).
 *
 * Contract: after password login an agent lands on `/sidak/saya` (staff keep
 * `/dashboard`); SIDAK saya shows only the self aggregate from
 * `GET /sidak/me`; KTP saya shows the own row from `GET /profiler/me`
 * read-only; unlinked accounts get the "hubungi admin/trainer" state. The
 * fail-closed guard proves no staff SIDAK/KTP endpoint is requested.
 */

const ok = (data: unknown) => ({ body: { success: true, data } });

const SIDAK_ME = {
  linked: true,
  qa: {
    serviceType: "chat",
    periodLabel: "Okt 2026",
    score: 91.5,
    target: 95,
    gapToTarget: 3.5,
    previousLabel: "Sep 2026",
    delta: 2.5,
    trend: [
      { periodLabel: "Sep 2026", score: 89 },
      { periodLabel: "Okt 2026", score: 91.5 },
    ],
    topParameters: [{ name: "Akurasi informasi", count: 3 }],
    recommendation: "Pakai checklist verifikasi sebelum menutup tiket.",
  },
  standing: {
    year: 2026,
    serviceType: "chat",
    combinedTeam: {
      rank: 4,
      total: 18,
      scopeId: "f1",
      scopeLabel: "Tim Chat Gabungan",
      basis: "least_findings_ytd",
    },
    leaderTeam: null,
    forecast: {
      status: "improving",
      label: "Membaik",
      supportingText: "Temuan cenderung turun dalam 3 bulan terakhir.",
      findingsSlope: -0.4,
      sourcePointCount: 6,
      confidence: "medium",
      horizonMonths: 3,
    },
  },
};

const KTP_ME = {
  linked: true,
  peserta: {
    id: "p-self",
    batch_name: "Batch 12",
    nomor_urut: 3,
    nama: "Sari Agen",
    tim: "Chat",
    jabatan: "Agent",
    no_ktp: "3174000000000001",
    alamat_tinggal: "Jl. Mawar 1, Jakarta",
    tgl_lahir: "1998-02-14",
    nama_bank: "Bank Uji",
  },
};

function selfMocks(linked = true): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/sidak/me",
      ...ok(linked ? SIDAK_ME : { linked: false, qa: null, standing: null }),
    },
    {
      method: "GET",
      path: "/api/v1/profiler/me",
      ...ok(linked ? KTP_ME : { linked: false, peserta: null }),
    },
  ];
}

/** Mocks the Supabase password grant, user and profile for a real login. */
async function mockLogin(page: Page, role: "agent" | "trainer") {
  const { authUser, authSession, authProfile } = buildMockAuth({ role });
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/auth/v1/token*", (route) =>
    route.fulfill(
      json({
        ...authSession,
        user: authUser,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
  );
  await page.route("**/auth/v1/user*", (route) =>
    route.fulfill(json(authUser)),
  );
  await page.route("**/rest/v1/profiles*", (route) =>
    route.fulfill({
      ...json([authProfile]),
      headers: { "content-range": "0-0/1" },
    }),
  );
}

async function login(page: Page) {
  await page
    .getByRole("button", { name: /Masuk ke Platform/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("uji@trainers.local");
  await dialog.getByLabel("Password").fill("rahasia-uji");
  await dialog.getByRole("button", { name: /Masuk sekarang/ }).click();
}

test.describe("Agent self views", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("agent password login lands on SIDAK saya with only self data", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/",
      auth: false,
      apiMocks: selfMocks(),
      beforeNavigate: (p) => mockLogin(p, "agent"),
    });
    await login(page);
    await expect(page).toHaveURL(/\/sidak\/saya$/, { timeout: 20000 });
    const main = page.getByRole("region", { name: "Konten halaman" });
    await expect(
      main.getByRole("heading", { level: 1, name: "SIDAK saya" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      main.getByText("91,5", { exact: false }).first(),
    ).toBeVisible();
    await expect(main.getByText("Okt 2026").first()).toBeVisible();
    await expect(main.getByText(/4\s*dari\s*18/)).toBeVisible();
    await expect(main.getByText("Membaik")).toBeVisible();
    await expect(main.getByText("Akurasi informasi")).toBeVisible();
    // Staff SIDAK tools are absent.
    await expect(page.getByRole("link", { name: /Input temuan/ })).toHaveCount(
      0,
    );
    await expect(page.locator('a[href="/sidak/saya"]').first()).toBeVisible();
    await expect(
      page.locator('a[href="/profiler/saya"]').first(),
    ).toBeVisible();
    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("staff password login still lands on Beranda", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/",
      auth: false,
      apiMocks: [],
      beforeNavigate: async (p) => {
        await mockLogin(p, "trainer");
        // Beranda data is out of scope here; answer any /api with an empty 503.
        await p.route("**/api/v1/**", (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ success: false, error: { code: "E2E" } }),
          }),
        );
      },
    });
    await login(page);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
    expect(audit.blockedExternal).toEqual([]);
  });

  test("KTP saya shows the agent's own row read-only", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/saya",
      auth: { role: "agent" },
      apiMocks: selfMocks(),
    });
    const main = page.getByRole("region", { name: "Konten halaman" });
    await expect(
      main.getByRole("heading", { level: 1, name: "Sari Agen" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(main.getByText("3174000000000001")).toBeVisible();
    await expect(main.getByText("Jl. Mawar 1, Jakarta")).toBeVisible();
    await expect(main.getByText("Bank Uji")).toBeVisible();
    await expect(
      main.getByRole("button", { name: /Edit|Pindah folder/ }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("unlinked agent sees the contact-trainer state on both pages", async ({
    page,
  }) => {
    for (const path of ["/sidak/saya", "/profiler/saya"]) {
      const audit = await openHermeticShell(page, {
        path,
        auth: { role: "agent" },
        apiMocks: selfMocks(false),
      });
      const main = page.getByRole("region", { name: "Konten halaman" });
      await expect(
        main.getByText(/belum ditautkan ke data peserta/),
        path,
      ).toBeVisible({ timeout: 20000 });
      await expect(main.getByText(/Hubungi admin atau trainer/)).toBeVisible();
      expectHermetic(audit);
    }
  });

  test("agent cannot open the staff SIDAK or KTP workspace", async ({
    page,
  }) => {
    for (const path of ["/sidak/dashboard", "/profiler"]) {
      await openHermeticShell(page, {
        path,
        auth: { role: "agent" },
        apiMocks: selfMocks(),
        waitForUrl: /\/unauthorized/,
      });
      await expect(page, path).toHaveURL(/\/unauthorized/);
    }
  });
});
