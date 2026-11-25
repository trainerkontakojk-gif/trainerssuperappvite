import { expect, test } from "@playwright/test";
import { installMockAuthSession } from "./helpers/mockAuth";
import { assertLocalDevOnlyTargetAt } from "./helpers/sidakJadwalShiftingHarness";
import { readDownloadedWorkbook } from "./helpers/sidakReportsDataHarness";
import { readFileSync } from "node:fs";
import { printedReadBack, readPdfPages } from "./helpers/pdfReadback";

const ORIGIN = "http://localhost:3005";
const requestBodies: Record<string, unknown>[] = [];
const requestUrls: string[] = [];
const sidakRpcUrls: string[] = [];
const managementData = {
  metadata: { mode: "individu" as const, agentId: "agent-1", agentName: "Alya Uji", indicatorId: "param-1", indicatorName: "Kepatuhan prosedur", indicatorScope: "detail-only" as const, allowedServiceTypes: null, showArchived: false, year: 2026, startMonth: 1, endMonth: 12, serviceType: "call" as const, generatedAt: "2026-03-01T00:00:00.000Z", generatedAtJakarta: "1 Mar 2026 07.00.00", temporaryMonths: [12], ruleVersions: [], mixedRuleVersions: false },
  monthly: [
    { rowType: "month", serviceType: "call", month: 1, label: "Januari 2026", agentsAudited: 1, sessionsAudited: 1, findingsCount: 2, ticketsWithFindings: 1, avgAgentScore: 94, complianceRate: 0, zeroErrorRate: 0, delta: null },
    { rowType: "month", serviceType: "call", month: 2, label: "Februari 2026", agentsAudited: null, sessionsAudited: null, findingsCount: null, ticketsWithFindings: null, avgAgentScore: null, complianceRate: null, zeroErrorRate: null, delta: null },
    { rowType: "quarter", serviceType: "call", month: null, quarter: "Q4", label: "Subtotal Q4 · berjalan — data sementara", agentsAudited: 1, sessionsAudited: 1, findingsCount: 0, ticketsWithFindings: 0, avgAgentScore: 100, complianceRate: 100, zeroErrorRate: 100, delta: null },
    { rowType: "month", serviceType: "call", month: 12, label: "Desember 2026 · berjalan — data sementara", agentsAudited: 1, sessionsAudited: 1, findingsCount: 0, ticketsWithFindings: 0, avgAgentScore: 100, complianceRate: 100, zeroErrorRate: 100, delta: null },
  ],
  trendMonthly: Array.from({ length: 6 }, (_, index) => ({ rowType: "month", serviceType: "call", month: index + 7, label: `${["Juli", "Agustus", "September", "Oktober", "November", "Desember"][index]} 2026${index === 5 ? " · berjalan — data sementara" : ""}`, agentsAudited: index === 0 ? 1 : null, sessionsAudited: index === 0 ? 1 : null, findingsCount: index === 0 ? 2 : null, ticketsWithFindings: index === 0 ? 1 : null, avgAgentScore: index === 0 ? 94 : null, complianceRate: index === 0 ? 0 : null, zeroErrorRate: index === 0 ? 0 : null, delta: null })),
  teams: [{ rowType: "month", team: "Tim Uji", batchName: "Batch 7", serviceType: "call", month: 1, label: "Januari 2026", agentsAudited: 1, sessionsAudited: 1, findingsCount: 2, ticketsWithFindings: 1, avgAgentScore: 94, complianceRate: 0, zeroErrorRate: 0, delta: null }, { rowType: "month", team: "Tim Uji", batchName: "Batch 7", serviceType: "call", month: 12, label: "Desember 2026 · berjalan — data sementara", agentsAudited: 1, sessionsAudited: 1, findingsCount: 0, ticketsWithFindings: 0, avgAgentScore: 100, complianceRate: 100, zeroErrorRate: 100, delta: null }, { rowType: "quarter", team: "Tim Uji", batchName: "Batch 7", serviceType: "call", month: null, quarter: "Q4", label: "Subtotal Q4 · berjalan — data sementara", agentsAudited: 1, sessionsAudited: 1, findingsCount: 0, ticketsWithFindings: 0, avgAgentScore: 100, complianceRate: 100, zeroErrorRate: 100, delta: null }, { rowType: "total", team: "Tim Uji", batchName: "Semua batch", serviceType: "call", month: null, label: "Total 1–12/2026", agentsAudited: 1, sessionsAudited: 1, findingsCount: 2, ticketsWithFindings: 1, avgAgentScore: 94, complianceRate: 0, zeroErrorRate: 0, delta: null }],
  agents: [{ agentId: "agent-1", name: "Alya Uji", team: "Tim Uji", batchName: "Batch 7", serviceType: "call", sessionsAudited: 1, findingsCount: 2, monthlyScores: { 1: 94 }, quarterScores: { Q1: 94, Q2: null, Q3: null, Q4: null }, periodScore: 94, monthsAtTarget: "0/1", rank: 1, trend: "stable" }],
  pareto: [{ serviceType: "call", parameter: "Kepatuhan prosedur", category: "non_critical", monthlyCounts: [{ month: 1, count: 2 }], total: 2, contribution: 100, cumulativeContribution: 100, agentsAffected: 1 }],
  leaders: [
    { leaderId: "leader-1", leaderName: "Leader Uji", agentsInScope: 1, serviceTypes: ["call"], scopeEmpty: false, monthly: [{ rowType: "month", serviceType: "call", month: 1, label: "Januari 2026", agentsAudited: 1, sessionsAudited: 1, findingsCount: 2, ticketsWithFindings: 1, avgAgentScore: 94, complianceRate: 0, zeroErrorRate: 0, delta: null }] },
    { leaderId: "empty-leader", leaderName: "Leader Kosong", agentsInScope: 0, serviceTypes: ["call"], scopeEmpty: true, monthly: [] },
  ],
  critical: [{ service_type: "call", qa_periods: { month: 1, year: 2026 }, profiler_peserta: { nama: "Alya Uji", batch_name: "Batch 7" }, qa_indicators: { name: "Kepatuhan prosedur" }, no_tiket: "TKT-1", ketidaksesuaian: "RAW_CRITICAL_FINDING_SHOULD_NOT_APPEAR", sebaiknya: "RAW_CRITICAL_RECOMMENDATION_SHOULD_NOT_APPEAR", nilai: 2, is_phantom_padding: false, category: "critical" }],
  followUps: [{ agentId: "agent-1", name: "Alya Uji", team: "Tim Uji", batchName: "Batch 7", reasons: ["score_below_target", "repeated_parameter"], worstParameters: [{ parameter: "Kepatuhan prosedur", category: "critical", count: 2 }], repeatMonthCount: 1 }],
  details: [
    { service_type: "call", qa_periods: { month: 1, year: 2026 }, profiler_peserta: { nama: "Alya Uji", batch_name: "Batch 7" }, qa_indicators: { name: "Kepatuhan prosedur" }, no_tiket: "TKT-1", ketidaksesuaian: "Contoh temuan", sebaiknya: "Contoh rekomendasi", nilai: 2, is_phantom_padding: false },
    { service_type: "call", qa_periods: { month: 1, year: 2026 }, profiler_peserta: { nama: "Alya Uji", batch_name: "Batch 7" }, qa_indicators: { name: "Ghost" }, no_tiket: "GHOST", ketidaksesuaian: "Phantom finding", sebaiknya: "Phantom recommendation", nilai: 2, is_phantom_padding: true },
    { service_type: "call", qa_periods: { month: 1, year: 2026 }, profiler_peserta: { nama: "Alya Uji", batch_name: "Batch 7" }, qa_indicators: { name: "No recommendation" }, no_tiket: null, ketidaksesuaian: "Temuan tanpa rekomendasi", sebaiknya: null, nilai: 2, is_phantom_padding: false },
    { service_type: "call", qa_periods: { month: 1, year: 2026 }, profiler_peserta: { nama: "Alya Uji", batch_name: "Batch 7" }, qa_indicators: { name: "No ticket" }, no_tiket: null, ketidaksesuaian: "Temuan tanpa tiket", sebaiknya: "Rekomendasi tanpa tiket", nilai: 2, is_phantom_padding: false },
  ],
};

