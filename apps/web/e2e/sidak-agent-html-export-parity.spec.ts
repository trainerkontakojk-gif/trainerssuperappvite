import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentDetailData,
  RootCauseResult,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import { generateHTML } from "../src/utils/exportAgentReport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = path.resolve(
  __dirname,
  "../../../artifacts/sidak-agent-report-parity",
);

const _SUPABASE_URL = "https://ruosnjmtywcrghjgqugz.supabase.co";
const SUPABASE_STORAGE_KEY = "sb-ruosnjmtywcrghjgqugz-auth-token";

const authUser = {
  id: "user-1",
  aud: "authenticated",
  role: "authenticated",
  email: "trainer.visual@trainers.local",
  created_at: "2026-07-28T08:00:00.000Z",
  app_metadata: {},
  user_metadata: {},
};

const authSession = {
  access_token: "live-test-token",
  refresh_token: "refresh-test-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: authUser,
};

const authProfile = {
  id: authUser.id,
  email: authUser.email,
  full_name: "Trainer Visual",
  role: "trainer",
  status: "active",
  is_deleted: false,
};

const VISUAL_AGENT_NAME = "Nadia Puspitasari dengan Nama Agen Sangat Panjang <Audit>";
const LONG_FINDING_TEXT =
  "Uraian temuan yang panjang untuk memastikan teks ketidaksesuaian membungkus dengan baik pada layar sempit tanpa terpotong.";
const LONG_RECOMMENDATION_TEXT =
  "Lengkapi validasi informasi, dokumentasikan langkah perbaikan, dan pastikan konfirmasi diberikan sebelum tiket ditutup.";

