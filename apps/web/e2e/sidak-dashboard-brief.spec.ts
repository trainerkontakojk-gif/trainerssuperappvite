import { expect, test } from "@playwright/test";
import type { DashboardInsights } from "@trainers/types";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { ACCESS_MOCK, homeDashboardData } from "./helpers/sidakHomeFixture";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";

const YEAR = new Date().getFullYear();
const FOCUS = "Akurasi informasi";
const RECOMMENDATION =
  "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.";
const insights: DashboardInsights = {
  latestLabel: "Okt 26",
  previousLabel: "Sep 26",
  what: {
    headline: "Temuan naik 30% dari Sep 26",
    text: "Rata-rata temuan per agen diaudit juga naik (2 → 2,6), jadi kualitas memang menurun.",
    tone: "bad",
    findingsChangePct: 30,
    perAuditedLatest: 2.6,
    perAuditedPrevious: 2,
  },
  soWhat: {
    headline: "Kurang 5 poin dari target 95",
    text: "Skor rata-rata 90% di Okt 26; 2 agen belum mencapai 95. Kenaikan terbesar datang dari Akurasi informasi (+6 temuan, parameter kritikal).",
    tone: "bad",
    scoreGapToTarget: 5,
    belowTargetCount: 2,
  },
  focusParameter: {
    name: FOCUS,
    category: "critical",
    latestCount: 12,
    change: 6,
    recommendation: RECOMMENDATION,
    agents: [
      { agentId: "agent-a", nama: "Ayu Larasati", tim: "Tim Call", count: 8 },
      { agentId: "agent-b", nama: "Dimas", tim: null, count: 4 },
    ],
  },
  nowWhat: {
    headline: `Coaching 2 agen untuk ${FOCUS}`,
    text: RECOMMENDATION,
    action: "coach_focus_agents",
  },
  parameterChanges: [
    { name: "Verifikasi data", latestCount: 40, change: -3 },
    { name: FOCUS, latestCount: 12, change: 6 },
  ],
};
const TWO_PERIOD_TREND = {
  labels: ["Sep 26", "Okt 26"],
  datasets: [
    { label: "Total Temuan", data: [20, 26], isTotal: true },
    { label: "Verifikasi data", data: [43, 40], isTotal: false },
    { label: FOCUS, data: [6, 12], isTotal: false },
  ],
};
function mocks(
  value: DashboardInsights | null,
  paramTrend: typeof TWO_PERIOD_TREND = TWO_PERIOD_TREND,
): ApiMock[] {
  return [
    {
      ...ACCESS_MOCK,
      body: {
        success: true,
        data: {
          sidak: { status: "approved", module: "sidak", created_at: null },
        },
      },
    },
    {
      method: "GET",
      path: "/api/v1/sidak/dashboard",
      body: {
        success: true,
        data: homeDashboardData({
          insights: value,
          paretoData: [
            ...Array.from({ length: 13 }, (_, index) => ({
              name: index === 0 ? "Verifikasi data" : `Parameter ${index}`,
              fullName: index === 0 ? "Verifikasi data" : `Parameter ${index}`,
              count: 80 - index * 5,
              cumulative: 0,
              category: "non_critical",
            })),
            {
              name: FOCUS,
              fullName: FOCUS,
              count: 12,
              cumulative: 92,
              category: "critical",
            },
          ],
          paramTrend,
        }),
      },
    },
    {
      method: "POST",
      path: "/api/v1/sidak/dashboard/forecast",
      body: { success: true, data: { status: "missing", snapshot: null } },
    },
    {
      method: "GET",
      path: "/api/v1/sidak/heatmap",
      body: {
        success: true,
        data: {
          mode: "agent",
          year: YEAR,
          serviceType: "call",
          dateBasis: "tanggal_layanan",
          countBy: "parameter",
          agentId: null,
          days: [],
          totalFindings: 0,
          missingDateFindingsAllPeriods: 0,
        },
      },
    },
  ];
}
test.beforeAll(assertLocalDevOnlyTarget);

