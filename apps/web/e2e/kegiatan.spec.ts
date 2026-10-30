import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { PublicKegiatanResponse, TrainerActivity } from "@trainers/types";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const PUBLIC_ITEM = {
  id: "kegiatan-2026-sobat",
  year: 2026,
  program: "sobat",
  kind: "poster",
  title: "Pelatihan Kolaborasi Tim",
  event_date: "2026-06-12",
  image_url:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S3sAAAAASUVORK5CYII=",
  drive_url: "https://drive.google.com/drive/folders/e2e-sobat",
  sort_order: 0,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
} as const;

const SECOND_PUBLIC_ITEM = {
  ...PUBLIC_ITEM,
  id: "kegiatan-2025-ketik",
  year: 2025,
  program: "ketik",
  title: "Kelas Komunikasi",
  image_url:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S3sAAAAASUVORK5CYII=",
  drive_url: "https://docs.google.com/document/d/e2e-ketik",
} as const;

const publicResponse = (
  year: number,
  items: PublicKegiatanResponse["items"],
): ApiMock => ({
  method: "GET",
  path: `/api/public/kegiatan?tahun=${year}`,
  body: { success: true, data: { years: [2026, 2025], year, items } },
});

const publicLatest = (items: PublicKegiatanResponse["items"]): ApiMock => ({
  method: "GET",
  path: "/api/public/kegiatan",
  body: { success: true, data: { years: [2026, 2025], year: 2026, items } },
});

const activity = (overrides: Partial<TrainerActivity> = {}): TrainerActivity =>
  ({
    id: "admin-kegiatan-1",
    year: 2026,
    program: "sobat",
    kind: "poster",
    title: "Pelatihan Kolaborasi Tim",
    event_date: "2026-06-12",
    image_url:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S3sAAAAASUVORK5CYII=",
    drive_url: "https://drive.google.com/drive/folders/e2e-sobat",
    sort_order: 0,
    is_published: true,
    created_by: "user-1",
    updated_by: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }) as TrainerActivity;

const adminList = (items: TrainerActivity[] = [activity()]): ApiMock => ({
  method: "GET",
  path: "/api/v1/kegiatan",
  body: { success: true, data: items },
});

const emptyPublic = (year: number | null = null): ApiMock => ({
  method: "GET",
  path: "/api/public/kegiatan",
  body: { success: true, data: { years: [], year, items: [] } },
});

async function openPublic(page: Page, path: string, apiMocks: ApiMock[]) {
  const { pathname, search } = new URL(path, "http://localhost:3005");
  return openHermeticShell(page, {
    path,
    waitForUrl: new RegExp(`${pathname}${search ? `\\${search}` : ""}$`),
    auth: false,
    apiMocks,
  });
}

async function openAdmin(
  page: Page,
  path = "/dashboard/kegiatan",
  apiMocks: ApiMock[] = [adminList()],
  role = "admin",
) {
  return openHermeticShell(page, {
    path,
    auth: { role },
    apiMocks,
  });
}

