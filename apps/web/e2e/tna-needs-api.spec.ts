import { tnaApiRequest } from "./helpers/tnaApi";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { createTnaFixture } from "./helpers/tnaFixture";
import { createUserWithJwt, runSql } from "./helpers/sidakRealBackend";

test.describe.configure({ mode: "serial" });
const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
let app: Hono;
let users: Awaited<ReturnType<typeof fixture.seed>>;
const denied: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];
const query = (
  indicator = fixture.ids.metricsIndicators.alpha,
  period = fixture.ids.periods[2]!,
) =>
  `?service_type=chat&period_id=${period}&indicator_id=${indicator}&compare_count=2`;
const payload = () => ({
  service_type: "chat",
  period_id: fixture.ids.periods[2],
  indicator_id: fixture.ids.metricsIndicators.alpha,
  compare_count: 2,
  validated_cluster_id: "kurang_menggali",
  cause_note: "Trainer membaca tiket dan memvalidasi penyebab.",
  gap_type: "skill",
  outcome: "training",
});
async function request(
  path: string,
  body?: unknown,
  token: string | null = users.trainer.token,
) {
  return tnaApiRequest(app, `http://localhost/api/v1/tna${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: fixture.env.apiUrl,
    VITE_SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: fixture.env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  users = await fixture.seed();
  for (const role of ["leader", "agent"] as const)
    denied.push(await createUserWithJwt(fixture.env, role, namespace));
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
test.afterAll(async () => {
  runSql(
    fixture.env,
    `DELETE FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}','${fixture.ids.extraPeriods[0]}');`,
  );
  for (const user of denied) {
    const { createAdmin } = await import("./helpers/sidakRealBackend");
    expect(
      (await createAdmin(fixture.env).auth.admin.deleteUser(user.userId)).error,
    ).toBeNull();
  }
  await fixture.cleanup();
});
test("detail reuses D2 findings across agents and excludes clean, phantom and QA rows", async () => {
  const response = await request(`/parameters/detail${query()}`);
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.metrics).toMatchObject({
    findings: 3,
    affectedAgents: 3,
    auditedAgents: 5,
    sampledSessions: 33,
    spreadPct: 60,
  });
  expect(data.metrics.comparePeriods).toHaveLength(2);
  expect(
    data.affected_agents
      .map((a: { peserta_id: string }) => a.peserta_id)
      .sort(),
  ).toEqual(fixture.ids.participants.slice(0, 3).sort());
  expect(data.clusters).toHaveLength(1);
  expect(data.clusters[0]).toMatchObject({
    clusterId: "kurang_menggali",
    findingsCount: 3,
  });
  expect(data.clusters[0].evidence).toHaveLength(3);
  expect(data.sample_tickets).toHaveLength(3);
  expect(
    data.suggested_programs.map((p: { code: string }) => p.code),
  ).toContain("effective-probing");
  const bulk = await request(
    `/parameters/detail${query(fixture.ids.bulkIndicator, fixture.ids.extraPeriods[0]!)}`,
  );
  const bulkData = (await bulk.json()).data;
  expect(bulkData.metrics.findings).toBe(1250);
  expect(bulkData.clusters[0].findingsCount).toBe(1250);
  expect(bulkData.clusters[0].evidence).toHaveLength(3);
  expect(bulkData.sample_tickets).toHaveLength(10);
  // Eight distinct known causes exercise the helper's default top-five limit.
  runSql(
    fixture.env,
    `WITH ranked AS (SELECT id, row_number() OVER (ORDER BY id) AS n FROM qa_temuan WHERE indicator_id='${fixture.ids.bulkIndicator}' AND period_id='${fixture.ids.extraPeriods[0]}') UPDATE qa_temuan q SET ketidaksesuaian=(ARRAY['salah nama perusahaan','informasi berlebihan','salah penggunaan sistem','salah menulis','kurang teliti','kurang paham standar jawaban','tidak melakukan probing','catatan tanpa kata kunci'])[((ranked.n-1)%8)+1] FROM ranked WHERE q.id=ranked.id;`,
  );
  const varied = (
    await (
      await request(
        `/parameters/detail${query(fixture.ids.bulkIndicator, fixture.ids.extraPeriods[0]!)}`,
      )
    ).json()
  ).data;
  expect(varied.clusters).toHaveLength(5);
  for (const cluster of varied.clusters)
    expect(cluster.evidence.length).toBeLessThanOrEqual(3);
  expect(varied.sample_tickets).toHaveLength(10);
});
test("T3 endpoints enforce 401/403 and allow admin/trainer", async () => {
  for (const [path, body] of [
    [`/parameters/detail${query()}`, undefined],
    ["/needs", undefined],
    ["/needs", payload()],
  ] as const) {
    expect((await request(path, body, null)).status).toBe(401);
    for (const user of denied)
      expect((await request(path, body, user.token)).status).toBe(403);
    for (const user of [users.admin, users.trainer])
      expect((await request(path, body, user.token)).status).toBe(
        body ? 201 : 200,
      );
  }
});
test("need recomputes snapshot after QA changes, ignores body numbers and logs activity", async () => {
  const before = (await (await request(`/parameters/detail${query()}`)).json())
    .data.metrics;
  runSql(
    fixture.env,
    `UPDATE qa_temuan SET nilai=3,ketidaksesuaian=NULL,sebaiknya=NULL WHERE peserta_id='${fixture.ids.participants[0]}' AND indicator_id='${fixture.ids.metricsIndicators.alpha}' AND period_id='${fixture.ids.periods[2]}';`,
  );
  const response = await request("/needs", {
    ...payload(),
    validation_snapshot: { findings: 999999 },
    findings: 999999,
    suggested_cluster_id: "salah_jawaban",
    created_by: users.admin.userId,
  });
  expect(response.status).toBe(201);
  const { data } = await response.json();
  expect(before.findings).toBe(3);
  expect(data.validation_snapshot).toMatchObject({
    findings: 2,
    affectedAgents: 2,
    sampledSessions: 33,
    metric_version: 1,
    isCandidate: false,
  });
  expect(data.validation_snapshot.ratePer100).toBeCloseTo((2 / 33) * 100);
  expect(data.created_by).toBe(users.trainer.userId);
  expect(data.suggested_cluster_id).toBe("kurang_menggali");
  expect(
    runSql(
      fixture.env,
      `SELECT validation_snapshot->>'findings' FROM tna_needs WHERE id='${data.id}';`,
    ),
  ).toBe("2");
  expect(
    Number(
      runSql(
        fixture.env,
        `SELECT count(*) FROM activity_logs WHERE user_id='${users.trainer.userId}' AND module='tna' AND type='add' AND action='Memvalidasi kebutuhan TNA: ${data.id}';`,
      ),
    ),
  ).toBe(1);
  const detail = await request(`/needs/${data.id}`);
  expect(detail.status).toBe(200);
  expect((await detail.json()).data).toMatchObject({
    need: { id: data.id },
    plans: [],
  });
  const listed = await request(
    `/needs?service_type=chat&period_id=${fixture.ids.periods[2]}&outcome=training`,
  );
  expect(
    (await listed.json()).data.items.map((n: { id: string }) => n.id),
  ).toContain(data.id);
  const filtered = await request(`/needs?outcome=eskalasi_non_training`);
  expect((await filtered.json()).data.items).toEqual([]);
  const escalation = await request("/needs", {
    ...payload(),
    outcome: "eskalasi_non_training",
    validated_cluster_id: "salah_penggunaan_sistem",
    gap_type: "proses",
  });
  expect(escalation.status).toBe(201);
  const escalationNeed = (await escalation.json()).data;
  expect(escalationNeed).toMatchObject({
    suggested_cluster_id: "kurang_menggali",
    validated_cluster_id: "salah_penggunaan_sistem",
    outcome: "eskalasi_non_training",
  });
  const escalations = (
    await (
      await request(
        `/needs?service_type=chat&period_id=${fixture.ids.periods[2]}&outcome=eskalasi_non_training`,
      )
    ).json()
  ).data.items;
  expect(escalations.map((need: { id: string }) => need.id)).toEqual([
    escalationNeed.id,
  ]);
  expect(
    (
      await (
        await request(
          `/needs?service_type=call&period_id=${fixture.ids.periods[2]}`,
        )
      ).json()
    ).data.items,
  ).toEqual([]);
  expect(
    (await (await request(`/needs?period_id=${fixture.ids.periods[0]}`)).json())
      .data.items,
  ).toEqual([]);
  expect(
    (await request(`/needs/${data.id}`, undefined, users.admin.token)).status,
  ).toBe(200);

  for (const user of denied)
    expect(
      (await request(`/needs/${data.id}`, undefined, user.token)).status,
    ).toBe(403);
  expect((await request(`/needs/${data.id}`, undefined, null)).status).toBe(
    401,
  );
});
test("zero findings rejects forged snapshot with 422 and creates no need", async () => {
  runSql(
    fixture.env,
    `UPDATE qa_temuan SET nilai=3,ketidaksesuaian=NULL,sebaiknya=NULL WHERE indicator_id='${fixture.ids.metricsIndicators.alpha}' AND period_id='${fixture.ids.periods[2]}';`,
  );
  const count = () =>
    runSql(
      fixture.env,
      `SELECT count(*) FROM tna_needs WHERE period_id='${fixture.ids.periods[2]}';`,
    );
  const before = count();
  const response = await request("/needs", {
    ...payload(),
    validation_snapshot: { findings: 10 },
  });
  expect(response.status).toBe(422);
  expect((await response.json()).error.code).toBe("TNA_NO_FINDINGS");
  expect(count()).toBe(before);
  const detail = (await (await request(`/parameters/detail${query()}`)).json())
    .data;
  expect(detail.metrics.findings).toBe(0);
  expect(detail.clusters).toEqual([]);
  expect(detail.affected_agents).toEqual([]);
  runSql(
    fixture.env,
    `DELETE FROM qa_temuan WHERE period_id='${fixture.ids.periods[2]}' AND peserta_id IN ('${fixture.ids.participants.join("','")}');`,
  );
  const noAudit = (await (await request(`/parameters/detail${query()}`)).json())
    .data;
  expect(noAudit.metrics).toMatchObject({
    auditStatus: "no_audit",
    findings: 0,
    ratePer100: null,
    spreadPct: null,
  });
  expect((await request("/needs", payload())).status).toBe(422);
  expect(count()).toBe(before);
});
test("T3 validates inputs and unknown identities without raw database errors", async () => {
  expect((await request("/parameters/detail?service_type=chat")).status).toBe(
    400,
  );
  expect(
    (await request(`/parameters/detail${query(randomUUID())}`)).status,
  ).toBe(404);
  expect(
    (
      await request(
        `/parameters/detail${query(fixture.ids.metricsIndicators.alpha, randomUUID())}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (await request("/needs", { ...payload(), cause_note: "x" })).status,
  ).toBe(400);
  expect(
    (await request("/needs", { ...payload(), gap_type: "invalid" })).status,
  ).toBe(400);
  expect((await request("/needs?outcome=invalid")).status).toBe(400);
  expect((await request("/needs/not-uuid")).status).toBe(400);
  expect((await request(`/needs/${randomUUID()}`)).status).toBe(404);
  expect(
    (await request("/needs", { ...payload(), service_type: "call" })).status,
  ).toBe(404);
});
