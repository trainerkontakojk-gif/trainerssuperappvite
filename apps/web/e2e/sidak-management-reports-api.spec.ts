import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";
import { resetSidakReferenceCache } from "./helpers/resetSidakReferenceCache";
import { tnaApiRequest } from "./helpers/tnaApi";

// Real Hono + local Supabase JWT. The target is rejected unless sidakRealBackend
// resolves its credentials to loopback; API modules are loaded after env pinning.
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const namespace = randomUUID().slice(0, 8);
let year = new Date().getFullYear() - 1;
const folderName = `e2e-management-${namespace}`;
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;
type SidakApiApp = typeof import("../../api/src/app").default;
let app: SidakApiApp;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
let unapprovedLeader: Awaited<ReturnType<typeof createUserWithJwt>>;
let accessGroupId: string;
let leaderRequestId: string;
let participantId: string;
let secondParticipantId: string;
let outsideParticipantId: string | null = null;
let excludedParticipantId: string | null = null;
let folderId: string;
let profilerYearId: string | null = null;
let profilerYearCreated = false;
const periodIds = new Map<number, string>();
const ruleVersionIds: string[] = [];

async function requestReport(body: Record<string, unknown>, token = trainer.token) {
  return tnaApiRequest(
    app,
    "http://localhost/api/v1/sidak/reports/management",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function requestDashboard(periodId: string, token = trainer.token, showArchived = false) {
  const query = new URLSearchParams({ service_type: "call", period_ids: periodId });
  if (showArchived) query.set("show_archived", "true");
  return tnaApiRequest(app, `http://localhost/api/v1/sidak/dashboard?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function requestDashboardRange(startMonth = 1, endMonth = 2) {
  const query = new URLSearchParams({ service_type: "call", year: String(year), startMonth: String(startMonth), endMonth: String(endMonth) });
  return tnaApiRequest(app, `http://localhost/api/v1/sidak/dashboard?${query}`, {
    headers: { Authorization: `Bearer ${trainer.token}` },
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  year = Number(sqlOne(env, `SELECT candidate FROM generate_series(2000,2100) candidate WHERE NOT EXISTS (SELECT 1 FROM qa_periods WHERE year=candidate) ORDER BY abs(candidate - extract(year FROM clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::int) LIMIT 1;`));
  trainer = await createUserWithJwt(env, "trainer", `management-report-${namespace}`);
  leader = await createUserWithJwt(env, "leader", `management-report-${namespace}`);
  unapprovedLeader = await createUserWithJwt(env, "leader", `management-unapproved-${namespace}`);

  for (const month of [1, 2]) {
    periodIds.set(month, sqlOne(env, `INSERT INTO qa_periods (month, year) VALUES (${month}, ${year}) RETURNING id;`));
  }
  const existingYear = runSql(env, `SELECT id FROM profiler_years WHERE year=${year};`);
  if (existingYear) {
    profilerYearId = existingYear;
  } else {
    profilerYearId = sqlOne(env, `INSERT INTO profiler_years (year, label) VALUES (${year}, 'E2E ${year}') RETURNING id;`);
    profilerYearCreated = true;
  }
  folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES (${quoted(folderName)}, ${quoted(profilerYearId)}) RETURNING id;`,
  );
  participantId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(folderName)}, ${quoted(`Agen Laporan ${namespace}`)}, 'Tim Uji Laporan', 'Agent', 1)
     RETURNING id;`,
  );
  secondParticipantId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(folderName)}, ${quoted(`Agen Kedua ${namespace}`)}, 'Tim Uji Laporan', 'Agent', 2)
     RETURNING id;`,
  );
  excludedParticipantId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(folderName)}, ${quoted(`Trainer Terlarang ${namespace}`)}, 'Tim Uji Laporan', 'Trainer', 3)
     RETURNING id;`,
  );
  const indicators = runSql(
    env,
    "SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, name LIMIT 2;",
  ).split("\n").map((value) => value.trim()).filter(Boolean);
  if (indicators.length < 2) throw new Error("Fixture memerlukan dua indikator call aktif.");
  const ticket = quoted(`E2E-MANAGEMENT-${namespace}`);
  const phantomTicket = quoted(`__PHANTOM__MANAGEMENT-${namespace}`);
  const rows = [
    `(${quoted(participantId)},${quoted(periodIds.get(1)!)},${quoted(indicators[0]!)},'call',${ticket},false,2,${quoted("Temuan actionable bulan Januari")},${quoted("Rekomendasi Januari")},${year})`,
    `(${quoted(participantId)},${quoted(periodIds.get(1)!)},${quoted(indicators[1]!)},'call',${ticket},false,1,${quoted("Temuan tanpa rekomendasi")},NULL,${year})`,
    `(${quoted(participantId)},${quoted(periodIds.get(1)!)},${quoted(indicators[0]!)},'call',${phantomTicket},true,3,NULL,NULL,${year})`,
    `(${quoted(participantId)},${quoted(periodIds.get(2)!)},${quoted(indicators[0]!)},'call',${ticket},false,2,${quoted("Temuan actionable bulan Februari")},${quoted("Rekomendasi Februari")},${year})`,
    `(${quoted(secondParticipantId)},${quoted(periodIds.get(1)!)},${quoted(indicators[0]!)},'call',${quoted(`__PHANTOM__SECOND-${namespace}`)},true,3,NULL,NULL,${year})`,
    `(${quoted(excludedParticipantId)},${quoted(periodIds.get(1)!)},${quoted(indicators[0]!)},'call',${quoted(`EXCLUDED-${namespace}`)},false,0,${quoted(`Temuan staf dikecualikan ${namespace}`)},${quoted("Rekomendasi staf")},${year})`,
    `(${quoted(excludedParticipantId)},${quoted(periodIds.get(2)!)},${quoted(indicators[0]!)},'call',${quoted(`EXCLUDED-FEB-${namespace}`)},false,0,${quoted(`Temuan staf dikecualikan ${namespace}`)},${quoted("Rekomendasi staf")},${year})`,
  ];
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, sebaiknya, tahun) VALUES ${rows.join(",")};`,
  );
  accessGroupId = sqlOne(
    env,
    `INSERT INTO access_groups (name,is_active) VALUES (${quoted(`management-${namespace}`)},true) RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO access_group_items (access_group_id,field_name,field_value,is_active) VALUES
      (${quoted(accessGroupId)},'peserta_id',${quoted(participantId)},true),
      (${quoted(accessGroupId)},'service_type','call',true);`,
  );
  leaderRequestId = sqlOne(
    env,
    `INSERT INTO leader_access_requests (leader_user_id,module,status) VALUES (${quoted(leader.userId)},'sidak','approved') RETURNING id;`,
  );
  runSql(env, `INSERT INTO leader_access_request_groups (request_id,access_group_id) VALUES (${quoted(leaderRequestId)},${quoted(accessGroupId)});`);
  app = (await import("../../api/src/app")).default;
  await resetSidakReferenceCache();
});

test.afterAll(async () => {
  if (leaderRequestId) runSql(env, `DELETE FROM leader_access_request_groups WHERE request_id=${quoted(leaderRequestId)}; DELETE FROM leader_access_requests WHERE id=${quoted(leaderRequestId)};`);
  if (accessGroupId) runSql(env, `DELETE FROM access_group_items WHERE access_group_id=${quoted(accessGroupId)}; DELETE FROM access_groups WHERE id=${quoted(accessGroupId)};`);
  if (outsideParticipantId) runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${quoted(outsideParticipantId)}; DELETE FROM profiler_peserta WHERE id=${quoted(outsideParticipantId)};`);
  if (excludedParticipantId) runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${quoted(excludedParticipantId)}; DELETE FROM profiler_peserta WHERE id=${quoted(excludedParticipantId)};`);
  if (secondParticipantId) runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${quoted(secondParticipantId)}; DELETE FROM profiler_peserta WHERE id=${quoted(secondParticipantId)};`);
  if (participantId) {
    runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${quoted(participantId)}; DELETE FROM profiler_peserta WHERE id=${quoted(participantId)};`);
  }
  if (ruleVersionIds.length) runSql(env, `DELETE FROM qa_service_rule_versions WHERE id IN (${ruleVersionIds.map(quoted).join(",")});`);
  if (folderId) runSql(env, `DELETE FROM profiler_folders WHERE id=${quoted(folderId)};`);
  const ids = [...periodIds.values()];
  if (ids.length) runSql(env, `DELETE FROM qa_periods WHERE id IN (${ids.map(quoted).join(",")});`);
  if (profilerYearCreated && profilerYearId) {
    const remainingFolders = runSql(env, `SELECT id FROM profiler_folders WHERE year_id=${quoted(profilerYearId)};`);
    if (!remainingFolders) runSql(env, `DELETE FROM profiler_years WHERE id=${quoted(profilerYearId)} AND year=${year};`);
  }
  for (const user of [trainer, leader, unapprovedLeader]) {
    if (!user) continue;
    const { error } = await createAdmin(env).auth.admin.deleteUser(user.userId);
    expect(error).toBeNull();
  }
});

test("management report aggregates audit, teams, agents, Pareto, and actionable detail", async () => {
  const response = await requestReport({ serviceType: "call", year, startMonth: 1, endMonth: 3 });
  expect(response.status, await response.clone().text()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  const data = body.data;
  expect(data).toEqual(expect.objectContaining({
    metadata: expect.objectContaining({ year, startMonth: 1, endMonth: 3, serviceType: "call", mode: "layanan", indicatorScope: "detail-only", generatedAtJakarta: expect.any(String) }),
    monthly: expect.any(Array), teams: expect.any(Array), agents: expect.any(Array),
    pareto: expect.any(Array), details: expect.any(Array),
  }));
  const january = data.monthly.find((row: { rowType: string; month: number }) => row.rowType === "month" && row.month === 1);
  const february = data.monthly.find((row: { rowType: string; month: number }) => row.rowType === "month" && row.month === 2);
  const march = data.monthly.find((row: { rowType: string; month: number }) => row.rowType === "month" && row.month === 3);
  expect(january).toEqual(expect.objectContaining({ agentsAudited: 2, sessionsAudited: 3, findingsCount: 2, ticketsWithFindings: 1, delta: null }));
  expect(february).toEqual(expect.objectContaining({ agentsAudited: 1, sessionsAudited: 1, findingsCount: 1, ticketsWithFindings: 1, delta: expect.objectContaining({ findings: -50, tickets: 0 }) }));
  expect(january.complianceRate).toEqual(expect.any(Number));
  expect(january.zeroErrorRate).toEqual(expect.any(Number));
  const dashboardResponse = await requestDashboard(periodIds.get(1)!);
  expect(dashboardResponse.status, await dashboardResponse.clone().text()).toBe(200);
  const dashboard = (await dashboardResponse.json()).data;
  expect(january).toEqual(expect.objectContaining({
    agentsAudited: dashboard.summary.totalAgents,
    findingsCount: dashboard.summary.totalDefects,
    ticketsWithFindings: dashboard.summary.totalTickets,
    avgAgentScore: dashboard.summary.avgAgentScore,
    complianceRate: dashboard.summary.complianceRate,
    zeroErrorRate: dashboard.summary.zeroErrorRate,
  }));
  expect(data.agents[0].monthlyScores[1]).toBe(dashboard.topAgents.find((agent: { agentId: string }) => agent.agentId === participantId).score);
  expect(march).toEqual(expect.objectContaining({ agentsAudited: null, sessionsAudited: null, findingsCount: null, ticketsWithFindings: null, avgAgentScore: null, complianceRate: null, zeroErrorRate: null, delta: null }));
  expect(data.monthly).toContainEqual(expect.objectContaining({ rowType: "quarter", quarter: "Q1", findingsCount: 3 }));
  expect(data.monthly).toContainEqual(expect.objectContaining({ rowType: "total", findingsCount: 3, ticketsWithFindings: 2, agentsAudited: 2 }));
  const rangeTotal = data.monthly.find((row: { rowType: string }) => row.rowType === "total");
  const rangeDashboardResponse = await requestDashboardRange();
  expect(rangeDashboardResponse.status, await rangeDashboardResponse.clone().text()).toBe(200);
  const rangeDashboard = (await rangeDashboardResponse.json()).data;
  expect(rangeTotal).toEqual(expect.objectContaining({ agentsAudited: rangeDashboard.summary.totalAgents, findingsCount: rangeDashboard.summary.totalDefects, ticketsWithFindings: rangeDashboard.summary.totalTickets, avgAgentScore: rangeDashboard.summary.avgAgentScore, complianceRate: rangeDashboard.summary.complianceRate, zeroErrorRate: rangeDashboard.summary.zeroErrorRate }));
  const quarterDashboardResponse = await requestDashboardRange(1, 3);
  expect(quarterDashboardResponse.status, await quarterDashboardResponse.clone().text()).toBe(200);
  const quarterDashboard = (await quarterDashboardResponse.json()).data;
  const quarterTotal = data.monthly.find((row: { rowType: string; quarter?: string }) => row.rowType === "quarter" && row.quarter === "Q1");
  expect(quarterTotal).toEqual(expect.objectContaining({ agentsAudited: quarterDashboard.summary.totalAgents, avgAgentScore: quarterDashboard.summary.avgAgentScore, complianceRate: quarterDashboard.summary.complianceRate, zeroErrorRate: quarterDashboard.summary.zeroErrorRate }));
  const paretoTotal = data.pareto.reduce((sum: number, row: { total: number }) => sum + row.total, 0);
  expect(paretoTotal).toBe(rangeTotal.findingsCount);
  expect(paretoTotal).toBe(rangeDashboard.summary.totalDefects);
  expect(data.monthly.find((row: { rowType: string }) => row.rowType === "total").agentsAudited).toBe(2);
  expect(data.teams).toContainEqual(expect.objectContaining({ team: "Tim Uji Laporan", batchName: "Semua batch", rowType: "month", month: 1, agentsAudited: 2 }));
  expect(data.teams).toContainEqual(expect.objectContaining({ team: "Tim Uji Laporan", batchName: folderName, rowType: "month", month: 1, agentsAudited: 2 }));
  expect(data.teams).toContainEqual(expect.objectContaining({ team: "Tim Uji Laporan", batchName: folderName, rowType: "month", month: 3, agentsAudited: null, avgAgentScore: null }));
  expect(data.agents).toEqual(expect.arrayContaining([
    expect.objectContaining({ agentId: participantId, findingsCount: 3, sessionsAudited: 3, monthlyScores: expect.objectContaining({ 1: expect.any(Number), 2: expect.any(Number), 3: null }) }),
    expect.objectContaining({ agentId: secondParticipantId, findingsCount: 0, sessionsAudited: 1, monthlyScores: expect.objectContaining({ 1: expect.any(Number), 2: null, 3: null }) }),
  ]));
  expect(data.pareto).toEqual(expect.arrayContaining([
    expect.objectContaining({ total: 2, agentsAffected: 1 }),
  ]));
  expect(data.details).toHaveLength(2);
  const excludedData = JSON.stringify([data.monthly, data.teams, data.agents, data.pareto, data.details]);
  expect(excludedData).not.toContain(excludedParticipantId);
  expect(excludedData).not.toContain(`Trainer Terlarang ${namespace}`);
  expect(excludedData).not.toContain(`Temuan staf dikecualikan ${namespace}`);
  expect(data.details.map((row: { ketidaksesuaian: string }) => row.ketidaksesuaian).sort()).toEqual([
    "Temuan actionable bulan Februari",
    "Temuan actionable bulan Januari",
  ].sort());
  expect(JSON.stringify(data.details)).not.toContain("Temuan tanpa rekomendasi");
  expect(JSON.stringify(data.details)).not.toContain("__PHANTOM__MANAGEMENT");
});

test("leader report stays within approved participant and service scope", async () => {
  outsideParticipantId = sqlOne(env, `INSERT INTO profiler_peserta (batch_name,nama,tim,jabatan,nomor_urut) VALUES (${quoted(folderName)},${quoted(`OUT-OF-SCOPE-${namespace}`)},'OUT-OF-SCOPE','Agent',2) RETURNING id;`);
  const indicatorId = sqlOne(env, "SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, name LIMIT 1;");
  runSql(env, `INSERT INTO qa_temuan (peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,sebaiknya,tahun) VALUES (${quoted(outsideParticipantId)},${quoted(periodIds.get(1)!)},${quoted(indicatorId)},'call',${quoted(`OUT-OF-SCOPE-TICKET-${namespace}`)},false,2,${quoted(`OUT-OF-SCOPE-FINDING-${namespace}`)},${quoted("Outside scope recommendation")},${year});`);
  const own = await requestReport({ serviceType: "call", year, startMonth: 1, endMonth: 2 }, leader.token);
  expect(own.status).toBe(200);
  const ownBody = await own.json();
  expect(ownBody.data.agents.map((agent: { agentId: string }) => agent.agentId)).toEqual([participantId]);
  for (const sheet of [ownBody.data.monthly, ownBody.data.teams, ownBody.data.agents, ownBody.data.pareto, ownBody.data.details]) {
    expect(JSON.stringify(sheet)).not.toContain("OUT-OF-SCOPE");
    expect(JSON.stringify(sheet)).not.toContain("outOfScopeParticipant");
  }
  expect(ownBody.data.details.every((row: { peserta_id: string }) => row.peserta_id === participantId)).toBe(true);
  const allSheets = JSON.stringify([ownBody.data.monthly, ownBody.data.teams, ownBody.data.agents, ownBody.data.pareto, ownBody.data.details]);
  expect(allSheets).not.toContain(outsideParticipantId);
  expect(allSheets).not.toContain(`OUT-OF-SCOPE`);
  const forbiddenAgent = await requestReport({ serviceType: "call", year, startMonth: 1, endMonth: 2, pesertaId: outsideParticipantId }, leader.token);
  expect(forbiddenAgent.status).toBe(403);
  expect(await forbiddenAgent.json()).toEqual(expect.objectContaining({ success: false, error: expect.objectContaining({ code: "FORBIDDEN", message: "Agen tersebut tidak termasuk dalam akses Anda." }) }));
  expect(ownBody.data.monthly.find((row: { rowType: string; month: number }) => row.rowType === "month" && row.month === 1).findingsCount).toBe(2);
  runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${quoted(outsideParticipantId)}; DELETE FROM profiler_peserta WHERE id=${quoted(outsideParticipantId)};`);

  const outsideService = await requestReport({ serviceType: "email", year, startMonth: 1, endMonth: 2 }, leader.token);
  expect(outsideService.status).toBe(403);
  expect((await outsideService.json()).error.code).toBe("FORBIDDEN");
});

