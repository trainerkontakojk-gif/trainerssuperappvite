import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { buildMockAuth } from "./helpers/mockAuth";
import {
  AGENT_ID,
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  richAgentDetailPayload,
  richQuickviewPayload,
} from "./helpers/sidakAgentDetailLayoutFixture";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Agent self views — hermetic (plan `plans/markdown/agent-self-sidak-ktp.md`,
 * revision 2).
 *
 * Contract: after password login an agent lands on the staff agent detail
 * page for their own participant (`/sidak/saya` resolves the ID from
 * `GET /profiler/me`); staff keep `/dashboard`. As agent the page is
 * read-only: no agent switcher, no Input Audit, no edit; report download
 * stays. Another participant ID redirects to the own page. KTP saya shows the
 * own row read-only with a Slide view. Unlinked accounts get the
 * "hubungi admin atau trainer" state.
 */

const ok = (data: unknown) => ({ body: { success: true, data } });
const OWN_NAME = "Rahmawati Kusumaningrum";

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

function newAudit(): AgentAudit {
  return { mockedApi: [], blockedApi: [], blockedExternal: [] };
}

test.describe("Agent self views", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("agent password login lands on their own SIDAK agent detail", async ({
    page,
  }) => {
    const apiMocks: ApiMock[] = [
      { method: "GET", path: "/api/v1/profiler/me", ...ok(KTP_ME) },
    ];
    const audit = await openHermeticShell(page, {
      path: "/",
      auth: false,
      apiMocks,
      beforeNavigate: (p) => mockLogin(p, "agent"),
    });
    await login(page);
    await expect(page).toHaveURL(/\/sidak\/agents\/p-self(\?|$)/, {
      timeout: 20000,
    });
    console.log("[audit]", formatAudit(audit));
    expect(audit.mockedApi).toContain("GET /api/v1/profiler/me");
    expect(audit.blockedExternal).toEqual([]);
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

  test("agent sees their own detail read-only, with findings and report download", async ({
    page,
  }) => {
    const audit = newAudit();
    await openAgentDetail(page, audit, {
      role: "agent",
      ownPesertaId: AGENT_ID,
      detailPayload: () => richAgentDetailPayload(),
      quickviewPayload: richQuickviewPayload(),
    });
    await expect(
      page.getByRole("heading", { level: 1, name: OWN_NAME }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: /Unduh Laporan/ }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Temuan" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Simulasi" })).toBeVisible();
    // Staff-only tools are absent for an agent.
    await expect(page.getByText("Ganti agen")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Input Audit/ })).toHaveCount(
      0,
    );
    await expect(page.locator('a[href="/sidak/agents"]')).toHaveCount(0);
    await page.getByRole("tab", { name: "Temuan" }).click();
    await expect(page.getByRole("button", { name: /^Edit|Hapus/ })).toHaveCount(
      0,
    );
    expect(audit.mockedApi).not.toContain("agent-directory");
    expect(audit.blockedApi).toEqual([]);
    expect(audit.blockedExternal).toEqual([]);
  });

  test("agent opening another participant is sent to their own detail", async ({
    page,
  }) => {
    const audit = newAudit();
    await openAgentDetail(page, audit, {
      role: "agent",
      ownPesertaId: AGENT_ID,
      path: "/sidak/agents/11111111-1111-4111-8111-111111111111",
      detailPayload: () => richAgentDetailPayload(),
      quickviewPayload: richQuickviewPayload(),
    });
    await expect(page).toHaveURL(new RegExp(`/sidak/agents/${AGENT_ID}`), {
      timeout: 20000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: OWN_NAME }),
    ).toBeVisible({ timeout: 20000 });
  });

  test("KTP saya shows the own row read-only and as a slide", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/saya",
      auth: { role: "agent" },
      apiMocks: [{ method: "GET", path: "/api/v1/profiler/me", ...ok(KTP_ME) }],
    });
    const main = page.getByRole("region", { name: "Konten halaman" });
    await expect(
      main.getByRole("heading", { level: 1, name: "Sari Agen" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(main.getByText("3174000000000001")).toBeVisible();
    await expect(main.getByText("Jl. Mawar 1, Jakarta")).toBeVisible();
    await expect(
      main.getByRole("button", { name: /Edit|Pindah folder/ }),
    ).toHaveCount(0);

    await main.getByRole("tab", { name: "Slide" }).click();
    await expect(page).toHaveURL(/view=slide/);
    await expect(
      main.getByRole("region", { name: "Slide Sari Agen" }),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: /Simpan Gambar/ }),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: /Simpan PDF/ }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("unlinked agent sees the contact-trainer state for SIDAK and KTP", async ({
    page,
  }) => {
    for (const path of ["/sidak/saya", "/profiler/saya"]) {
      const audit = await openHermeticShell(page, {
        path,
        auth: { role: "agent" },
        apiMocks: [
          {
            method: "GET",
            path: "/api/v1/profiler/me",
            ...ok({ linked: false, peserta: null }),
          },
        ],
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

  test("agent opening Beranda is sent to their own SIDAK detail", async ({
    page,
  }) => {
    await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: [{ method: "GET", path: "/api/v1/profiler/me", ...ok(KTP_ME) }],
      waitForUrl: /\/sidak\/agents\/p-self(\?|$)/,
    });
    await expect(page).toHaveURL(/\/sidak\/agents\/p-self(\?|$)/);
  });

  test("agent nav holds only SIDAK, KTP, KETIK, Telefun and PDKT", async ({
    page,
  }) => {
    const agentHrefs = [
      "/sidak/saya",
      "/profiler/saya",
      "/ketik",
      "/telefun",
      "/pdkt",
    ];
    const audit = await openHermeticShell(page, {
      path: "/profiler/saya",
      auth: { role: "agent" },
      apiMocks: [{ method: "GET", path: "/api/v1/profiler/me", ...ok(KTP_ME) }],
    });
    const sidebar = page.locator(".app-sidebar-nav");
    await expect(sidebar.locator("a").first()).toBeVisible({ timeout: 20000 });
    const sidebarHrefs = await sidebar
      .locator("a")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(sidebarHrefs.sort()).toEqual([...agentHrefs].sort());
    await expect(page.locator('a[href="/dashboard"]')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const tabBar = page.locator("nav.fixed").getByRole("link");
    await expect(tabBar.first()).toBeVisible();
    expect(
      await tabBar.evaluateAll((links) =>
        links.map((a) => a.getAttribute("href")),
      ),
    ).toEqual(agentHrefs);
    await expect(page.locator('a[href="/dashboard"]')).toHaveCount(0);
    expectHermetic(audit);
  });

  test("agent cannot open the staff SIDAK or KTP workspace", async ({
    page,
  }) => {
    for (const path of ["/sidak/dashboard", "/sidak/agents", "/profiler"]) {
      await openHermeticShell(page, {
        path,
        auth: { role: "agent" },
        apiMocks: [],
        waitForUrl: /\/unauthorized/,
      });
      await expect(page, path).toHaveURL(/\/unauthorized/);
    }
  });
});
