/**
 * E2E layout & konteks halaman Input Temuan SIDAK (`/sidak/input`).
 *
 * Kontrak yang dibuktikan: satu layar kerja (h1 + bar konteks Folder/Agen/
 * Periode/Layanan), agen bisa dicari, ganti konteks tanpa mundur, URL state,
 * satu pemilih layanan (Mix wajib pilih), ringkasan sesi dengan ambang target 95,
 * akses leader read-only, dan tanpa overflow horizontal.
 *
 * Hermetic: semua `/api` di-mock lewat harness fail-closed; tidak ada request
 * yang menyentuh database nyata. Data sintetis.
 */

import { expect, test, type Page } from "@playwright/test";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  expectIsolation,
  FIXTURE,
  openInputAudit,
  resetStore,
  seedTemuan,
  selectPeriod,
  startAudit,
  type HarnessAgent,
  type HarnessPeriod,
} from "./helpers/sidakTemuanDatesHarness";

const CRITICAL = FIXTURE.indicators[2]!;
const NON_CRITICAL = FIXTURE.indicators[0]!;

const FEB_PERIOD: HarnessPeriod = {
  id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbb02",
  month: 2,
  year: 2026,
};

const BUDI: HarnessAgent = {
  id: "cccccccc-3333-4333-8333-ccccccccccc2",
  nama: "Budi Santoso",
  batch_name: "Batch Uji",
  tim: "Chat",
  jabatan: "Agent",
};
const CITRA: HarnessAgent = {
  id: "cccccccc-3333-4333-8333-ccccccccccc3",
  nama: "Citra Lestari",
  batch_name: "Batch Uji",
  tim: "Email",
  jabatan: "Agent",
};
const MIX_AGENT: HarnessAgent = {
  id: "cccccccc-3333-4333-8333-ccccccccccc4",
  nama: "Maya Mix",
  batch_name: "Batch Uji",
  tim: "Mix",
  jabatan: "Agent",
};

const trigger = (page: Page, name: string) =>
  page.getByRole("combobox", { name, exact: true });

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test.beforeEach(() => {
  resetStore();
});

test.describe("Input Temuan: satu layar kerja", () => {
  test("deep link membuka h1, bar konteks terisi, tanpa grid kartu pemilihan", async ({
    page,
  }) => {
    const audit = startAudit();
    await openInputAudit(page, audit);

    await expect(
      page.getByRole("heading", { level: 1, name: "Input Temuan" }),
    ).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Konteks audit" })).toBeVisible();
    await expect(trigger(page, "Folder")).toContainText("Batch Uji");
    await expect(trigger(page, "Agen")).toContainText(FIXTURE.agent.nama);
    await expect(trigger(page, "Layanan")).toContainText("Call");

    for (const id of [
      "folder-selection-grid",
      "agent-selection-grid",
      "period-selection-grid",
      "folder-selection-card",
      "agent-selection-card",
      "period-selection-card",
      "show-all-toggle",
    ]) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
    expectIsolation(audit);
  });

  test("halaman tanpa konteks tetap valid: h1 + bar konteks, agen terkunci", async ({
    page,
  }) => {
    const audit = startAudit();
    await openInputAudit(page, audit, { initialUrl: "/sidak/input" });

    await expect(
      page.getByRole("heading", { level: 1, name: "Input Temuan" }),
    ).toBeVisible();
    await expect(trigger(page, "Folder")).toBeEnabled();
    await expect(trigger(page, "Agen")).toBeDisabled();
    await expect(trigger(page, "Periode")).toBeDisabled();
    await expect(trigger(page, "Layanan")).toBeDisabled();
    expectIsolation(audit);
  });

  test("agen tidak ditemukan: pesan jelas dan folder tetap terpilih", async ({
    page,
  }) => {
    const audit = startAudit();
    await openInputAudit(page, audit, {
      initialUrl: `/sidak/input?folder=${encodeURIComponent(FIXTURE.folder.name)}&agent_id=00000000-0000-4000-8000-000000000000`,
    });

    await expect(
      page.getByText("Agen tidak ditemukan. Silakan pilih manual."),
    ).toBeVisible();
    await expect(trigger(page, "Folder")).toContainText("Batch Uji");
    await expect(trigger(page, "Agen")).toBeEnabled();
    expectIsolation(audit);
  });
});