test("management report errors remain errors and showArchived parity matches dashboard", async () => {
  const response = await requestReport({ serviceType: "call", year, startMonth: 3, endMonth: 2 });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual(expect.objectContaining({
    success: false,
    error: expect.objectContaining({
      code: "VALIDATION_ERROR",
      message: "Filter periode laporan tidak valid.",
    }),
  }));

  const jakartaParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "numeric",
  }).formatToParts(new Date());
  const jakartaYear = Number(jakartaParts.find((part) => part.type === "year")?.value);
  const jakartaMonth = Number(jakartaParts.find((part) => part.type === "month")?.value);
  const currentQuarterStart = Math.floor((jakartaMonth - 1) / 3) * 3 + 1;
  const currentQuarter = `Q${Math.ceil(jakartaMonth / 3)}`;
  const currentPeriodReportResponse = await requestReport({
    serviceType: "call",
    year: jakartaYear,
    startMonth: currentQuarterStart,
    endMonth: jakartaMonth,
  });
  expect(currentPeriodReportResponse.status, await currentPeriodReportResponse.clone().text()).toBe(200);
  const currentPeriodReport = (await currentPeriodReportResponse.json()).data;
  const currentMonthRow = currentPeriodReport.monthly.find((row: { rowType: string; month: number }) => row.rowType === "month" && row.month === jakartaMonth);
  const currentQuarterRow = currentPeriodReport.monthly.find((row: { rowType: string; quarter?: string }) => row.rowType === "quarter" && row.quarter === currentQuarter);
  expect(currentMonthRow.label).toContain("berjalan — data sementara");
  expect(currentQuarterRow.label).toContain("berjalan — data sementara");

  const future = await requestReport({
    serviceType: "call",
    year: jakartaMonth === 12 ? jakartaYear + 1 : jakartaYear,
    startMonth: jakartaMonth === 12 ? 1 : jakartaMonth + 1,
    endMonth: jakartaMonth === 12 ? 1 : jakartaMonth + 1,
  });
  expect(future.status).toBe(400);
  const futureBody = await future.json();
  expect(futureBody.success).toBe(false);
  expect(futureBody.error.code).toBe("VALIDATION_ERROR");
  expect(futureBody.error.message).toBe("Filter periode laporan tidak valid.");

  for (const showArchived of [false, true]) {
    const archived = await requestReport({ serviceType: "call", year, startMonth: 1, endMonth: 1, showArchived });
    expect(archived.status).toBe(200);
    const report = (await archived.json()).data;
    expect(report.metadata.showArchived).toBe(showArchived);
    const dashboardResponse = await requestDashboard(periodIds.get(1)!, trainer.token, showArchived);
    expect(dashboardResponse.status).toBe(200);
    const dashboard = (await dashboardResponse.json()).data;
    const january = report.monthly.find((row: { rowType: string; month: number }) => row.rowType === "month" && row.month === 1);
    expect(january).toEqual(expect.objectContaining({
      agentsAudited: dashboard.summary.totalAgents,
      findingsCount: dashboard.summary.totalDefects,
      ticketsWithFindings: dashboard.summary.totalTickets,
      avgAgentScore: dashboard.summary.avgAgentScore,
      complianceRate: dashboard.summary.complianceRate,
      zeroErrorRate: dashboard.summary.zeroErrorRate,
    }));
    const allSections = JSON.stringify([report.monthly, report.teams, report.agents, report.pareto, report.details]);
    expect(allSections).not.toContain(excludedParticipantId);
    expect(allSections).not.toContain(`Trainer Terlarang ${namespace}`);
  }

  const reportNoAccess = await requestReport({ serviceType: "call", year, startMonth: 1, endMonth: 1 }, unapprovedLeader.token);
  expect(reportNoAccess.status).toBe(403);
  const reportRefusal = await reportNoAccess.json();
  expect(reportRefusal.success).toBe(false);
  expect(reportRefusal.error).toEqual(expect.objectContaining({
    code: "FORBIDDEN",
    message: "Anda belum memiliki akses SIDAK yang disetujui.",
  }));
});

