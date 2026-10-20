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

test("latest focus +6, deterministic recommendation, sorted/capped agents and period-only counts", async () => {
  const result = await dashboard({ startMonth: "1", endMonth: "2" });
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
