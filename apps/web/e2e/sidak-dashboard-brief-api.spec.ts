import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { formatQAIndicatorName } from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

// Real JWT/Hono/PostgREST/RLS, loopback only; all fixtures owned by this run.
const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2095;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
let yearId: string;
let groupId: string;
let requestId: string;
let indicatorId: string;
let parameter: string;
let failIndicatorRead = false;
const periods: string[] = [];
const folders: string[] = [];
const agents: string[] = [];

async function dashboard(
  query: Record<string, string> = {},
  token = trainer.token,
) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/sidak/dashboard?${new URLSearchParams({ year: String(YEAR), service_type: "call", folder_ids: folders[0]!, ...query })}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
function insertRows(
  agent: string,
  period: string,
  count: number,
  note: string | null = "informasi tidak akurat",
) {
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun)
    SELECT ${q(agent)}, ${q(period)}, ${q(indicatorId)}, 'call', ${q(`E2E-${ns}`)} || '-' || n, false, ${note ? 0 : 3}, ${note ? q(note) : "NULL"}, ${YEAR} FROM generate_series(1,${count}) n;`,
  );
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
  const guardedFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input.url,
    );
    if (failIndicatorRead && url.pathname === "/rest/v1/qa_indicators") {
      return new Response(
        JSON.stringify({ message: "fixture indicator failure" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return guardedFetch(input, init);
  }) as typeof fetch;
  trainer = await createUserWithJwt(env, "trainer", `brief-${ns}`);
  leader = await createUserWithJwt(env, "leader", `brief-${ns}`);
  expect(runSql(env, `SELECT id FROM qa_periods WHERE year=${YEAR};`)).toBe("");
  expect(runSql(env, `SELECT id FROM profiler_years WHERE year=${YEAR};`)).toBe(
    "",
  );
  yearId = sqlOne(
    env,
    `INSERT INTO profiler_years (year,label) VALUES (${YEAR},'E2E brief') RETURNING id;`,
  );
  for (const month of [1, 2])
    periods.push(
      sqlOne(
        env,
        `INSERT INTO qa_periods (month,year) VALUES (${month},${YEAR}) RETURNING id;`,
      ),
    );
  const indicator = JSON.parse(
    sqlOne(
      env,
      "SELECT row_to_json(i) FROM (SELECT id,name,parameter_group FROM qa_indicators WHERE service_type='call' AND is_active AND category='critical' ORDER BY sort_order,id LIMIT 1) i;",
    ),
  );
  indicatorId = indicator.id;
  parameter = formatQAIndicatorName(indicator);
  for (const team of ["A", "B"])
    folders.push(
      sqlOne(
        env,
        `INSERT INTO profiler_folders (name,year_id) VALUES (${q(`brief-${team}-${ns}`)},${q(yearId)}) RETURNING id;`,
      ),
    );
  for (let n = 0; n < 27; n++) {
    const outside = n === 26;
    const id = sqlOne(
      env,
      `INSERT INTO profiler_peserta (batch_name,nama,tim,jabatan,nomor_urut) VALUES (${q(`brief-${outside ? "B" : "A"}-${ns}`)},${q(`Agen ${String(n).padStart(2, "0")}`)},${q(outside ? "B" : "A")},'Agent',${n + 1}) RETURNING id;`,
    );
    agents.push(id);
    if (n < 13 || outside) {
      insertRows(id, periods[0]!, 1);
      insertRows(id, periods[1]!, outside ? 30 : n === 0 ? 7 : 1);
    }
  }
  groupId = sqlOne(
    env,
    `INSERT INTO access_groups (name,is_active) VALUES (${q(`brief-${ns}`)},true) RETURNING id;`,
  );
  for (const id of agents.slice(0, 2))
    runSql(
      env,
      `INSERT INTO access_group_items (access_group_id,field_name,field_value,is_active) VALUES (${q(groupId)},'peserta_id',${q(id)},true);`,
    );
  requestId = sqlOne(
    env,
    `INSERT INTO leader_access_requests (leader_user_id,module,status) VALUES (${q(leader.userId)},'sidak','approved') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO leader_access_request_groups (request_id,access_group_id) VALUES (${q(requestId)},${q(groupId)});`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (requestId)
    runSql(
      env,
      `DELETE FROM leader_access_request_groups WHERE request_id=${q(requestId)}; DELETE FROM leader_access_requests WHERE id=${q(requestId)};`,
    );
  if (groupId)
    runSql(
      env,
      `DELETE FROM access_group_items WHERE access_group_id=${q(groupId)}; DELETE FROM access_groups WHERE id=${q(groupId)};`,
    );
  for (const id of agents)
    runSql(
      env,
      `DELETE FROM qa_temuan WHERE peserta_id=${q(id)}; DELETE FROM profiler_peserta WHERE id=${q(id)};`,
    );
  for (const id of folders)
    runSql(env, `DELETE FROM profiler_folders WHERE id=${q(id)};`);
  for (const id of periods)
    runSql(env, `DELETE FROM qa_periods WHERE id=${q(id)};`);
  if (yearId) runSql(env, `DELETE FROM profiler_years WHERE id=${q(yearId)};`);
  for (const user of [trainer, leader])
    if (user)
      expect(
        (await createAdmin(env).auth.admin.deleteUser(user.userId)).error,
      ).toBeNull();
});

test("repeated dashboard requests do not reread reference tables", async () => {
  const tables = [
    "qa_periods",
    "qa_indicators",
    "qa_service_weights",
    "qa_service_rule_versions",
    "qa_service_rule_indicators",
  ];
  const counts = () =>
    tables.map((table) =>
      Number(
        runSql(
          env,
          `SELECT coalesce(sum(calls),0) FROM pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS ( SELECT %' AND query LIKE '%"public"."${table}"%';`,
        ),
      ),
    );
  const version = sqlOne(
    env,
    `INSERT INTO qa_service_rule_versions(service_type,effective_period_id,status,version_number) VALUES ('call',${q(periods[0]!)},'published',1) RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO qa_service_rule_indicators(rule_version_id,service_type,name,category,bobot,legacy_indicator_id) SELECT ${q(version)},service_type,name,category,bobot,id FROM qa_indicators WHERE id=${q(indicatorId)};`,
  );
  // Fixture writes bypass the API; explicitly clear the same process-local caches.
  const { invalidatePublishedRuleVersions } =
    await import("../../api/src/services/sidak/rule-version-resolver");
  const { invalidateRuleIndicatorSnapshots } =
    await import("../../api/src/services/sidak/period-scoring-context");
  invalidatePublishedRuleVersions();
  invalidateRuleIndicatorSnapshots();
  try {
    const before = counts();
    const first = await dashboard({ startMonth: "1", endMonth: "2" });
    const middle = counts();
    const second = await dashboard({ startMonth: "1", endMonth: "2" });
    const after = counts();
    console.log(
      "reference reads",
      tables.map((table, i) => ({
        table,
        first: middle[i]! - before[i]!,
        second: after[i]! - middle[i]!,
      })),
    );
    expect(middle[4]! - before[4]!).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(after.map((count, i) => count - middle[i]!)).toEqual(
      tables.map(() => 0),
    );
  } finally {
    runSql(env, `DELETE FROM qa_service_rule_versions WHERE id=${q(version)};`);
    invalidatePublishedRuleVersions();
    invalidateRuleIndicatorSnapshots();
  }
});