const agentFixture: AgentDetailData = {
  peserta: {
    id: "agent-1",
    nama: VISUAL_AGENT_NAME,
    tim: "Tim Email",
    batch_name: "Batch 7",
    jabatan: "Agent",
    foto_url: null,
    bergabung_date: "2024-01-01",
  },
  availableYears: [2025, 2026],
  initialYear: 2026,
  initialService: "call",
  initialTrendRange: { start: 1, end: 5 },
  indicators: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      name: "Akurasi",
      parameter_group: null,
      category: "critical",
      bobot: 50,
      has_na: false,
      sort_order: 1,
      is_active: true,
    },
  ],
  periodSummaries: [
    {
      id: "period-01",
      month: 1,
      year: 2026,
      label: "01/2026",
      serviceType: "call",
      finalScore: 82,
      nonCriticalScore: 84,
      criticalScore: 80,
      sessionCount: 4,
      findingsCount: 4,
    },
    {
      id: "period-05",
      month: 5,
      year: 2026,
      label: "05/2026",
      serviceType: "call",
      finalScore: 91,
      nonCriticalScore: 92,
      criticalScore: 90,
      sessionCount: 4,
      findingsCount: 2,
    },
  ],
  selectedPeriod: null,
  temuan: [
    {
      id: "finding-01",
      peserta_id: "agent-1",
      period_id: "period-01",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: "T-099",
      nilai: 2,
      ketidaksesuaian: LONG_FINDING_TEXT,
      sebaiknya: LONG_RECOMMENDATION_TEXT,
      tahun: 2026,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Akurasi",
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: {
        id: "period-01",
        month: 1,
        year: 2026,
        label: "01/2026",
      },
    },
    {
      id: "finding-02",
      peserta_id: "agent-1",
      period_id: "period-05",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: "T-100",
      nilai: 1,
      ketidaksesuaian: LONG_FINDING_TEXT,
      sebaiknya: LONG_RECOMMENDATION_TEXT,
      tahun: 2026,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Akurasi",
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: {
        id: "period-05",
        month: 5,
        year: 2026,
        label: "05/2026",
      },
    },
  ],
  weights: {
    call: { service_type: "call", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    chat: { service_type: "chat", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    email: { service_type: "email", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    cso: { service_type: "cso", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    pencatatan: { service_type: "pencatatan", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    bko: { service_type: "bko", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    slik: { service_type: "slik", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
  },
  scoreHistory: [
    { month: 1, year: 2026, finalScore: 82, nonCriticalScore: 84, criticalScore: 80, sessionCount: 4, service_type: "call" },
    { month: 5, year: 2026, finalScore: 91, nonCriticalScore: 92, criticalScore: 90, sessionCount: 4, service_type: "call" },
  ],
  personalTrend: {
    labels: ["Jan", "Feb", "Mar", "Apr", "Mei"],
    datasets: [
      { label: "Total Temuan", data: [4, 3, 3, 2, 2], isTotal: true },
      { label: "Akurasi", data: [2, 2, 1, 1, 1], isTotal: false },
    ],
  },
  comparisonTable: {
    scope: {
      year: 2026,
      serviceType: "call",
      startMonth: 1,
      endMonth: 5,
      teamLabel: "Tim Email",
      serviceLabel: "Call",
    },
    rows: [
      {
        key: "total",
        label: "Total Temuan",
        agentCount: 2,
        teamAverage: 3,
        serviceAverage: 4,
        teamAgentCount: 4,
        serviceAgentCount: 10,
      },
      {
        key: "akurasi",
        label: "Akurasi",
        agentCount: 2,
        teamAverage: 2,
        serviceAverage: 2.5,
        teamAgentCount: 4,
        serviceAgentCount: 10,
      },
    ],
  },
  rootCauses: [
    {
      clusterId: "salah_jawaban",
      label: "Akurasi jawaban",
      priority: 8,
      findingsCount: 2,
      affectedTickets: 2,
      criticalFindingsCount: 1,
      averageNilai: 1.5,
      matchedKeywords: ["akurasi"],
      recommendation: LONG_RECOMMENDATION_TEXT,
      evidence: [
        {
          id: "evidence-1",
          no_tiket: "T-100",
          periodId: "period-05",
          indicatorName: "Akurasi",
          nilai: 1,
          text: "Jawaban masih kurang akurat",
        },
      ],
      periods: [
        {
          periodId: "period-05",
          month: 5,
          year: 2026,
          label: "05/2026",
          serviceType: "call",
          findingsCount: 2,
          criticalFindingsCount: 1,
          affectedTickets: 2,
        },
      ],
    } as RootCauseResult,
  ],
};

const VISUAL_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

agentFixture.periodSummaries = VISUAL_MONTH_LABELS.map((_, index) => {
  const month = index + 1;
  const score = 80 + month;
  return {
    id: `period-${String(month).padStart(2, "0")}`,
    month,
    year: 2026,
    label: `${String(month).padStart(2, "0")}/2026`,
    serviceType: "call",
    finalScore: score,
    nonCriticalScore: score + 1,
    criticalScore: score - 1,
    sessionCount: 4,
    findingsCount: month % 4,
  };
});
agentFixture.scoreHistory = agentFixture.periodSummaries.map((period) => ({
  month: period.month,
  year: period.year,
  finalScore: period.finalScore,
  nonCriticalScore: period.nonCriticalScore,
  criticalScore: period.criticalScore,
  sessionCount: period.sessionCount,
  service_type: "call",
}));
agentFixture.personalTrend = {
  labels: VISUAL_MONTH_LABELS,
  datasets: [
    {
      label: "Total Temuan",
      data: [12, 11, 10, 9, 8, 7, 6, 6, 5, 4, 3, 2],
      isTotal: true,
    },
    {
      label: "Akurasi",
      data: [4, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 0],
      isTotal: false,
    },
  ],
};
agentFixture.comparisonTable.scope.endMonth = 12;

const quickviewFixture: SidakAgentQuickviewResponse = {
  context: {
    agentId: "agent-1",
    year: 2026,
    serviceType: "call",
    periodMode: "ytd",
  },
  combinedTeam: {
    rank: 2,
    total: 8,
    scopeId: "combined-scope",
    scopeLabel: "Tim Gabungan",
    basis: "least_findings_ytd",
    tiedAgents: [],
  },
  leaderTeam: {
    rank: 1,
    total: 4,
    scopeId: "leader-scope",
    scopeLabel: "Tim Leader",
    basis: "least_findings_ytd",
    tiedAgents: [],
  },
  forecast: {
    status: "improving",
    label: "Membaik",
    supportingText: "Tren temuan menurun",
    findingsSlope: -1.2,
    sourcePointCount: 3,
    confidence: "high",
    horizonMonths: 3,
  },
};

const foldersFixture = [{ id: "folder-tim-email", name: "Tim Email", parent_id: null }];
const folderAgentsFixture = [
  { id: "agent-1", nama: VISUAL_AGENT_NAME },
  { id: "agent-2", nama: "Rama Audit" },
];

function toJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  };
}

async function mockSupabase(page: Page) {
  await page.addInitScript(
    ({ session, profile, storageKey }) => {
      localStorage.setItem("auth_token", session.access_token);
      localStorage.setItem("auth_profile", JSON.stringify(profile));
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { session: authSession, profile: authProfile, storageKey: SUPABASE_STORAGE_KEY },
  );

  await page.route("**/auth/v1/user*", async (route) => {
    await route.fulfill(toJson({ user: authUser }));
  });

  await page.route("**/rest/v1/profiles*", async (route) => {
    await route.fulfill(
      toJson([authProfile], 200, {
        "content-range": "0-0/1",
      }),
    );
  });
}

async function mockSidakApi(page: Page) {
  await page.route(/.*\/api\/v1\/sidak\/agents\/agent-1\?.*/, async (route) => {
    await route.fulfill(toJson({ success: true, data: agentFixture }));
  });

  await page.route(/.*\/api\/v1\/sidak\/agents\/agent-1\/quickview\?.*/, async (route) => {
    await route.fulfill(toJson({ success: true, data: quickviewFixture }));
  });

  await page.route(/.*\/api\/v1\/sidak\/folders$/, async (route) => {
    await route.fulfill(toJson({ success: true, data: foldersFixture }));
  });

  await page.route(/.*\/api\/v1\/sidak\/folders\/.*\/agents$/, async (route) => {
    await route.fulfill(toJson({ success: true, data: folderAgentsFixture }));
  });
}

async function prepareArtifacts() {
  await mkdir(artifactDir, { recursive: true });
}

function buildExportContext() {
  return {
    selectedMonth: 12,
    trendStartMonth: 1,
    trendEndMonth: 12,
    quickview: quickviewFixture,
    isStaff: true,
  };
}

async function resetScrollState(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0 }));
  await page.locator("main > section").evaluateAll((sections) => {
    for (const section of sections) {
      if (section instanceof HTMLElement) {
        section.scrollTop = 0;
        section.scrollLeft = 0;
      }
    }
  });
}

async function captureViewport(page: Page, width: number, height: number, fileName: string) {
  await resetScrollState(page);
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: path.join(artifactDir, fileName), fullPage: true });
}

