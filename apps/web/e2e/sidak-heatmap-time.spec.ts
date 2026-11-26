import { expect, test, type Page } from "@playwright/test";
import {
  SIDAK_TIME_SOURCE,
  serviceTypeSchema,
  type SidakHeatmapTimeProfileResponse,
} from "@trainers/types";
import {
  AGENT_ID,
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  APP_ORIGIN,
  expectHermetic,
  openHermeticShell,
} from "./helpers/hermeticShell";
import { pickSelect } from "./helpers/pickSelect";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const timePath = `${APP_ORIGIN}/api/v1/sidak/heatmap/time-profile?*`;
const heatmapPath = `${APP_ORIGIN}/api/v1/sidak/heatmap?*`;
const hoursByService = [
  {
    serviceType: "chat",
    label: "Jam interaksi dimulai",
    buckets: { pagi: 8, siang: 4, sore: 2, luar: 2 },
    total: 16,
    missingTime: 3,
  },
  {
    serviceType: "pencatatan",
    label: "Jam tiket dibuat",
    buckets: { pagi: 3, siang: 3, sore: 1, luar: 0 },
    total: 7,
    missingTime: 0,
  },
  {
    serviceType: "slik",
    label: "Jam layanan",
    buckets: { pagi: 0, siang: 0, sore: 0, luar: 0 },
    total: 0,
    missingTime: 0,
  },
] as const;

function timeProfile(query: URLSearchParams): SidakHeatmapTimeProfileResponse {
  const serviceType =
    serviceTypeSchema.safeParse(query.get("service_type")).data ?? null;
  const hours = hoursByService.find((row) => row.serviceType === serviceType);
  return {
    year: Number(query.get("year")),
    serviceType,
    agentId: query.get("agent_id"),
    countBy: query.get("count_by") === "tiket" ? "tiket" : "parameter",
    hoursByService: serviceType ? null : [...hoursByService],
    hours: hours
      ? {
          label: hours.label,
          buckets: hours.buckets,
          total: hours.total,
          missingTime: hours.missingTime,
          cells:
            serviceType === "chat"
              ? [
                  { weekday: 1, hour: 7, count: 5 },
                  { weekday: 1, hour: 8, count: 3 },
                  { weekday: 2, hour: 12, count: 4 },
                  { weekday: 3, hour: 15, count: 2 },
                  { weekday: 7, hour: 18, count: 2 },
                ]
              : [],
        }
      : null,
    durations:
      !serviceType || serviceType === "call"
        ? {
            buckets: { singkat: 3, sedang: 8, panjang: 1 },
            total: 12,
            missingDuration: 2,
            reviewBelowOneMinute: 1,
          }
        : null,
    notApplicable: hours ? 0 : 2,
  };
}

async function mockTime(
  page: Page,
  queries: URLSearchParams[],
  fail: () => boolean = () => false,
) {
  await page.route(timePath, async (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    await route.fulfill(
      fail()
        ? {
            status: 500,
            json: {
              success: false,
              error: {
                code: "HEATMAP_ERROR",
                message: "Gagal memuat profil waktu.",
              },
            },
          }
        : { json: { success: true, data: timeProfile(query) } },
    );
  });
}

async function open(
  page: Page,
  queries: URLSearchParams[],
  fail?: () => boolean,
) {
  return openHermeticShell(page, {
    path: "/sidak/heatmap",
    beforeNavigate: async () => {
      await page.route(heatmapPath, (route) => {
        const query = new URL(route.request().url()).searchParams;
        const year = Number(query.get("year"));
        return route.fulfill({
          json: {
            success: true,
            data: {
              days: [{ date: `${year}-01-05`, count: 16 }],
              totalFindings: 16,
              missingDateFindingsAllPeriods: 0,
              year,
            },
          },
        });
      });
      await mockTime(page, queries, fail);
    },
  });
}

test.beforeAll(() => assertLocalDevOnlyTarget());

