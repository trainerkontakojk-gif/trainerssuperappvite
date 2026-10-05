/**
 * E2E state komponen detail agent (`/sidak/agents/:id`).
 *
 * Menggantikan unit test komponen lama (AgentPerformanceQuickview,
 * AgentAuditDossier, RootCauseCard, ContextControlBar, MonthRail,
 * AgentProfileBar) dengan asersi pada halaman sungguhan. Hermetic: semua `/api`
 * di-mock lewat harness detail agent yang fail-closed, data sintetis.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  openAgentDetail,
  type AgentAudit,
  type OpenAgentOptions,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  LAYOUT_FOLDER_AGENTS,
  LAYOUT_FOLDERS,
  richAgentDetailPayload,
  richQuickviewPayload,
} from "./helpers/sidakAgentDetailLayoutFixture";

const AGENT_NAME = "Rahmawati Kusumaningrum";
const RANKING_NOTE =
  "Peringkat 1 berarti temuan paling sedikit sepanjang tahun berjalan; peringkat terakhir berarti temuan terbanyak. Agen dengan jumlah temuan yang sama berbagi peringkat.";

type Quickview = ReturnType<typeof richQuickviewPayload>;

function quickview(patch: (q: Quickview) => unknown): unknown {
  return patch(richQuickviewPayload());
}

async function open(
  page: Page,
  opts: Partial<OpenAgentOptions> = {},
  waitForName = true,
) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  await openAgentDetail(page, audit, {
    detailPayload: richAgentDetailPayload,
    quickviewPayload: richQuickviewPayload(),
    folders: LAYOUT_FOLDERS,
    folderAgents: LAYOUT_FOLDER_AGENTS,
    ...opts,
  });
  if (waitForName) {
    // Timeout dinaikkan untuk cold-start Vite, bukan melonggarkan asersi.
    await expect(page.getByRole("heading", { name: AGENT_NAME })).toBeVisible({
      timeout: 20000,
    });
  }
  return audit;
}

function summary(page: Page) {
  return page.getByRole("tabpanel", { name: "Ringkasan" });
}

/** Quickview peringkat + forecast kini tinggal di sidebar profil. */
function profile(page: Page) {
  return page.getByRole("complementary", { name: "Profil agen" });
}

