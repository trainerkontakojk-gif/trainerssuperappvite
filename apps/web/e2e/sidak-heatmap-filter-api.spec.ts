import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

// Real Hono + JWT + disposable loopback PostgREST/RLS; no product stubs.
const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2096; // leap year: include the last day of February
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: Awaited<ReturnType<typeof createUserWithJwt>>;
const folders: string[] = [];
const agents: string[] = [];
let periodId: string;
let yearId: string;
let groupId: string;
let requestId: string;
let failTable: string | null = null;

async function heatmap(
  query: Record<string, string> = {},
  token = trainer.token,
) {
  return tnaApiRequest(
    app,
    `http://localhost/api/v1/sidak/heatmap?${new URLSearchParams({
      mode: "agent",
      year: String(YEAR),
      service_type: "call",
      ...query,
    })}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
}
async function data(query: Record<string, string> = {}, token = trainer.token) {
  const response = await heatmap(query, token);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.data;
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
  globalThis.fetch = (async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (failTable && url.pathname === `/rest/v1/${failTable}`) {
      return new Response(
        JSON.stringify({ message: "private-database-error-sentinel" }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
    return guardedFetch(input, init);
  }) as typeof fetch;
  trainer = await createUserWithJwt(env, "trainer", `heatmap-${ns}`);
  leader = await createUserWithJwt(env, "leader", `heatmap-${ns}`);
  // Refuse to reuse/delete someone else's period/year.
  expect(runSql(env, `SELECT id FROM qa_periods WHERE year=${YEAR};`)).toBe("");
  expect(runSql(env, `SELECT id FROM profiler_years WHERE year=${YEAR};`)).toBe(
    "",
  );
  periodId = sqlOne(
    env,
    `INSERT INTO qa_periods (month, year) VALUES (1, ${YEAR}) RETURNING id;`,
  );
  yearId = sqlOne(
    env,
    `INSERT INTO profiler_years (year, label) VALUES (${YEAR}, 'E2E heatmap') RETURNING id;`,
  );
  const indicator = sqlOne(
    env,
    "SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, id LIMIT 1;",
  );
  for (const team of ["A", "B"]) {
    const name = `e2e-heatmap-${team}-${ns}`;
    folders.push(
      sqlOne(
        env,
        `INSERT INTO profiler_folders (name, year_id) VALUES (${q(name)}, ${q(yearId)}) RETURNING id;`,
      ),
    );
    const agent = sqlOne(
      env,
      `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut) VALUES (${q(name)}, ${q(name)}, ${q(team)}, 'Agent', 1) RETURNING id;`,
    );
    agents.push(agent);
    for (const date of [`${YEAR}-01-10`, `${YEAR}-02-29`, null]) {
      runSql(
        env,
        `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun, tanggal_layanan)
      VALUES (${q(agent)}, ${q(periodId)}, ${q(indicator)}, 'call', ${q(`${name}-${date}`)}, false, 0, 'E2E temuan', ${YEAR}, ${date ? q(date) : "NULL"});`,
      );
    }
  }
  groupId = sqlOne(
    env,
    `INSERT INTO access_groups (name, is_active) VALUES (${q(`e2e-heatmap-${ns}`)}, true) RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO access_group_items (access_group_id, field_name, field_value, is_active) VALUES (${q(groupId)}, 'peserta_id', ${q(agents[0]!)}, true);`,
  );
  requestId = sqlOne(
    env,
    `INSERT INTO leader_access_requests (leader_user_id, module, status) VALUES (${q(leader.userId)}, 'sidak', 'approved') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO leader_access_request_groups (request_id, access_group_id) VALUES (${q(requestId)}, ${q(groupId)});`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  failTable = null;
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
  if (yearId) runSql(env, `DELETE FROM profiler_years WHERE id=${q(yearId)};`);
  if (periodId) runSql(env, `DELETE FROM qa_periods WHERE id=${q(periodId)};`);
  for (const user of [trainer, leader])
    if (user) {
      const { error } = await createAdmin(env).auth.admin.deleteUser(
        user.userId,
      );
      expect(error).toBeNull();
    }
});

test("folder filter, month boundaries, and all-period missing dates", async () => {
  const year = await data({ folder_ids: folders[0]! });
  expect(year.totalFindings).toBe(2);
  expect(year.missingDateFindingsAllPeriods).toBe(1);
  const feb = await data({
    folder_ids: folders[0]!,
    start_month: "2",
    end_month: "2",
  });
  expect(feb.totalFindings).toBe(1);
  expect(feb.days.filter((day: { count: number }) => day.count > 0)).toEqual([
    { date: `${YEAR}-02-29`, count: 1 },
  ]);
  expect(feb.missingDateFindingsAllPeriods).toBe(1);
  const multi = await data({
    folder_ids: folders.join(","),
    start_month: "1",
    end_month: "2",
    count_by: "tiket",
  });
  expect(multi.totalFindings).toBe(4);
  expect((await data({ folder_ids: randomUUID() })).totalFindings).toBe(0);
});

test("leader intersection cannot expand scope, including missing dates and agent_id", async () => {
  expect((await data({}, leader.token)).totalFindings).toBe(2);
  const own = await data({ folder_ids: folders[0]! }, leader.token);
  expect(own.totalFindings).toBe(2);
  const other = await data({ folder_ids: folders[1]! }, leader.token);
  expect(other.totalFindings).toBe(0);
  expect(other.missingDateFindingsAllPeriods).toBe(0);
  const both = await data({ folder_ids: folders.join(",") }, leader.token);
  expect(both.totalFindings).toBe(2);
  expect(both.missingDateFindingsAllPeriods).toBe(1);
  expect(
    (
      await heatmap(
        { folder_ids: folders[1]!, agent_id: agents[1]! },
        leader.token,
      )
    ).status,
  ).toBe(403);
});

test("folder/participant query failures are friendly errors, not plausible empty success", async () => {
  for (const table of ["profiler_folders", "profiler_peserta"]) {
    failTable = table;
    try {
      const response = await heatmap({ folder_ids: folders[0]! });
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("HEATMAP_ERROR");
      expect(JSON.stringify(body)).not.toContain(
        "private-database-error-sentinel",
      );
    } finally {
      failTable = null;
    }
  }
});

test("invalid folder IDs and incomplete, reversed, or out-of-range months return 400", async () => {
  const invalidQueries: Record<string, string>[] = [
    { start_month: "3", end_month: "2" },
    { start_month: "1" },
    { end_month: "2" },
    { start_month: "0", end_month: "2" },
    { start_month: "1", end_month: "13" },
    { start_month: "1.5", end_month: "2" },
    { folder_ids: "not-a-uuid" },
    { folder_ids: `${folders[0]},` },
    { folder_ids: "" },
  ];
  for (const query of invalidQueries) {
    const response = await heatmap(query);
    expect(response.status, JSON.stringify(query)).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  }
});