test.describe("Kegiatan Trainers", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("tamu membuka Kegiatan Trainers dari landing dan melihat tahun terbaru", async ({
    page,
  }) => {
    const audit = await openPublic(page, "/", [publicLatest([PUBLIC_ITEM])]);

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Kegiatan Trainers" })
      .click();
    await expect(page).toHaveURL(/\/kegiatan(?:\?tahun=2026)?$/);
    await expect(
      page.getByRole("heading", { name: "Kegiatan Trainers", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("heading", { name: "SOBAT" })).toBeVisible();
    await expect(
      page.getByText("Solid Backup Antar Tim", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Pelatihan Kolaborasi Tim")).toBeVisible();

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Trainers SuperApp, ke beranda" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    expectHermetic(audit);
  });

  test("filter tahun dan program tersimpan di URL dan bisa dibagikan", async ({
    page,
  }) => {
    const audit = await openPublic(page, "/kegiatan?tahun=2026", [
      publicResponse(2026, [PUBLIC_ITEM]),
      publicResponse(2025, [SECOND_PUBLIC_ITEM]),
    ]);

    await page.getByRole("button", { name: "2025" }).click();
    await expect(page).toHaveURL(/tahun=2025/);
    await page.getByRole("button", { name: "KETIK" }).click();
    await expect(page).toHaveURL(/tahun=2025.*program=ketik/);
    await expect(page.getByText("Kelas Komunikasi")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "2025" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "KETIK" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "PDKT" }).click();
    await expect(
      page.getByText("Belum ada kegiatan PDKT yang diterbitkan pada 2025."),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("kartu membuka Google Drive di tab baru dengan rel noopener", async ({
    page,
  }) => {
    const audit = await openPublic(page, "/kegiatan?tahun=2026", [
      publicResponse(2026, [PUBLIC_ITEM]),
    ]);
    const card = page.getByRole("link", {
      name: /Pelatihan Kolaborasi Tim SOBAT 2026, buka di Google Drive/,
    });
    await expect(card).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/e2e-sobat",
    );
    await expect(card).toHaveAttribute("target", "_blank");
    await expect(card).toHaveAttribute("rel", /noopener/);
    await expect(card).toHaveAttribute("rel", /noreferrer/);
    expectHermetic(audit);
  });

  test("tanpa data menampilkan empty state, bukan kartu palsu", async ({
    page,
  }) => {
    const audit = await openPublic(page, "/kegiatan", [emptyPublic()]);

    await expect(
      page.getByText("Belum ada kegiatan yang diterbitkan.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("img")).toHaveCount(0);
    await expect(page.locator("a[target='_blank']")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("tanpa overflow horizontal 320–1440 px dan lolos axe di tema terang dan gelap", async ({
    page,
  }) => {
    // Card colours transition on theme change; axe must not sample mid-fade.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const audit = await openPublic(page, "/kegiatan?tahun=2026", [
      publicResponse(2026, [PUBLIC_ITEM]),
    ]);
    await page.evaluate(() => document.fonts.ready);

    for (const width of [320, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `tidak ada overflow di ${width}px`,
      ).toBe(true);
    }

    for (const theme of ["terang", "gelap"]) {
      const toggle = page.getByRole("button", {
        name: /Gunakan tema (terang|gelap)/,
      });
      if ((await toggle.getAttribute("aria-label")) === `Gunakan tema ${theme}`)
        await toggle.click();
      await expect(toggle).not.toHaveAttribute(
        "aria-label",
        `Gunakan tema ${theme}`,
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        ),
        `tema ${theme}`,
      ).toEqual([]);
    }
    expectHermetic(audit);
  });

  test("admin menambah kegiatan dengan gambar dan link Drive, lalu muncul di daftar", async ({
    page,
  }) => {
    const created = activity({ title: "Kelas Layanan 2026" });
    const audit = await openAdmin(page, "/dashboard/kegiatan", [
      adminList([]),
      {
        method: "POST",
        path: "/api/v1/kegiatan",
        body: { success: true, data: created },
      },
      adminList([created]),
    ]);

    await expect(
      page.getByRole("heading", { name: "Kelola Kegiatan", level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tambah kegiatan" }).click();
    await page.getByLabel("Judul").fill("Kelas Layanan 2026");
    await page.getByRole("spinbutton", { name: "Tahun" }).fill("2026");
    await page.getByLabel("Program").selectOption("sobat");
    await page.getByLabel("Jenis kegiatan").selectOption("poster");
    await page.getByLabel("Link Google Drive").fill(created.drive_url);
    await page.locator('input[type="file"]').setInputFiles({
      name: "poster.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S3sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page.getByRole("button", { name: "Simpan kegiatan" }).click();

    await expect(page.getByText("Kelas Layanan 2026")).toBeVisible();
    expectHermetic(audit);
  });

  test("formulir kegiatan tidak tumpang tindih atau meluap di desktop dan mobile", async ({
    page,
  }) => {
    const audit = await openAdmin(page, "/dashboard/kegiatan", [adminList([])]);

    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "Tambah kegiatan" }).click();
      const dialog = page.getByRole("dialog", { name: "Tambah kegiatan" });
      await expect(dialog).toBeVisible();
      // The longest program label stretches a native select to its intrinsic width.
      await dialog.getByLabel("Program").selectOption("ketik");

      const layout = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const fields = [
          ...element.querySelectorAll<HTMLElement>("input, select"),
        ].filter((field) => field.type !== "checkbox");
        const rects = fields.map((field) => {
          const rect = field.getBoundingClientRect();
          return {
            id: field.id,
            left: rect.left,
            right: rect.right,
            height: rect.height,
            radius: getComputedStyle(field).borderTopLeftRadius,
          };
        });
        // Probe just outside the visible close icon: the hit area must still catch it.
        const close = element.querySelector<HTMLElement>(
          '[data-slot="dialog-close"]',
        )!;
        const closeBox = close.getBoundingClientRect();
        const probe = document.elementFromPoint(
          closeBox.left - 6,
          closeBox.bottom + 6,
        );
        return {
          closeHit: Boolean(probe && close.contains(probe)),
          rootFontSize: parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          ),
          width: box.width,
          left: box.left,
          right: box.right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          rects,
        };
      });

      expect(layout.scrollWidth, `lebar ${width}px`).toBeLessThanOrEqual(
        layout.clientWidth,
      );
      for (const rect of layout.rects) {
        expect(rect.left, `${rect.id} @ ${width}px`).toBeGreaterThanOrEqual(
          layout.left,
        );
        expect(rect.right, `${rect.id} @ ${width}px`).toBeLessThanOrEqual(
          layout.right,
        );
      }
      // Every field shares one height and corner, at the repo's min-h-11 touch target.
      const touchTarget = 2.75 * layout.rootFontSize;
      for (const rect of layout.rects) {
        expect(
          Math.abs(rect.height - touchTarget),
          `${rect.id} tinggi ${rect.height}px @ ${width}px`,
        ).toBeLessThanOrEqual(1);
        expect(rect.radius, `${rect.id} sudut`).toBe(layout.rects[0].radius);
      }
      expect(layout.closeHit, `area klik tombol tutup @ ${width}px`).toBe(true);
      const program = layout.rects.find((r) => r.id === "activity-program")!;
      const kind = layout.rects.find((r) => r.id === "activity-kind")!;
      if (width === 1440) {
        expect(layout.width).toBeGreaterThanOrEqual(500);
        expect(program.right).toBeLessThanOrEqual(kind.left);
      }

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
    expectHermetic(audit);
  });

  test("validasi formulir: link bukan Drive dan gambar terlalu besar ditolak sebelum dikirim", async ({
    page,
  }) => {
    const audit = await openAdmin(page, "/dashboard/kegiatan", [adminList([])]);

    await page.getByRole("button", { name: "Tambah kegiatan" }).click();
    await page.getByLabel("Judul").fill("Kelas Layanan 2026");
    await page.getByRole("spinbutton", { name: "Tahun" }).fill("2026");
    await page.getByLabel("Program").selectOption("sobat");
    await page.getByLabel("Jenis kegiatan").selectOption("poster");
    await page.getByLabel("Link Google Drive").fill("https://example.com/file");
    await page.locator('input[type="file"]').setInputFiles({
      name: "poster-besar.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await page.getByRole("button", { name: "Simpan kegiatan" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Link harus berasal dari Google Drive atau Google Docs",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Ukuran gambar maksimal 5 MB.",
      }),
    ).toBeVisible();
    expect(
      audit.mockedApi.some((entry) => entry === "POST /api/v1/kegiatan"),
    ).toBe(false);
    expectHermetic(audit);
  });

  test("menyembunyikan dan menghapus kegiatan butuh konfirmasi untuk hapus", async ({
    page,
  }) => {
    const hidden = activity({ is_published: false });
    const audit = await openAdmin(page, "/dashboard/kegiatan", [
      adminList(),
      {
        method: "PATCH",
        path: /^\/api\/v1\/kegiatan\/admin-kegiatan-1$/,
        body: { success: true, data: hidden },
      },
      {
        method: "DELETE",
        path: /^\/api\/v1\/kegiatan\/admin-kegiatan-1$/,
        body: { success: true, data: { id: "admin-kegiatan-1" } },
      },
    ]);

    await page.getByRole("button", { name: "Sembunyikan" }).click();
    await expect(page.getByText("Tersembunyi", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hapus" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    expect(audit.mockedApi.some((entry) => entry.startsWith("DELETE "))).toBe(
      false,
    );
    await confirm.getByRole("button", { name: "Hapus kegiatan" }).click();
    await expect(confirm).toBeHidden();
    expect(audit.mockedApi.some((entry) => entry.startsWith("DELETE "))).toBe(
      true,
    );
    expectHermetic(audit);
  });

  test("filter tahun admin menampilkan tahun lain yang punya kegiatan", async ({
    page,
  }) => {
    const older = activity({
      id: "admin-kegiatan-2025",
      year: 2025,
      title: "Kelas Etika 2025",
      program: "ketik",
    });
    const audit = await openAdmin(page, "/dashboard/kegiatan", [
      adminList([activity(), older]),
    ]);

    const yearFilter = page.getByLabel("Filter tahun");
    await yearFilter.selectOption("2026");
    await expect(page.getByText("Kelas Etika 2025")).toHaveCount(0);
    await yearFilter.selectOption("2025");
    await expect(page.getByText("Kelas Etika 2025")).toBeVisible();
    expectHermetic(audit);
  });

  test("leader dan agent tidak melihat menu Kelola Kegiatan dan diarahkan keluar dari rutenya", async ({
    page,
  }) => {
    for (const role of ["leader", "agent"]) {
      const audit = await openAdmin(page, "/dashboard/kegiatan", [], role);
      await expect(page).toHaveURL(/\/unauthorized$/);
      await expect(
        page.getByRole("link", { name: "Kelola Kegiatan" }),
      ).toHaveCount(0);
      expectHermetic(audit);
      if (role === "leader") await page.goto("/");
    }
  });
});