test.describe("Detail agent — profil dan rail bulan", () => {
  test.slow();

  test("satu H1 nama agen, bulan terakhir terpilih, aria bulan lengkap", async ({
    page,
  }) => {
    const audit = await open(page);

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      AGENT_NAME,
    );

    const june = summary(page).getByRole("button", {
      name: "Pilih bulan Jun 2026, skor 84.1 persen, 5 temuan, QA di bawah target 95 persen",
    });
    await expect(june).toHaveAttribute("aria-pressed", "true");
    // Bulan yang memenuhi target tidak menyebut "di bawah target".
    await expect(
      summary(page).getByRole("button", {
        name: "Pilih bulan Jan 2026, skor 96.4 persen, 1 temuan",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");

    expect(audit.blockedApi).toEqual([]);
    expect(audit.blockedExternal).toEqual([]);
  });
});

test.describe("Detail agent — quickview performa", () => {
  test.slow();

  test("dua peringkat, forecast, dan catatan dasar peringkat", async ({
    page,
  }) => {
    await open(page);
    const strip = profile(page).getByRole("region", {
      name: /Performa tahun 2026/,
    });
    const combined = strip.getByRole("group", {
      name: "Tim Gabungan: peringkat 7",
    });
    await expect(combined.getByText("#7")).toBeVisible();
    await expect(combined.getByText("dari 42")).toBeVisible();
    await expect(
      strip.getByRole("group", { name: "Tim Leader: peringkat 3" }),
    ).toBeVisible();
    await expect(
      strip.getByText("Temuan diperkirakan naik dalam 3 bulan ke depan."),
    ).toBeVisible();
    await expect(strip.getByText(RANKING_NOTE)).toBeHidden();
    await strip.getByRole("button", { name: "Cara membaca peringkat" }).click();
    await expect(strip.getByText(RANKING_NOTE)).toBeVisible();
  });

  test("skeleton saat memuat, tanpa data atau info seri", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await open(page, { quickviewGate: gate });

    await expect(
      page.getByLabel("Memuat peringkat dan forecast"),
    ).toBeVisible();
    await expect(profile(page).getByText("Tim Gabungan")).toHaveCount(0);
    await expect(profile(page).getByText(/^Berbagi peringkat/)).toHaveCount(0);

    release();
    await expect(
      profile(page).getByRole("group", { name: "Tim Gabungan: peringkat 7" }),
    ).toBeVisible();
  });

  test("error request tampil tenang tanpa pesan mentah", async ({ page }) => {
    await open(page, { quickviewFailStatus: 500 });
    await expect(
      profile(page).getByText("Peringkat dan forecast belum dapat dimuat"),
    ).toBeVisible();
    await expect(page.getByText("Network failure")).toHaveCount(0);
  });

  test("cohort tanpa pembanding vs agen di luar peringkat", async ({
    page,
  }) => {
    await open(page, {
      quickviewPayload: quickview((q) => ({
        ...q,
        combinedTeam: {
          ...q.combinedTeam,
          rank: null,
          total: 0,
          tiedAgents: null,
        },
        leaderTeam: { ...q.leaderTeam, rank: null, total: 7, tiedAgents: null },
      })),
    });
    const combined = profile(page).getByRole("group", {
      name: "Tim Gabungan: belum tersedia",
    });
    await expect(combined.getByText("—")).toBeVisible();
    await expect(combined.getByText("Belum ada agen pembanding")).toBeVisible();

    const leader = profile(page).getByRole("group", {
      name: "Tim Leader: belum tersedia",
    });
    await expect(
      leader.getByText("Belum masuk peringkat pada cakupan ini"),
    ).toBeVisible();
    await expect(leader.getByText("Belum ada agen pembanding")).toHaveCount(0);
    await expect(profile(page).getByText(/^Berbagi peringkat/)).toHaveCount(0);
  });

  test("cohort hilang setelah kegagalan parsial tampil netral", async ({
    page,
  }) => {
    await open(page, {
      quickviewPayload: quickview((q) => ({
        ...q,
        combinedTeam: null,
        leaderTeam: null,
      })),
    });
    for (const label of ["Tim Gabungan", "Tim Leader"]) {
      const metric = profile(page).getByRole("group", {
        name: `${label}: belum tersedia`,
      });
      await expect(metric.getByText("Peringkat belum tersedia")).toBeVisible();
      await expect(metric.getByText("Belum ada agen pembanding")).toHaveCount(
        0,
      );
    }
  });

  test("leader dengan cakupan sama tidak tampil sebagai cohort lain", async ({
    page,
  }) => {
    await open(page, {
      quickviewPayload: quickview((q) => ({
        ...q,
        leaderTeam: {
          ...q.leaderTeam,
          scopeId: q.combinedTeam.scopeId,
          tiedAgents: [],
        },
      })),
    });
    await expect(
      profile(page).getByText("Cakupan sama dengan Tim Gabungan"),
    ).toBeVisible();
  });

  const forecasts = [
    ["improving", "Membaik"],
    ["stable", "Stabil/Stagnan"],
    ["declining", "Memburuk"],
    ["insufficient_data", "Data belum cukup"],
  ] as const;
  for (const [status, label] of forecasts) {
    test(`forecast ${status} punya ikon dan label`, async ({ page }) => {
      await open(page, {
        quickviewPayload: quickview((q) => ({
          ...q,
          forecast: {
            ...q.forecast,
            status,
            label,
            supportingText: `Catatan ${label}`,
          },
        })),
      });
      const metric = profile(page).getByRole("group", {
        name: `Forecast: ${label}`,
      });
      await expect(metric.getByText(label, { exact: true })).toBeVisible();
      await expect(metric.getByText(`Catatan ${label}`)).toBeVisible();
      await expect(metric.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    });
  }

  test("forecast tidak tersedia tampil netral", async ({ page }) => {
    await open(page, {
      quickviewPayload: quickview((q) => ({ ...q, forecast: null })),
    });
    const metric = profile(page).getByRole("group", {
      name: "Forecast: belum tersedia",
    });
    await expect(metric.getByText("—")).toBeVisible();
    await expect(metric.getByText("Forecast belum tersedia")).toBeVisible();
    await expect(metric.getByText("Data belum cukup")).toHaveCount(0);
  });

  test("seri peringkat: satu dan dua agen ditulis langsung", async ({
    page,
  }) => {
    await open(page, {
      quickviewPayload: quickview((q) => ({
        ...q,
        combinedTeam: {
          ...q.combinedTeam,
          rank: 1,
          tiedAgents: [{ agentId: "tania", nama: "Tania" }],
        },
        leaderTeam: {
          ...q.leaderTeam,
          rank: 1,
          tiedAgents: [
            { agentId: "tania", nama: "Tania" },
            { agentId: "budi", nama: "Budi" },
          ],
        },
      })),
    });
    await expect(
      profile(page)
        .getByRole("group", { name: "Tim Gabungan: peringkat 1" })
        .getByText("Berbagi peringkat 1 dengan Tania", { exact: true }),
    ).toBeVisible();
    await expect(
      profile(page)
        .getByRole("group", { name: "Tim Leader: peringkat 1" })
        .getByText("Berbagi peringkat 1 dengan Tania dan Budi"),
    ).toBeVisible();
    // Info seri tidak menggeser catatan dasar peringkat.
    await profile(page)
      .getByRole("button", { name: "Cara membaca peringkat" })
      .click();
    await expect(profile(page).getByText(RANKING_NOTE)).toBeVisible();
  });

  test("seri tiga agen atau lebih diringkas dengan disclosure", async ({
    page,
  }) => {
    await open(page, {
      quickviewPayload: quickview((q) => ({
        ...q,
        combinedTeam: {
          ...q.combinedTeam,
          rank: 2,
          tiedAgents: [
            { agentId: "tania", nama: "Tania" },
            { agentId: "budi", nama: "Budi Santoso" },
            { agentId: "siti", nama: "Siti Rahma" },
            { agentId: "dimas", nama: "Dimas Putra" },
          ],
        },
      })),
    });
    const metric = profile(page).getByRole("group", {
      name: "Tim Gabungan: peringkat 2",
    });
    await expect(
      metric.getByText("Berbagi peringkat 2 dengan Tania dan 3 agen lain"),
    ).toBeVisible();
    await expect(metric.getByText("Siti Rahma")).toHaveCount(0);

    const show = metric.getByRole("button", {
      name: "Lihat semua agen yang berbagi peringkat 2",
    });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await show.click();

    const hide = metric.getByRole("button", {
      name: "Sembunyikan daftar agen yang berbagi peringkat 2",
    });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    const panelId = await hide.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const list = page.locator(`[id="${panelId}"]`);
    for (const name of ["Budi Santoso", "Siti Rahma", "Dimas Putra"]) {
      await expect(list.getByText(name)).toBeVisible();
    }
  });
});

test.describe("Detail agent — bulan terpilih dan akar masalah", () => {
  test.slow();

  test("tiket pengurang memuat urutan, nomor, parameter, poin, dan jumlah temuan", async ({
    page,
  }) => {
    await open(page);
    const tickets = summary(page).getByRole("region", {
      name: "Tiket pengurang skor terbesar",
    });
    const rows = tickets.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    const first = rows.first();
    await expect(first.getByText("1", { exact: true })).toBeVisible();
    await expect(first.getByText("TKT-2026-06-118")).toBeVisible();
    await expect(
      first.getByText("Parameter terberat: Ketepatan Solusi"),
    ).toBeVisible();
    await expect(first.getByText("−45.0 poin")).toBeVisible();
    await expect(first.getByText("2 temuan")).toBeVisible();
  });

  test("bulan pertama tanpa pembanding menampilkan selisih kosong", async ({
    page,
  }) => {
    await open(page);
    await summary(page)
      .getByRole("button", { name: /^Pilih bulan Jan 2026/ })
      .click();
    const jan = summary(page).getByRole("region", {
      name: "Detail Januari 2026",
    });
    await expect(jan.getByText("96.4", { exact: true })).toBeVisible();
    await expect(jan.getByText("—", { exact: true })).toBeVisible();
  });

  test("akar masalah: header, kritis, pola lain, tiket tersembunyi sampai dibuka", async ({
    page,
  }) => {
    await open(page);
    const causes = summary(page).getByRole("region", { name: "Akar masalah" });
    await expect(
      causes.getByText("Akumulasi temuan Jan–Jun 2026"),
    ).toBeVisible();
    await expect(causes.getByText("3 pola")).toBeVisible();
    await expect(causes.getByText("2 temuan kritis")).toBeVisible();
    await expect(causes.getByText(/Prioritas/)).toHaveCount(0);
    await expect(
      causes.getByText(
        "Pakai checklist verifikasi tiga langkah sebelum menutup panggilan.",
      ),
    ).toBeVisible();

    const toggles = causes.getByRole("button", {
      name: /^Tampilkan \d+ tiket$/,
    });
    await expect(toggles).toHaveCount(3);
    await expect(causes.getByText(/TKT-2026-06-142 \(Juni\)/)).toHaveCount(0);

    await toggles.first().click();
    await expect(causes.getByText(/TKT-2026-06-142 \(Juni\)/)).toBeVisible();
    await expect(causes.getByText("Juni 2026", { exact: true })).toHaveCount(0);
    await expect(
      causes.getByRole("button", { name: "Sembunyikan tiket" }),
    ).toHaveCount(1);
  });

  test("tanpa akar masalah menampilkan empty state", async ({ page }) => {
    await open(page, {
      detailPayload: () => ({ ...richAgentDetailPayload(), rootCauses: [] }),
    });
    const causes = summary(page).getByRole("region", { name: "Akar masalah" });
    await expect(causes.getByText("Belum ada pola akar masalah")).toBeVisible();
    await expect(causes.getByText("0 pola")).toBeVisible();
  });
});

test.describe("Detail agent — toolbar per tab", () => {
  test.slow();

  test("rentang tren hanya muncul di Tren dan mengubah query", async ({
    page,
  }) => {
    const audit = await open(page);
    await expect(
      page.getByRole("combobox", { name: "Bulan awal tren" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Tahun audit" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Tren" }).click();
    await expect(
      page.getByRole("combobox", { name: "Tahun audit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Bulan akhir tren" }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Bulan awal tren" }).click();
    await page.getByRole("option", { name: "Maret", exact: true }).click();
    await expect
      .poll(() => audit.detailQueries?.at(-1) ?? "")
      .toContain("startMonth=3");
  });

  test("tab Simulasi menyembunyikan filter audit tapi tetap bisa ganti agen", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("tab", { name: "Simulasi" }).click();
    await expect(
      page.getByRole("combobox", { name: "Tahun audit" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Pilihan layanan audit" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Bulan awal tren" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Ganti agen" }),
    ).toBeVisible();
  });
});
