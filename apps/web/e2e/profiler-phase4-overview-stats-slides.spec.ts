import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS, TEAM_ID } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Profiler tahap 4 (plans/markdown/profiler-phase4-overview-stats-slides.md):
 * ringkasan tahun menampilkan beberapa ulang tahun terdekat, statistik
 * memakai batang berlabel angka, slide punya deret nama untuk lompat, dan
 * di HP daftar peserta satu baris per orang.
 */

const RINA_ID = "55555555-5555-5555-5555-555555555551";
const DIMAS_ID = "55555555-5555-5555-5555-555555555552";
const MAYA_ID = "55555555-5555-5555-5555-555555555553";

const PESERTA = [
  {
    id: RINA_ID,
    batch_name: "Batch Pagi",
    nomor_urut: 1,
    nama: "Rina Kartika",
    tim: "Tim Call",
    jabatan: "cca",
    jenis_kelamin: "Perempuan",
    pendidikan: "S1",
  },
  {
    id: DIMAS_ID,
    batch_name: "Batch Pagi",
    nomor_urut: 2,
    nama: "Dimas Prasetyo",
    tim: "Tim Chat",
    jabatan: "team_leader",
    jenis_kelamin: "Laki-laki",
    pendidikan: "S1",
  },
  {
    id: MAYA_ID,
    batch_name: "Batch Pagi",
    nomor_urut: 3,
    nama: "Maya Putri",
    tim: "Tim Call",
    jabatan: "cca",
    jenis_kelamin: "Perempuan",
    pendidikan: "D3",
  },
];

const MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
    body: { success: true, data: PESERTA },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/teams",
    body: { success: true, data: [{ id: TEAM_ID, nama: "Tim Call" }] },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/peserta/upcoming-birthdays",
    body: {
      success: true,
      data: [
        {
          id: RINA_ID,
          nama: "Rina Kartika",
          tgl_lahir: "1995-10-17",
          batch_name: "Batch Pagi",
          daysUntil: 0,
          age: 31,
        },
        {
          id: DIMAS_ID,
          nama: "Dimas Prasetyo",
          tgl_lahir: "1998-10-20",
          batch_name: "Batch Pagi",
          daysUntil: 3,
          age: 28,
        },
        {
          id: MAYA_ID,
          nama: "Maya Putri",
          tgl_lahir: "2000-11-02",
          batch_name: "Batch Pagi",
          daysUntil: 16,
          age: 26,
        },
      ],
    },
  },
  ...PROFILER_MOCKS,
];

test.describe("Profiler tahap 4: ringkasan, statistik, slide, HP", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("ringkasan tahun: beberapa ulang tahun terdekat langsung terlihat", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: MOCKS,
    });

    const overview = page.getByRole("region", { name: /Folder tahun 2026/ });
    await expect(overview).toBeVisible({ timeout: 20000 });
    await expect(overview.getByText(/folder · \d+ peserta/)).toBeVisible();
    const birthdays = page.getByRole("region", {
      name: "Ulang tahun terdekat",
    });
    await expect(birthdays.getByRole("listitem")).toHaveCount(3);
    await expect(
      birthdays.getByRole("listitem").filter({ hasText: "Rina Kartika" }),
    ).toContainText("Hari ini");
    await expect(
      birthdays.getByRole("listitem").filter({ hasText: "Dimas Prasetyo" }),
    ).toContainText("3 hari lagi");
    await expect(
      birthdays.getByRole("listitem").filter({ hasText: "Maya Putri" }),
    ).toContainText("Batch Pagi");

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("statistik: batang berlabel angka dan persen, klik membuka pesertanya", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=statistik",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    const jabatanCca = page.getByRole("button", {
      name: "CCA: 2 peserta (67%). Lihat pesertanya",
    });
    await expect(jabatanCca).toBeVisible({ timeout: 20000 });
    await expect(jabatanCca).toContainText("2 · 67%");
    await expect(
      page.getByRole("button", {
        name: "Laki-laki: 1 peserta (33%). Lihat pesertanya",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^D3: 1 peserta/ }),
    ).toBeVisible();
    // Tidak ada lagi grafik lingkaran.
    await expect(page.locator(".recharts-pie")).toHaveCount(0);

    await jabatanCca.click();
    const dialog = page.getByRole("dialog", { name: "Jabatan: CCA" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Rina Kartika")).toBeVisible();
    await expect(dialog.getByText("Maya Putri")).toBeVisible();
    await expect(dialog.getByText("Dimas Prasetyo")).toHaveCount(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("slide: deret nama peserta untuk lompat langsung", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=slide",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    const strip = page.getByRole("navigation", { name: "Daftar slide" });
    await expect(strip).toBeVisible({ timeout: 20000 });
    await expect(strip.getByRole("button")).toHaveCount(3);
    await expect(
      strip.getByRole("button", { name: /Rina Kartika/ }),
    ).toHaveAttribute("aria-current", "true");

    await strip.getByRole("button", { name: /Maya Putri/ }).click();
    await expect(page).toHaveURL(new RegExp(`participant=${MAYA_ID}`));
    await expect(
      page.getByRole("region", { name: "Slide Maya Putri" }),
    ).toBeVisible();
    await expect(
      strip.getByRole("button", { name: /Maya Putri/ }),
    ).toHaveAttribute("aria-current", "true");

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("HP 390px: daftar peserta satu baris per orang", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    const rina = page.getByRole("button", { name: "Buka profil Rina Kartika" });
    await expect(rina).toBeVisible({ timeout: 20000 });
    await expect(rina).toContainText("CCA · Tim Call");
    const box = await rina.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(90);

    const dimas = page.getByRole("button", {
      name: "Buka profil Dimas Prasetyo",
    });
    const dimasBox = await dimas.boundingBox();
    // Baris berikutnya langsung di bawah, tanpa kartu tinggi.
    expect((dimasBox?.y ?? 0) - (box?.y ?? 0)).toBeLessThan(100);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