test.describe("Input Temuan: periode, URL state, dan pencarian agen", () => {
  test("memilih periode menampilkan ringkasan sesi dan daftar; reload mempertahankan konteks", async ({
    page,
  }) => {
    seedTemuan([
      {
        indicator_id: CRITICAL.id,
        nilai: 1,
        no_tiket: "TKT-URL-1",
        ketidaksesuaian: "Dokumen kurang",
      },
    ]);
    const audit = startAudit();
    await openInputAudit(page, audit);
    await selectPeriod(page);

    await expect(page.getByTestId("sidak-session-summary")).toBeVisible();
    await expect(page.getByText("TKT-URL-1")).toBeVisible();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("period_id"))
      .toBe(FIXTURE.period.id);
    const params = new URL(page.url()).searchParams;
    expect(params.get("folder")).toBe("Batch Uji");
    expect(params.get("agent_id")).toBe(FIXTURE.agent.id);
    expect(params.get("service")).toBe("call");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(trigger(page, "Folder")).toContainText("Batch Uji");
    await expect(trigger(page, "Agen")).toContainText(FIXTURE.agent.nama);
    await expect(trigger(page, "Periode")).toContainText("Januari 2026");
    await expect(page.getByText("TKT-URL-1")).toBeVisible();
    expectIsolation(audit);
  });

  test("combobox Agen bisa difilter dengan mengetik", async ({ page }) => {
    const audit = startAudit();
    await openInputAudit(page, audit, {
      agents: [FIXTURE.agent, BUDI, CITRA],
    });

    await trigger(page, "Agen").click();
    await expect(page.getByRole("option")).toHaveCount(3);
    await page.getByRole("combobox", { name: "Cari agen" }).fill("budi");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option", { name: /Budi Santoso/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Chat/ })).toBeVisible();
    await page.getByRole("option", { name: /Budi Santoso/ }).click();

    await expect(trigger(page, "Agen")).toContainText("Budi Santoso");
    await expect(trigger(page, "Layanan")).toContainText("Chat");
    expectIsolation(audit);
  });

  test("mengganti periode memuat temuan periode itu tanpa mereset agen", async ({
    page,
  }) => {
    seedTemuan([
      { indicator_id: CRITICAL.id, nilai: 1, no_tiket: "TKT-JAN-1" },
      {
        indicator_id: NON_CRITICAL.id,
        nilai: 2,
        no_tiket: "TKT-FEB-1",
        period_id: FEB_PERIOD.id,
      },
    ]);
    const audit = startAudit();
    await openInputAudit(page, audit, {
      periods: [FIXTURE.period, FEB_PERIOD],
    });

    await selectPeriod(page, FIXTURE.period);
    await expect(page.getByText("TKT-JAN-1")).toBeVisible();
    await expect(page.getByText("TKT-FEB-1")).toHaveCount(0);

    await selectPeriod(page, FEB_PERIOD);
    await expect(page.getByText("TKT-FEB-1")).toBeVisible();
    await expect(page.getByText("TKT-JAN-1")).toHaveCount(0);
    await expect(trigger(page, "Agen")).toContainText(FIXTURE.agent.nama);
    await expect(trigger(page, "Folder")).toContainText("Batch Uji");
    expectIsolation(audit);
  });

  test("mengganti agen mempertahankan periode yang masih valid", async ({
    page,
  }) => {
    seedTemuan([
      {
        indicator_id: CRITICAL.id,
        nilai: 1,
        no_tiket: "TKT-BUDI-1",
        peserta_id: BUDI.id,
        service_type: "chat",
      },
    ]);
    const audit = startAudit();
    await openInputAudit(page, audit, { agents: [FIXTURE.agent, BUDI] });
    await selectPeriod(page);

    await trigger(page, "Agen").click();
    await page.getByRole("option", { name: /Budi Santoso/ }).click();

    await expect(trigger(page, "Periode")).toContainText("Januari 2026");
    await expect(page.getByText("TKT-BUDI-1")).toBeVisible();
    expectIsolation(audit);
  });
});