test("Kesimpulan, focused parameter and keyboard coaching disclosure; responsive light/dark", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const audit = await openHermeticShell(page, {
    path: `/sidak/dashboard?layanan=call&tahun=${YEAR}&dari=9&sampai=10&tim=ALL`,
    apiMocks: mocks(insights),
  });
  await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/heatmap?"]);
  const brief = page.getByRole("region", { name: "Kesimpulan", exact: true });
  await expect(brief).toBeVisible();
  for (const text of ["Apa yang terjadi", "Artinya", "Lakukan ini"])
    await expect(
      brief.getByRole("heading", { name: text, exact: true }),
    ).toBeVisible();
  await expect(brief).toContainText("Okt 26 dibanding Sep 26");
  // Tone lives in a labelled cue on the headline, not in a fully coloured paragraph.
  for (const [headline, tone] of [
    ["Temuan naik 30% dari Sep 26", "Memburuk"],
    ["Kurang 5 poin dari target 95", "Perlu perhatian"],
  ])
    await expect(
      brief.getByText(headline, { exact: true }).locator(".."),
    ).toContainText(tone);
  await expect(
    brief.getByText(`Coaching 2 agen untuk ${FOCUS}`, { exact: true }),
  ).toBeVisible();
  // The coaching recommendation now sits in "Lakukan ini" itself.
  await expect(brief.getByText(RECOMMENDATION, { exact: true })).toBeVisible();
  await expect(brief.getByRole("link", { name: "Buka TNA" })).toHaveAttribute(
    "href",
    "/tna",
  );
  // Up to three priority agents are listed without an extra click.
  await expect(brief.locator("summary")).toHaveCount(0);
  await expect(
    brief.getByRole("link", { name: /Ayu Larasati/ }),
  ).toHaveAttribute("href", "/sidak/agents/agent-a");
  await expect(brief.getByRole("link", { name: /Dimas/ })).toHaveAttribute(
    "href",
    "/sidak/agents/agent-b",
  );
  await expect(brief).toContainText("Tim Call");
  await expect(brief).toContainText("8 temuan");
  const parameters = page.getByRole("region", { name: "Parameter teratas" });
  await expect(
    parameters.getByText(RECOMMENDATION, { exact: true }),
  ).toBeVisible();
  await expect(
    parameters.getByText("+6 vs Sep 26", { exact: true }),
  ).toBeVisible();
  await expect(
    parameters.getByText("−3 vs Sep 26", { exact: true }),
  ).toBeVisible();
  // The agent list already lives in Kesimpulan; the ranking does not repeat it.
  await expect(parameters.getByRole("link", { name: /Ayu Larasati/ })).toHaveCount(0);
  await expect(parameters).not.toContainText("Lihat 2 agen");
  const trend = page.getByRole("region", { name: "Tren temuan", exact: true });
  await expect(
    trend.getByRole("button", { name: FOCUS, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    trend.getByRole("button", { name: "Verifikasi data", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    trend.getByRole("button", { name: "Total Temuan", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(trend).toContainText(
    `Kenaikan Okt 26 terutama dari ${FOCUS} (+6).`,
  );
  await trend.getByRole("button", { name: FOCUS, exact: true }).click();
  await expect(
    trend.getByRole("button", { name: FOCUS, exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await trend
    .getByRole("button", { name: "Sembunyikan Semua", exact: true })
    .click();
  await expect(
    trend.getByRole("button", { name: FOCUS, exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    trend.getByRole("button", { name: "Total Temuan", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  // Wide layout: "Apa yang terjadi" and "Artinya" stack in one column beside
  // "Lakukan ini", so the short parts do not leave tall empty columns.
  await page.setViewportSize({ width: 1440, height: 900 });
  const box = async (name: string) =>
    (await brief.getByRole("heading", { name, exact: true }).boundingBox())!;
  const [what, soWhat, nowWhat] = await Promise.all(
    ["Apa yang terjadi", "Artinya", "Lakukan ini"].map(box),
  );
  expect(Math.abs(what.x - soWhat.x)).toBeLessThan(2);
  expect(soWhat.y).toBeGreaterThan(what.y);
  expect(nowWhat.x).toBeGreaterThan(what.x + 200);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      await brief.scrollIntoViewIfNeeded();
      expect(
        await findLowContrastText(brief, {
          selector: "p,span,h3,a,summary",
          leafOnly: true,
        }),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`brief-${width}-${theme}.png`),
      });
    }
  }
  expectHermetic(audit);
});

test("leader has no TNA action; ranking fallback carries the same context; null insight stays absent", async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const value of [
    insights,
    {
      ...insights,
      focusParameter: null,
      nowWhat: {
        headline: "Mulai dari agen dengan temuan terbanyak",
        text: "Tidak ada parameter yang naik 5 temuan atau lebih dari Sep 26.",
        action: "open_ranking" as const,
      },
    },
    null,
  ]) {
    const audit = await openHermeticShell(page, {
      path: `/sidak/dashboard?layanan=call&tahun=${YEAR}&tim=ALL`,
      auth: { role: "leader" },
      apiMocks: mocks(value),
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/heatmap?"]);
    const brief = page.getByRole("region", { name: "Kesimpulan", exact: true });
    if (value === null) await expect(brief).toHaveCount(0);
    else {
      await expect(brief).toBeVisible();
      await expect(brief.getByRole("link", { name: "Buka TNA" })).toHaveCount(
        0,
      );
      if (value.nowWhat.action === "open_ranking")
        await expect(
          brief.getByRole("link", { name: "Lihat ranking" }),
        ).toHaveAttribute(
          "href",
          `/sidak/ranking?service_type=call&year=${YEAR}`,
        );
    }
    expectHermetic(audit);
  }
});

test("more than three coaching agents fold the rest behind a toggle that collapses again", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const many = ["Ayu", "Bima", "Citra", "Dewi", "Eko"].map((nama, n) => ({
    agentId: `agent-${n}`,
    nama,
    tim: "Tim Call",
    count: 5 - n,
  }));
  const audit = await openHermeticShell(page, {
    path: `/sidak/dashboard?layanan=call&tahun=${YEAR}&tim=ALL`,
    apiMocks: mocks({
      ...insights,
      focusParameter: { ...insights.focusParameter!, agents: many },
      nowWhat: {
        ...insights.nowWhat,
        headline: `Coaching 5 agen untuk ${FOCUS}`,
      },
    }),
  });
  await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/heatmap?"]);
  const brief = page.getByRole("region", { name: "Kesimpulan", exact: true });
  const list = brief.getByRole("list", { name: "Agen prioritas coaching" });
  await expect(list.getByRole("link")).toHaveCount(3);
  await expect(brief.getByRole("link", { name: /Dewi/ })).toBeHidden();
  const toggle = brief.getByRole("button", { name: "Lihat 2 agen lainnya" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(brief.getByRole("link", { name: /Eko/ })).toHaveAttribute(
    "href",
    "/sidak/agents/agent-4",
  );
  await expect(list.getByRole("link")).toHaveCount(5);
  // Expanded: the "lainnya" wording is gone and the toggle offers to collapse.
  await expect(brief).not.toContainText("agen lainnya");
  const collapse = brief.getByRole("button", { name: "Tampilkan lebih sedikit" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(list.getByRole("link")).toHaveCount(3);
  await expect(
    brief.getByRole("button", { name: "Lihat 2 agen lainnya" }),
  ).toBeFocused();
  expectHermetic(audit);
});

test("trend chart labels only the latest, highest and lowest actual points", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const audit = await openHermeticShell(page, {
    path: `/sidak/dashboard?layanan=call&tahun=${YEAR}&tim=ALL`,
    apiMocks: mocks(insights, {
      labels: ["Mei 26", "Jun 26", "Jul 26", "Agt 26", "Sep 26", "Okt 26"],
      datasets: [
        { label: "Total Temuan", data: [10, 30, 20, 5, 15, 25], isTotal: true },
        { label: "Verifikasi data", data: [1, 2, 3, 4, 5, 6], isTotal: false },
        { label: FOCUS, data: [6, 7, 8, 9, 10, 12], isTotal: false },
      ],
    }),
  });
  await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/heatmap?"]);
  const trend = page.getByRole("region", { name: "Tren temuan", exact: true });
  await expect
    .poll(() =>
      trend
        .locator('[data-chart-label="actual"]')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim())),
    )
    .toEqual(["30", "5", "25"]);
  expectHermetic(audit);
});