test("publishing a rule invalidates the cached version and batch validation reads it fresh", async () => {
  const version = sqlOne(
    env,
    `INSERT INTO qa_service_rule_versions(service_type,effective_period_id,status,version_number,created_by) VALUES ('call',${q(periods[0]!)},'draft',1,${q(trainer.userId)}) RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO qa_service_rule_indicators(rule_version_id,service_type,name,category,bobot,legacy_indicator_id) SELECT ${q(version)},service_type,name,category,bobot,id FROM qa_indicators WHERE id=${q(indicatorId)};`,
  );
  const otherIndicator = randomUUID();
  runSql(
    env,
    `INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES (${q(otherIndicator)},'call',${q(`unmapped-${ns}`)},'critical',1);`,
  );
  const request = (path: string, method = "GET", body?: unknown) =>
    tnaApiRequest(app, `http://localhost/api/v1/sidak${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const configPath = `/resolved-input-config?service_type=call&period_id=${periods[0]}`;
  const { invalidatePublishedRuleVersions } =
    await import("../../api/src/services/sidak/rule-version-resolver");
  const { invalidateRuleIndicatorSnapshots } =
    await import("../../api/src/services/sidak/period-scoring-context");
  try {
    const before = await request(configPath);
    expect(before.status).toBe(200);
    expect((await before.json()).data.ruleVersionId).not.toBe(version);
    const published = await request(
      `/rule-versions/${version}/publish`,
      "POST",
      {},
    );
    expect(published.status).toBe(200);
    const batch = await request("/temuan/batch", "POST", {
      peserta_id: agents[0],
      period_id: periods[0],
      service_type: "call",
      no_tiket: `RULE-${ns}`,
      items: [{ indicator_id: otherIndicator, nilai: 1 }],
    });
    const batchBody = await batch.json();
    expect(batch.status).toBe(422);
    expect(batchBody.error.code).toBe("INVALID_INDICATORS");
    const after = await request(configPath);
    expect(after.status).toBe(200);
    expect((await after.json()).data.ruleVersionId).toBe(version);
  } finally {
    runSql(
      env,
      `DELETE FROM qa_service_rule_versions WHERE id=${q(version)}; DELETE FROM qa_indicators WHERE id=${q(otherIndicator)};`,
    );
    invalidatePublishedRuleVersions();
    invalidateRuleIndicatorSnapshots();
  }
});

test("failed reference reads are retried", async () => {
  const { invalidateIndicators } =
    await import("../../api/src/services/sidak/period-indicator");
  invalidateIndicators();
  const request = () =>
    tnaApiRequest(
      app,
      "http://localhost/api/v1/sidak/indicators?service_type=call",
      { headers: { Authorization: `Bearer ${trainer.token}` } },
    );
  try {
    failIndicatorRead = true;
    expect((await request()).status).toBe(500);
  } finally {
    failIndicatorRead = false;
  }
  const retry = await request();
  expect(retry.status).toBe(200);
  expect((await retry.json()).data.length).toBeGreaterThan(0);
});

test("API weight and period writes invalidate the next read", async () => {
  const request = (path: string, method = "GET", body?: unknown) =>
    tnaApiRequest(app, `http://localhost/api/v1/sidak${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const beforeWeights = await request("/service-weights");
  expect(beforeWeights.status).toBe(200);
  const original = (await beforeWeights.json()).data.find(
    (w: { service_type: string }) => w.service_type === "call",
  );
  expect(original).toBeTruthy();
  const beforeDashboard = await dashboard();
  const changed = {
    critical_weight: 0.9,
    non_critical_weight: 0.1,
    scoring_mode: "weighted",
  };
  try {
    expect(
      (await request("/service-weights/call", "PUT", changed)).status,
    ).toBe(200);
    const afterWeights = await request("/service-weights");
    expect(
      (await afterWeights.json()).data.find(
        (w: { service_type: string }) => w.service_type === "call",
      ),
    ).toMatchObject(changed);
    const afterDashboard = await dashboard();
    expect(afterDashboard.summary.avgAgentScore).not.toBe(
      beforeDashboard.summary.avgAgentScore,
    );
  } finally {
    expect(
      (
        await request("/service-weights/call", "PUT", {
          critical_weight: Number(original.critical_weight),
          non_critical_weight: Number(original.non_critical_weight),
          scoring_mode: original.scoring_mode,
        })
      ).status,
    ).toBe(200);
  }
  expect((await request("/periods")).status).toBe(200);
  const created = await request("/periods", "POST", { month: 3, year: YEAR });
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id;
  try {
    const listed = await request("/periods");
    expect(
      (await listed.json()).data.some((p: { id: string }) => p.id === id),
    ).toBe(true);
  } finally {
    expect((await request(`/periods/${id}`, "DELETE")).status).toBe(200);
  }
  const listed = await request("/periods");
  expect(
    (await listed.json()).data.some((p: { id: string }) => p.id === id),
  ).toBe(false);
});

test("latest focus +6, deterministic recommendation, sorted/capped agents and period-only counts", async () => {
  const calls = (condition: string) =>
    Number(
      runSql(
        env,
        `SELECT coalesce(sum(calls),0) FROM pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS ( SELECT %' AND query LIKE '%"public"."qa_temuan"%' AND (${condition});`,
      ),
    );
  const bulk = `query LIKE '%"public"."qa_temuan"."is_countable"%' AND query NOT LIKE '%"public"."qa_temuan"."ketidaksesuaian"%' AND query NOT LIKE '%"public"."qa_temuan"."sebaiknya"%'`;
  const textById = `query LIKE '%"public"."qa_temuan"."ketidaksesuaian"%' AND query LIKE '%"public"."qa_temuan"."id" = ANY (%'`;
  const bulkWithNotes = `query LIKE '%"public"."qa_temuan"."peserta_id"%' AND (query LIKE '%"public"."qa_temuan"."ketidaksesuaian"%' OR query LIKE '%"public"."qa_temuan"."sebaiknya"%')`;
  const bulkBefore = calls(bulk);
  const notesBefore = calls(bulkWithNotes);
  const textBefore = calls(textById);
  const result = await dashboard({ startMonth: "1", endMonth: "2" });
  expect(calls(bulk) - bulkBefore).toBeGreaterThan(0);
  expect(calls(bulkWithNotes) - notesBefore).toBe(0);
  expect(calls(textById) - textBefore).toBeGreaterThan(0);
  expect(result.insights).toBeTruthy();
  const insight = result.insights;
  expect(insight.what.tone).toBe("bad");
  expect(insight.what.headline).toBe("Temuan naik 46,2% dari Jan 95");
  expect(insight.what.text).toContain("jadi kualitas memang menurun");
  expect(insight.what.findingsChangePct).toBe(46.2);
  expect(insight.focusParameter).toMatchObject({
    name: parameter,
    latestCount: 19,
    change: 6,
    category: "critical",
    recommendation:
      "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
  });
  expect(insight.focusParameter.agents).toEqual(
    agents.slice(0, 10).map((id, n) => ({
      agentId: id,
      nama: `Agen ${String(n).padStart(2, "0")}`,
      tim: "A",
      count: n === 0 ? 7 : 1,
    })),
  );
  expect(insight.nowWhat).toEqual({
    headline: `Coaching 10 agen untuk ${parameter}`,
    text: "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
    action: "coach_focus_agents",
  });
  expect(insight.soWhat.text).toContain(
    `Kenaikan terbesar datang dari ${parameter} (+6 temuan, parameter kritikal).`,
  );
});

test("focus root cause reads more than 100 findings in chunks", async () => {
  const note = `informasi tidak akurat chunk-${ns}`;
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun)
    SELECT ${q(agents[0]!)}, ${q(periods[1]!)}, ${q(indicatorId)}, 'call', ${q(`CHUNK-${ns}-`)} || n, false, 0, ${q(note)}, ${YEAR} FROM generate_series(1,100) n;`,
  );
  const textCalls = () =>
    Number(
      runSql(
        env,
        `SELECT coalesce(sum(calls),0) FROM pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS ( SELECT %' AND query LIKE '%"public"."qa_temuan"%' AND query LIKE '%"public"."qa_temuan"."ketidaksesuaian"%' AND query LIKE '%"public"."qa_temuan"."id" = ANY (%';`,
      ),
    );
  try {
    const before = textCalls();
    const result = await dashboard({ startMonth: "1", endMonth: "2" });
    expect(textCalls() - before).toBeGreaterThanOrEqual(2);
    expect(result.insights.focusParameter.recommendation).toBe(
      "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
    );
  } finally {
    runSql(env, `DELETE FROM qa_temuan WHERE ketidaksesuaian=${q(note)};`);
  }
});