test.describe.configure({ mode: "serial" });

test("captures live SIDAK agent detail plus same-fixture export HTML", async ({ page }) => {
  const pageErrors: string[] = [];
  const chartWarnings: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      /Recharts|chart should be greater than 0/i.test(message.text())
    ) {
      chartWarnings.push(message.text());
    }
  });

  await prepareArtifacts();
  await mockSupabase(page);
  await mockSidakApi(page);

  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(`console.error: ${message.text()}`);
    }
  });

  await page.goto("/sidak/agents/agent-1");

  await expect(page.getByRole("heading", { name: /Nadia Puspitasari dengan Nama Agen Sangat Panjang/, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quickview performa", level: 3 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ringkasan" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Tren" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Temuan" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Simulasi" })).toBeVisible();

  await page.getByRole("tab", { name: "Tren" }).click();
  await expect(page.getByRole("tabpanel", { name: "Tren" })).toBeVisible();
  const trendEndSelect = page.getByRole("combobox", { name: "Bulan akhir tren" });
  await trendEndSelect.click();
  await page.getByRole("option", { name: "Mei" }).click();
  await expect(trendEndSelect).toContainText("Mei");

  await page.getByRole("tab", { name: "Temuan" }).click();
  await expect(page.getByRole("tabpanel", { name: "Temuan" })).toBeVisible();
  await page.getByRole("button", { name: /Mei 2026/ }).click();
  await expect(page.getByText(LONG_FINDING_TEXT)).toBeVisible();
  await captureViewport(page, 390, 1800, "live-route-temuan-390.png");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  const yearSelect = page.getByRole("combobox", { name: "Tahun audit" });
  await yearSelect.click();
  await page.getByRole("option", { name: "2026", exact: true }).click();
  await page.waitForTimeout(500);
  await resetScrollState(page);
  await page.getByRole("tab", { name: "Ringkasan" }).click();
  await expect(page.getByRole("heading", { name: "Ringkasan skor", level: 2 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Quickview performa agent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unduh Laporan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Input Audit" })).toBeVisible();
  await expect(page.getByText("Tiket Pengurang Skor Terbesar")).toBeVisible();
  await expect(page.getByRole("button", { name: /Pilih bulan/ })).toHaveCount(12);
  await expect(page.getByText("QA di bawah target 95%")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Skor QA di bawah target 95 persen" }),
  ).toHaveCount(12);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await captureViewport(page, width, 1800, `live-route-light-${width}.png`);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  }

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await captureViewport(page, 320, 1800, "live-route-dark-320.png");
  await captureViewport(page, 1440, 1800, "live-route-dark-1440.png");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).resolves.toBe(true);
  await captureViewport(page, 390, 1800, "live-route-reduced-motion-390.png");

  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await captureViewport(page, 1440, 1800, "live-route-zoom-200-1440.png");
  await page.evaluate(() => {
    document.body.style.zoom = "";
    document.documentElement.classList.remove("dark");
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const staticHtml = generateHTML(
    agentFixture,
    agentFixture.periodSummaries,
    [
      {
        id: "finding-01",
        month: 1,
        year: 2026,
        indicatorName: "Akurasi",
        category: "critical",
        nilai: 2,
        ketidaksesuaian: LONG_FINDING_TEXT,
        sebaiknya: LONG_RECOMMENDATION_TEXT,
        no_tiket: "T-099",
      },
      {
        id: "finding-02",
        month: 5,
        year: 2026,
        indicatorName: "Akurasi",
        category: "critical",
        nilai: 1,
        ketidaksesuaian: LONG_FINDING_TEXT,
        sebaiknya: LONG_RECOMMENDATION_TEXT,
        no_tiket: "T-100",
      },
    ],
    [],
    agentFixture.rootCauses,
    2026,
    "call",
    "static",
    buildExportContext(),
  );

  const interactiveHtml = generateHTML(
    agentFixture,
    agentFixture.periodSummaries,
    [
      {
        id: "finding-01",
        month: 1,
        year: 2026,
        indicatorName: "Akurasi",
        category: "critical",
        nilai: 2,
        ketidaksesuaian: LONG_FINDING_TEXT,
        sebaiknya: LONG_RECOMMENDATION_TEXT,
        no_tiket: "T-099",
      },
      {
        id: "finding-02",
        month: 5,
        year: 2026,
        indicatorName: "Akurasi",
        category: "critical",
        nilai: 1,
        ketidaksesuaian: LONG_FINDING_TEXT,
        sebaiknya: LONG_RECOMMENDATION_TEXT,
        no_tiket: "T-100",
      },
    ],
    [],
    agentFixture.rootCauses,
    2026,
    "call",
    "interactive",
    buildExportContext(),
  );

  await writeFile(path.join(artifactDir, "static.html"), staticHtml, "utf8");
  await writeFile(path.join(artifactDir, "interactive.html"), interactiveHtml, "utf8");

  await page.setContent(staticHtml, { waitUntil: "load" });
  await resetScrollState(page);
  await expect(page.locator(".profile-actions")).toHaveCount(1);
  await expect(page.locator(".shell-actions")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Nadia Puspitasari dengan Nama Agen Sangat Panjang/, level: 1 })).toBeVisible();
  await expect(page.getByText("0 Tiket")).toBeVisible();
  await captureViewport(page, 1440, 1800, "static-1440.png");
  await captureViewport(page, 390, 1800, "static-390.png");

  await page.setContent(interactiveHtml, { waitUntil: "load" });
  await resetScrollState(page);
  await expect(page.getByRole("heading", { name: /Nadia Puspitasari dengan Nama Agen Sangat Panjang/, level: 1 })).toBeVisible();
  await expect(page.getByText("0 Tiket")).toBeVisible();
  await captureViewport(page, 1440, 1800, "interactive-1440.png");
  await captureViewport(page, 390, 1800, "interactive-390.png");

  await page.getByRole("tab", { name: "Tren" }).click();
  await expect(page.getByRole("tabpanel", { name: "Tren" })).toBeVisible();
  await page.getByRole("button", { name: "Total Temuan" }).click();
  await page.getByRole("button", { name: "Akurasi" }).click();
  await page.getByRole("tab", { name: "Temuan" }).click();
  await expect(page.getByRole("tabpanel", { name: "Temuan" })).toBeVisible();
  const findingsDisclosure = page.locator('details.findings-period').first();
  await findingsDisclosure.locator('summary').click();
  await page.waitForTimeout(250);

  await captureViewport(page, 1440, 1800, "interactive-1440-filtered.png");
  await captureViewport(page, 390, 1800, "interactive-390-filtered.png");

  await expect(page.locator('[data-trend-filter="series-1"][aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('details.findings-period[open]')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(chartWarnings).toEqual([]);
});