test("Agent profiles show the correct view per service and never mix hourly matrices", async ({
  page,
}, info) => {
  const queries: URLSearchParams[] = [];
  const audit = await open(page, queries);
  const section = page.getByRole("region", { name: "Profil waktu temuan" });
  const matrix = section.getByRole("table", {
    name: "Temuan per hari dan jam",
  });
  await expect(
    section.getByRole("table", { name: "Kategori jam per layanan" }),
  ).toBeVisible();
  await expect(
    section.getByText("Pilih satu layanan untuk melihat pola per hari dan jam"),
  ).toBeVisible();
  await expect(matrix).toHaveCount(0);

  await pickSelect(page, "Layanan", "Chat");
  await expect(
    section.getByRole("heading", { name: "Jam interaksi dimulai" }),
  ).toBeVisible();
  await expect(matrix).toBeVisible();
  await expect(section.getByText(/50%/)).toBeVisible();
  await expect(
    section.getByText(/bukan tingkat kesalahan per jam/),
  ).toBeVisible();
  await expect(section.getByText(/saat interaksi chat dimulai/)).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1280],
    ["mobile", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect
        .poll(() =>
          page.locator("html").evaluate((el) => el.classList.contains("dark")),
        )
        .toBe(colorScheme === "dark");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await section.screenshot({
        path: info.outputPath(`${device}-${colorScheme}.png`),
        animations: "disabled",
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await pickSelect(page, "Layanan", "Pencatatan");
  await expect(
    section.getByRole("heading", { name: "Jam tiket dibuat" }),
  ).toBeVisible();
  await expect(section.getByText(/bukan saat layanan diterima/)).toBeVisible();
  await pickSelect(page, "Layanan", "Call");
  await expect(
    section.getByRole("heading", { name: "Durasi panggilan" }),
  ).toBeVisible();
  await expect(section.getByText(/< 1 menit.*perlu dicek/)).toBeVisible();
  for (const [label, service] of [
    ["Email", "email"],
    ["CSO", "cso"],
    ["BKO", "bko"],
  ] as const) {
    await pickSelect(page, "Layanan", label);
    const source = SIDAK_TIME_SOURCE[service];
    if (source.kind !== "none") throw new Error("Expected unavailable service");
    await expect(
      section.getByText(/Analisa jam tidak dipakai untuk layanan ini/),
    ).toBeVisible();
    await expect(
      section.getByText(source.reason, { exact: false }),
    ).toBeVisible();
    await expect(section.getByText(/Belum diisi/)).toHaveCount(0);
  }
  await page.getByRole("button", { name: "QA — Tanggal sampel" }).click();
  await expect(section).toHaveCount(0);
  await expect(
    page.getByText("Jam hanya tersedia di mode Agent"),
  ).toBeVisible();
  expect(queries.every((query) => !query.has("mode"))).toBe(true);
  expectHermetic(audit);
});

test("detail heatmap sends the agent scope and count unit", async ({
  page,
}) => {
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  const queries: URLSearchParams[] = [];
  await openAgentDetail(page, audit);
  await mockTime(page, queries);
  await page.getByRole("tab", { name: "Heatmap" }).press("Enter");
  const section = page.getByRole("region", { name: "Profil waktu temuan" });
  await expect(
    section.getByRole("heading", { name: "Durasi panggilan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tiket", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.get("count_by")).toBe("tiket");
  expect(queries.every((query) => query.get("agent_id") === AGENT_ID)).toBe(
    true,
  );
  expect(audit.blockedApi).toEqual([]);
  expect(audit.blockedExternal).toEqual([]);
});

test("a profile error does not hide the calendar and can be retried", async ({
  page,
}) => {
  let fail = true;
  const audit = await open(page, [], () => fail);
  const section = page.getByRole("region", { name: "Profil waktu temuan" });
  await expect(section.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("grid", { name: /Kalender temuan/ }),
  ).toBeVisible();
  fail = false;
  await section.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    section.getByRole("table", { name: "Kategori jam per layanan" }),
  ).toBeVisible();
  expectHermetic(audit);
});