test.beforeAll(async () => {
  await assertLocalDevOnlyTargetAt(ORIGIN);
});

test("preset periode mengisi filter dan ekspor workbook delapan sheet berurutan", async ({ page }) => {
  requestUrls.length = 0;
  sidakRpcUrls.length = 0;
  requestBodies.length = 0;
  const seen: string[] = [];
  await page.clock.install({ time: new Date("2026-12-15T12:00:00.000Z") });
  await installMockAuthSession(page);
  // One fail-closed handler owns all traffic. Only expected API paths and the
  // local Vite document/assets are continued; anything else is aborted.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && !url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const path = url.pathname;
    if (path === "/api/v1/sidak/periods" || path === "/api/v1/sidak/indicators") {
      sidakRpcUrls.push(route.request().url());
    }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return json({ user: { id: "user-1", email: "trainer@local.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } });
    if (path === "/auth/v1/token") return json({ access_token: "live-test-token", refresh_token: "refresh-test-token", token_type: "bearer", expires_in: 3600, user: { id: "user-1", email: "trainer@local.test" } });
    if (path === "/rest/v1/profiles") return json([{ id: "user-1", email: "trainer@local.test", full_name: "Trainer Uji", role: "trainer", status: "active", is_deleted: false }]);
    if (path === "/api/v1/sidak/periods") return json({ success: true, data: [{ id: "period-jan", month: 1, year: 2026 }, { id: "period-feb", month: 2, year: 2026 }] });
    if (path === "/api/v1/sidak/agents") return json({ success: true, data: { agents: [], batches: [] } });
    if (path === "/api/v1/sidak/indicators") return json({ success: true, data: [] });
    if (path === "/api/v1/sidak/reports/management" && route.request().method() === "POST") {
      seen.push(path);
      requestUrls.push(route.request().url());
      requestBodies.push(JSON.parse(route.request().postData() || "{}") as Record<string, unknown>);
      return json({ success: true, data: managementData });
    }
    // Any unmocked app/API call is denied, never proxied to another service.
    await route.abort("blockedbyclient");
  });

  await page.goto(`${ORIGIN}/sidak/reports-data`);
  await expect(page.getByRole("heading", { name: "Laporan data", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Tahun" })).toContainText("2026");
  await expect(page.getByRole("combobox", { name: "Ke bulan" })).toContainText("Desember");
  await expect(page.getByText("Preset periode", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulanan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tahunan", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Dari bulan" })).toContainText("Januari");
  await expect(page.getByRole("combobox", { name: "Ke bulan" })).toContainText("Desember");
  await page.getByRole("button", { name: "Buat laporan manajemen" }).click();
  await expect.poll(() => seen.length).toBe(1);
  expect(requestBodies.at(-1)).toEqual(expect.objectContaining({ year: 2026, startMonth: 1, endMonth: 12 }));

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel Manajemen" }).click();
  const workbook = await readDownloadedWorkbook(await downloadPromise);
  expect(Object.keys(workbook)).toEqual(["Ringkasan", "Rekap Tim", "Rekap Leader", "Rekap Agen", "Pareto", "Critical", "Tindak Lanjut", "Detail Temuan"]);
  expect(workbook["Rekap Leader"]?.flat().join(" ")).toContain("Leader Uji");
  expect(workbook["Rekap Leader"]?.flat().join(" ")).toContain("scope kosong");
  expect(workbook.Critical?.flat().join(" ")).toContain("Kepatuhan prosedur");
  expect(workbook.Critical?.find((row) => row.includes("Kategori"))).toContain("Bulan");
  expect(workbook["Tindak Lanjut"]?.flat().join(" ")).toContain("Alya Uji");
  const detailRows = workbook["Detail Temuan"] ?? [];
  expect(detailRows.find((row) => row.includes("Seharusnya"))).toContain("Seharusnya");
  for (const name of Object.keys(workbook)) {
    expect(workbook[name]?.[0]?.[0]).toContain("Filter:");
    expect(workbook[name]?.flat().join(" ")).toContain("data ditarik pada 1 Mar 2026 07.00.00 (Asia/Jakarta)");
  }
  expect(workbook.Ringkasan?.flat().join(" ")).toContain("2026");
  const blankMonthRow = workbook.Ringkasan?.find((row) => row.includes("Februari 2026"));
  expect(blankMonthRow).toContain("–");
  const summaryRows = workbook.Ringkasan ?? [];
  const headers = summaryRows.find((row) => row.includes("Jenis baris")) ?? [];
  const januaryRow = summaryRows.find((row) => row.includes("Januari 2026")) ?? [];
  expect(januaryRow[headers.indexOf("Agen diaudit")]).toBe("1");
  expect(januaryRow[headers.indexOf("Temuan countable")]).toBe("2");
  expect(januaryRow[headers.indexOf("Tiket bertemuan")]).toBe("1");
  expect(summaryRows.find((row) => row.includes("Desember 2026 · berjalan — data sementara"))).toBeTruthy();
  expect(summaryRows.find((row) => row.includes("Subtotal Q4 · berjalan — data sementara"))).toBeTruthy();
  expect(workbook.Ringkasan?.[0]?.[0]).toContain("Agen Alya Uji · Parameter Kepatuhan prosedur (hanya berlaku untuk Detail Temuan)");
  expect(workbook.Ringkasan?.[0]?.[0]).not.toContain("agent-1");
  expect(workbook.Ringkasan?.[0]?.[0]).not.toContain("param-1");
  const exportedDetails = workbook["Detail Temuan"]?.flat().join(" ") ?? "";
  expect(exportedDetails).not.toContain("Phantom finding");
  expect(exportedDetails).not.toContain("Temuan tanpa rekomendasi");
  expect(exportedDetails).toContain("TKT-1");
  const ticketPlaceholderRow = workbook["Detail Temuan"]?.find((row) => row.includes("Temuan tanpa tiket"));
  expect(ticketPlaceholderRow).toContain("-");

  await page.setViewportSize({ width: 390, height: 844 });
  const pdfButton = page.getByRole("button", { name: "Export PDF Manajemen" });
  await expect(pdfButton).toBeVisible();
  const pdfButtonBox = await pdfButton.boundingBox();
  expect(pdfButtonBox?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await pdfButton.focus();
  const pdfDownloadPromise = page.waitForEvent("download");
  await pdfButton.press("Enter");
  const pdfDownload = await pdfDownloadPromise;
  await page.setViewportSize({ width: 1280, height: 900 });
  const pdf = readPdfPages(readFileSync(await pdfDownload.path()));
  const pdfText = printedReadBack(pdf.texts);
  for (const section of ["LAPORAN MANAJEMEN SIDAK", "Filter", "Periode pembanding", "KPI", "Tren 6 Bulan", "Tren Bulanan Periode", "Top 10 Parameter", "Perbandingan Tim", "Perbandingan Leader", "Tindak Lanjut", "Alya Uji", "1 Mar 2026 07.00.00"]) {
    expect(pdfText).toContain(section);
  }
  expect(pdfText).not.toContain("RAW_CRITICAL_FINDING_SHOULD_NOT_APPEAR");
  expect(pdfText).not.toContain("RAW_CRITICAL_RECOMMENDATION_SHOULD_NOT_APPEAR");
  expect(pdfText).not.toContain("Contoh temuan");
  expect(pdfText).not.toContain("TKT-1");
  expect(requestUrls).toEqual([`${ORIGIN}/api/v1/sidak/reports/management`]);
  expect(sidakRpcUrls.length).toBeGreaterThan(0);
  const managementUrl = new URL(requestUrls[0]!);
  const existingSidakUrl = new URL(sidakRpcUrls[0]!);
  expect(managementUrl.origin).toBe(existingSidakUrl.origin);
  expect(managementUrl.pathname.split("/").slice(0, 4)).toEqual(existingSidakUrl.pathname.split("/").slice(0, 4));
  expect(seen).toEqual(["/api/v1/sidak/reports/management"]);

  await page.getByRole("combobox", { name: "Dari bulan" }).click();
  await page.getByRole("option", { name: "Februari" }).click();
  await expect(page.getByText(/Laporan manajemen siap diunduh/)).toHaveCount(0);

  await page.clock.setFixedTime(new Date("2026-03-15T12:00:00.000Z"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Laporan data", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ke bulan" })).toContainText("Maret");
  await page.getByRole("combobox", { name: "Ke bulan" }).click();
  await expect(page.getByRole("option", { name: "Desember" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tahunan", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Ke bulan" })).toContainText("Maret");
  await page.getByRole("button", { name: "Per Individu" }).click();
  await page.getByRole("button", { name: "Buat laporan manajemen" }).click();
  await expect(page.getByText("Pilih agen terlebih dahulu.", { exact: true })).toBeVisible();
  expect(seen).toHaveLength(1);
});

test("management endpoint 500 shows a friendly error and never offers a stale export", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-03-15T12:00:00.000Z") });
  await installMockAuthSession(page);
  let managementRequests = 0;
  let failManagement = false;
  let failPdfImport = false;
  let holdResponse = false;
  let releaseResponse: (() => void) | null = null;
  let downloads = 0;
  page.on("download", () => { downloads++; });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && !url.pathname.startsWith("/api/")) {
      if (failPdfImport && url.pathname.toLowerCase().includes("jspdf")) return route.abort("failed");
      await route.continue();
      return;
    }
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return json({ user: { id: "user-1", email: "trainer@local.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } });
    if (path === "/auth/v1/token") return json({ access_token: "live-test-token", refresh_token: "refresh-test-token", token_type: "bearer", expires_in: 3600, user: { id: "user-1", email: "trainer@local.test" } });
    if (path === "/rest/v1/profiles") return json([{ id: "user-1", email: "trainer@local.test", full_name: "Trainer Uji", role: "trainer", status: "active", is_deleted: false }]);
    if (path === "/api/v1/sidak/periods") return json({ success: true, data: [{ id: "period-jan", month: 1, year: 2026 }, { id: "period-feb", month: 2, year: 2026 }, { id: "period-mar", month: 3, year: 2026 }] });
    if (path === "/api/v1/sidak/agents") return json({ success: true, data: { agents: [], batches: [] } });
    if (path === "/api/v1/sidak/indicators") return json({ success: true, data: [] });
    if (path === "/api/v1/sidak/reports/management" && route.request().method() === "POST") {
      managementRequests++;
      if (holdResponse) await new Promise<void>((resolve) => { releaseResponse = resolve; });
      if (failManagement) return json({ success: false, error: { code: "REPORT_ERROR", message: "Laporan manajemen belum bisa dibuat. Coba lagi." } }, 500);
      return json({ success: true, data: managementData });
    }
    await route.abort("blockedbyclient");
  });

  await page.goto(`${ORIGIN}/sidak/reports-data`);
  await expect(page.getByRole("heading", { name: "Laporan data", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Buat laporan manajemen" }).click();
  await expect(page.getByText(/Laporan manajemen siap diunduh/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Excel Manajemen" })).toBeVisible();

  failPdfImport = true;
  await page.getByRole("button", { name: "Export PDF Manajemen" }).click();
  await expect(page.getByText("File PDF belum bisa dibuat. Coba unduh lagi.", { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  failPdfImport = false;

  await page.getByRole("combobox", { name: "Dari bulan" }).click();
  await page.getByRole("option", { name: "Februari" }).click();
  await expect(page.getByText(/Laporan manajemen siap diunduh/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export Excel Manajemen" })).toHaveCount(0);

  holdResponse = true;
  failManagement = true;
  await page.getByRole("button", { name: "Buat laporan manajemen" }).click();
  await expect(page.getByRole("button", { name: "Membuat laporan..." })).toBeDisabled();
  await expect.poll(() => managementRequests).toBe(2);
  expect(releaseResponse).not.toBeNull();
  await releaseResponse!();
  await expect(page.getByText("Laporan manajemen belum bisa dibuat. Coba lagi.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Laporan manajemen siap diunduh/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export Excel Manajemen" })).toHaveCount(0);
  expect(downloads).toBe(0);
});