test.describe("Input Temuan: layanan dan ringkasan sesi", () => {
  test("tim Mix: daftar tidak dimuat sampai Layanan dipilih, petunjuk inline terlihat", async ({
    page,
  }) => {
    seedTemuan([
      {
        indicator_id: CRITICAL.id,
        nilai: 1,
        no_tiket: "TKT-MIX-1",
        peserta_id: MIX_AGENT.id,
      },
    ]);
    const audit = startAudit();
    await openInputAudit(page, audit, {
      agents: [MIX_AGENT],
      fixture: {
        ...FIXTURE,
        agent: MIX_AGENT,
        indicators: [...FIXTURE.indicators],
      },
    });
    await selectPeriod(page);

    await expect(page.getByText(/Pilih layanan audit/i).first()).toBeVisible();
    await expect(trigger(page, "Layanan")).toBeEnabled();
    expect(
      audit.mockedApi.filter((entry) => entry === "temuan:GET"),
      "daftar temuan tidak boleh dimuat sebelum layanan dipilih",
    ).toHaveLength(0);
    await expect(page.getByTestId("sidak-session-summary")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tambah" })).toHaveCount(0);

    await trigger(page, "Layanan").click();
    await page.getByRole("option", { name: "Call", exact: true }).click();

    await expect(page.getByText("TKT-MIX-1")).toBeVisible();
    expect(
      audit.mockedApi.filter((entry) => entry === "temuan:GET").length,
    ).toBeGreaterThan(0);
    expectIsolation(audit);
  });

  test("status skor memakai target 95: skor 88 tampil Mendekati target", async ({
    page,
  }) => {
    // Satu temuan kritikal bernilai 0 pada satu sesi => skor akhir 88.
    seedTemuan([{ indicator_id: CRITICAL.id, nilai: 0, no_tiket: "TKT-88" }]);
    const audit = startAudit();
    await openInputAudit(page, audit);
    await selectPeriod(page);

    const summary = page.getByTestId("sidak-session-summary");
    await expect(summary).toContainText("88");
    await expect(summary).toContainText("Mendekati target");
    await expect(summary).toContainText("1 temuan");
    await expect(summary).toContainText("1 tiket");
    expectIsolation(audit);
  });
});

test.describe("Input Temuan: peran leader", () => {
  // Router sudah menolak leader di /sidak/input (capability sidak.config.manage),
  // jadi aksi tulis tidak pernah dapat dijangkau leader. Guard `role !== "leader"`
  // di halaman tetap ada sebagai lapisan kedua, tetapi tidak bisa dijangkau lewat
  // browser; kontrak yang dapat dibuktikan E2E adalah penolakan ini.
  test("leader ditolak router: tanpa Tambah/Import/Sesi Tanpa Temuan", async ({
    page,
  }) => {
    seedTemuan([{ indicator_id: CRITICAL.id, nilai: 1, no_tiket: "TKT-LDR-1" }]);
    const audit = startAudit();
    await openInputAudit(page, audit, { role: "leader" });

    await expect(page.getByRole("heading", { name: "Akses Ditolak" })).toBeVisible();
    await expect(page.getByText("TKT-LDR-1")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Tambah Temuan|Tambah)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Sesi Tanpa Temuan|Sudah Ada Temuan/ })).toHaveCount(0);
  });
});

test.describe("Input Temuan: responsif", () => {
  for (const width of [390, 1440]) {
    test(`${width}px: tanpa overflow horizontal dan kontrol konteks >= 44px`, async ({
      page,
    }) => {
      seedTemuan([{ indicator_id: CRITICAL.id, nilai: 1, no_tiket: "TKT-RWD-1" }]);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const audit = startAudit();
      await openInputAudit(page, audit);
      await selectPeriod(page);
      await expect(page.getByText("TKT-RWD-1")).toBeVisible();

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.doc).toBeLessThanOrEqual(0);
      expect(overflow.body).toBeLessThanOrEqual(0);

      for (const name of ["Folder", "Agen", "Periode", "Layanan"]) {
        const box = await trigger(page, name).boundingBox();
        expect(box, `${name} terlihat`).not.toBeNull();
        expect(box!.height, `tinggi ${name}`).toBeGreaterThanOrEqual(44);
      }

      if (width === 1440) {
        const tops = await Promise.all(
          ["Folder", "Agen", "Periode", "Layanan"].map(async (name) =>
            Math.round((await trigger(page, name).boundingBox())!.y),
          ),
        );
        expect(new Set(tops).size, "bar konteks satu baris di desktop").toBe(1);
      }
      expectIsolation(audit);
    });
  }
});