test("leader receives only approved agents even with a broad/foreign folder request", async () => {
  const result = await dashboard({}, leader.token);
  expect(result.insights).toBeTruthy();
  expect(
    result.insights.focusParameter.agents.map(
      (a: { agentId: string }) => a.agentId,
    ),
  ).toEqual(agents.slice(0, 2));
  expect(
    (await dashboard({ folder_ids: folders[1]! }, leader.token)).insights,
  ).toBeNull();
  expect(
    (
      await dashboard({ folder_ids: folders.join(",") }, leader.token)
    ).insights.focusParameter.agents.map((a: { agentId: string }) => a.agentId),
  ).toEqual(agents.slice(0, 2));
});

test("more audits do not imply worsening; one period and empty ranges state their limitations", async () => {
  for (const id of agents.slice(13, 26)) insertRows(id, periods[1]!, 1, null);
  try {
    const result = await dashboard();
    expect(result.insights).toBeTruthy();
    expect(result.insights.what.tone).toBe("neutral");
    expect(result.insights.what.text).toContain(
      "karena lebih banyak agen diaudit, belum tentu kualitas menurun",
    );
    const one = await dashboard({ startMonth: "2", endMonth: "2" });
    expect(one.insights.what).toMatchObject({
      headline: "Belum ada pembanding",
      text: "Pilih rentang minimal dua bulan untuk melihat perubahan temuan.",
    });
    expect(one.insights.nowWhat.headline).toBe(
      "Mulai dari agen dengan temuan terbanyak",
    );
    expect(one.insights.previousLabel).toBeNull();
    expect(one.insights.latestLabel).toBeNull();
    expect(one.insights.focusParameter).toBeNull();
    expect(one.insights.nowWhat.action).toBe("open_ranking");
    expect(
      (await dashboard({ startMonth: "3", endMonth: "3" })).insights,
    ).toBeNull();
  } finally {
    for (const id of agents.slice(13, 26))
      runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${q(id)};`);
  }
});

test("stable, falling, zero baseline and no-finding narratives are honest", async () => {
  const ids = agents.slice(0, 13).map(q).join(",");
  function findings(prev: number, latest: number) {
    runSql(
      env,
      `UPDATE qa_temuan SET nilai=3,ketidaksesuaian=NULL,sebaiknya=NULL WHERE peserta_id IN (${ids});`,
    );
    for (const [n, period] of periods.entries())
      runSql(
        env,
        `UPDATE qa_temuan SET nilai=0,ketidaksesuaian='informasi tidak akurat' WHERE id IN (SELECT id FROM qa_temuan WHERE peserta_id IN (${ids}) AND period_id=${q(period)} ORDER BY id LIMIT ${n === 0 ? prev : latest});`,
      );
  }
  findings(13, 13);
  const stable = (await dashboard()).insights;
  expect(stable.what).toMatchObject({ tone: "neutral", findingsChangePct: 0 });
  expect(stable.what.headline).toBe("Temuan stabil (+0%)");
  expect(stable.focusParameter).toBeNull();
  findings(13, 12);
  const down = (await dashboard()).insights;
  expect(down.what.tone).toBe("good");
  expect(down.what.text).toContain("jadi kualitas membaik");
  for (const id of agents.slice(13, 26)) insertRows(id, periods[0]!, 1, null);
  try {
    const volume = (await dashboard()).insights;
    expect(volume.what.tone).toBe("neutral");
    expect(volume.what.text).toContain(
      "karena lebih sedikit agen diaudit, belum tentu kualitas membaik",
    );
  } finally {
    for (const id of agents.slice(13, 26))
      runSql(env, `DELETE FROM qa_temuan WHERE peserta_id=${q(id)};`);
  }
  findings(0, 19);
  const zero = (await dashboard()).insights;
  expect(zero.what.findingsChangePct).toBeNull();
  expect(zero.what).toMatchObject({
    headline: "19 temuan di Feb 95",
    text: "Jan 95 tanpa temuan, jadi persentase perubahan tidak dihitung.",
  });
  findings(0, 0);
  const clean = (await dashboard()).insights;
  expect(clean.soWhat).toMatchObject({
    tone: "good",
    scoreGapToTarget: null,
    belowTargetCount: 0,
  });
  expect(clean.soWhat.headline).toBe("Target 95 tercapai");
  expect(clean.nowWhat).toMatchObject({
    action: "none",
    headline: "Belum ada yang perlu ditindaklanjuti",
  });
});
