/**
 * Ranking agen SIDAK — halaman `/sidak/ranking`.
 *
 * Semua `/api` di-mock lewat `helpers/hermeticShell` (fail-closed), jadi spec
 * ini tidak menyentuh database mana pun. Menggantikan kontrak jsdom di
 * `sidak-ranking-fatal-badge.test.tsx`: pergerakan posisi, label filter dan
 * navigasi agen, serta peringkat bersama untuk jumlah temuan yang sama.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
  type ShellAudit,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const YEAR = new Date().getFullYear();

type RankingRow = {
  agentId: string;
  nama: string;
  batch: string;
  defects: number;
  score: number;
  hasCritical: boolean;
  rankChange?: number | null;
};

const MOVEMENT_ROWS: RankingRow[] = [
  {
    agentId: "agent-normal",
    nama: "Agent Normal",
    batch: "Batch A",
    defects: 3,
    score: 98.5,
    hasCritical: false,
    rankChange: 0,
  },
  {
    agentId: "agent-fatal",
    nama: "Agent Fatal",
    batch: "Batch A",
    defects: 10,
    score: 75,
    hasCritical: true,
    rankChange: 1,
  },
];

const TIE_ROWS: RankingRow[] = [
  {
    agentId: "tie-a",
    nama: "Agent Tie A",
    batch: "Batch A",
    defects: 10,
    score: 75,
    hasCritical: false,
  },
  {
    agentId: "tie-b",
    nama: "Agent Tie B",
    batch: "Batch A",
    defects: 10,
    score: 95,
    hasCritical: false,
  },
  {
    agentId: "tie-c",
    nama: "Agent Tie C",
    batch: "Batch A",
    defects: 3,
    score: 99,
    hasCritical: false,
  },
];

const rankingMocks = (rankings: RankingRow[]): ApiMock[] => [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/ranking",
    body: {
      success: true,
      data: {
        rankings,
        periods: [
          { id: "period-1", month: 5, year: YEAR, label: `05/${YEAR}` },
        ],
        folders: [],
        availableYears: [YEAR - 1, YEAR],
      },
    },
  },
];

async function openRanking(
  page: Page,
  rankings: RankingRow[],
): Promise<ShellAudit> {
  const audit = await openHermeticShell(page, {
    path: "/sidak/ranking",
    apiMocks: rankingMocks(rankings),
  });
  await waitForMockedApi(audit, ["/sidak/ranking?"]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ranking prioritas temuan" }),
  ).toBeVisible();
  return audit;
}

const rankingTable = (page: Page) =>
  page.getByRole("region", { name: "Daftar ranking agen" });

// Match on the agent link, not row text: a tie note names the peer agent too.
const rowFor = (page: Page, name: string) =>
  rankingTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });

test.describe("Ranking agen SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("memisahkan perubahan posisi dan tidak menampilkan label Fatal", async ({
    page,
  }) => {
    const audit = await openRanking(page, MOVEMENT_ROWS);

    const request = audit.mockedApi.find((entry) =>
      entry.includes("/sidak/ranking?"),
    );
    expect(request).toContain("period=ytd");
    expect(request).toContain("service_type=call");
    expect(request).toContain(`year=${YEAR}`);

    await expect(
      rankingTable(page).getByRole("columnheader", {
        name: "Perubahan posisi",
      }),
    ).toBeVisible();

    // Temuan terbanyak di posisi 1; naik satu posisi dari posisi 2.
    const fatal = rowFor(page, "Agent Fatal");
    await expect(fatal.getByRole("cell").first()).toHaveText("1");
    await expect(fatal).toContainText("75.0%");
    await expect(
      fatal.getByText("Prioritas naik +1", { exact: false }).last(),
    ).toBeVisible();
    await expect(fatal).toContainText("(sebelumnya posisi 2)");

    const normal = rowFor(page, "Agent Normal");
    await expect(normal.getByRole("cell").first()).toHaveText("2");
    await expect(normal).toContainText("98.5%");
    await expect(
      normal.getByText("Tetap", { exact: true }).last(),
    ).toBeVisible();

    // `hasCritical` tidak lagi dirender sebagai label "Fatal".
    await expect(page.getByText("Fatal", { exact: true })).toHaveCount(0);
    expectHermetic(audit);
  });

  test("di layar mobile label perubahan posisi tetap terlihat di baris agen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const audit = await openRanking(page, MOVEMENT_ROWS);

    // Kolom tabel disembunyikan di mobile, jadi label harus pindah ke baris.
    await expect(
      rankingTable(page).getByRole("columnheader", {
        name: "Perubahan posisi",
      }),
    ).toBeHidden();
    const fatal = rowFor(page, "Agent Fatal");
    await expect(
      fatal.getByText("Prioritas naik +1", { exact: true }),
    ).toBeVisible();
    await expect(fatal.getByText("10 temuan")).toBeVisible();
    await expect(fatal.getByText("Skor QA 75.0%")).toBeVisible();
    expectHermetic(audit);
  });

  test("filter berlabel dan nama agen bisa dibuka dengan keyboard", async ({
    page,
  }) => {
    const audit = await openRanking(page, MOVEMENT_ROWS);

    const filters = page.getByRole("region", { name: "Filter ranking" });
    for (const label of ["Layanan", "Periode", "Tahun", "Folder/tim"]) {
      await expect(filters.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(filters.getByLabel("Layanan", { exact: true })).toHaveValue(
      "call",
    );

    const agentLink = rankingTable(page).getByRole("link", {
      name: "Agent Normal",
    });
    await expect(agentLink).toHaveAttribute(
      "href",
      "/sidak/agents/agent-normal",
    );
    // Cek hermetic sebelum pindah halaman; detail agen sengaja tidak di-mock.
    expectHermetic(audit);

    await agentLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sidak\/agents\/agent-normal$/);
  });

  test("jumlah temuan sama berbagi peringkat, juga setelah diurutkan per skor", async ({
    page,
  }) => {
    const audit = await openRanking(page, TIE_ROWS);

    const expectRanks = async () => {
      await expect(
        rowFor(page, "Agent Tie A").getByRole("cell").first(),
      ).toHaveText("1");
      await expect(
        rowFor(page, "Agent Tie B").getByRole("cell").first(),
      ).toHaveText("1");
      await expect(
        rowFor(page, "Agent Tie C").getByRole("cell").first(),
      ).toHaveText("3");
    };

    await expectRanks();
    await expect(rowFor(page, "Agent Tie A")).toContainText(
      "Berbagi peringkat 1 dengan Agent Tie B",
    );
    await expect(rowFor(page, "Agent Tie B")).toContainText(
      "Berbagi peringkat 1 dengan Agent Tie A",
    );
    await expect(rowFor(page, "Agent Tie C")).not.toContainText(
      "Berbagi peringkat",
    );

    // Urutan tampilan berubah, peringkat bisnis tidak.
    await rankingTable(page)
      .getByRole("button", { name: "Rata-rata Skor QA" })
      .click();
    const names = rankingTable(page).getByRole("row").getByRole("link");
    await expect(names).toHaveText([
      "Agent Tie C",
      "Agent Tie B",
      "Agent Tie A",
    ]);
    await expectRanks();
    expectHermetic(audit);
  });
});