test("management report tracks the published rule version effective in each month", async () => {
  const indicatorIds = runSql(env, `SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, name;`)
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const versionOneId = sqlOne(env, `INSERT INTO qa_service_rule_versions (service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,published_at)
    VALUES ('call',${quoted(periodIds.get(1)!)},'published',0.8,0.2,'weighted',9001,'2020-01-01T00:00:00Z') RETURNING id;`);
  const versionTwoId = sqlOne(env, `INSERT INTO qa_service_rule_versions (service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,published_at)
    VALUES ('call',${quoted(periodIds.get(2)!)},'published',0.2,0.8,'weighted',9002,'2020-01-02T00:00:00Z') RETURNING id;`);
  ruleVersionIds.push(versionOneId, versionTwoId);
  for (const [versionId, flip] of [[versionOneId, false], [versionTwoId, true]] as const) {
    runSql(env, `INSERT INTO qa_service_rule_indicators (rule_version_id,legacy_indicator_id,service_type,name,category,bobot,has_na,sort_order)
      SELECT ${quoted(versionId)}, id, service_type, name,
        CASE WHEN id=${quoted(indicatorIds[0]!)} THEN '${flip ? "non_critical" : "critical"}' ELSE category END,
        bobot, has_na, sort_order FROM qa_indicators WHERE service_type='call' AND is_active AND id <> ${quoted(indicatorIds[0]!)};`);
  }
  await resetSidakReferenceCache();
  const response = await requestReport({ serviceType: "call", year, startMonth: 1, endMonth: 2 });
  expect(response.status, await response.clone().text()).toBe(200);
  const report = (await response.json()).data;
  expect(report.metadata.mixedRuleVersions).toBe(true);
  expect(report.metadata.ruleVersions).toEqual(expect.arrayContaining([
    { serviceType: "call", month: 1, versionId: versionOneId },
    { serviceType: "call", month: 2, versionId: versionTwoId },
  ]));
  const dashboardRangeResponse = await requestDashboardRange();
  expect(dashboardRangeResponse.status, await dashboardRangeResponse.clone().text()).toBe(200);
  const dashboardRange = (await dashboardRangeResponse.json()).data;
  const rangeReportTotal = report.monthly.find((row: { rowType: string }) => row.rowType === "total");
  expect(report.pareto.reduce((sum: number, row: { total: number }) => sum + row.total, 0)).toBe(rangeReportTotal.findingsCount);
  expect(report.pareto.reduce((sum: number, row: { total: number }) => sum + row.total, 0)).toBe(dashboardRange.summary.totalDefects);
  for (const [month, periodId] of [[1, periodIds.get(1)!], [2, periodIds.get(2)!]] as const) {
    const dashboardResponse = await requestDashboard(periodId);
    expect(dashboardResponse.status, await dashboardResponse.clone().text()).toBe(200);
    const dashboard = (await dashboardResponse.json()).data;
    const row = report.monthly.find((item: { rowType: string; month: number }) => item.rowType === "month" && item.month === month);
    expect(row.avgAgentScore).toBe(dashboard.summary.avgAgentScore);
    expect(report.agents.find((agent: { agentId: string }) => agent.agentId === participantId).monthlyScores[month]).toBe(
      dashboard.topAgents.find((agent: { agentId: string }) => agent.agentId === participantId).score,
    );
  }
});
