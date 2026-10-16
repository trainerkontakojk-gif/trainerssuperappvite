import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import { runSql } from "./helpers/sidakRealBackend";

/**
 * HOLD/waktu-tunggu findings ("Etika Bertelepon", Call) must land in the
 * `hold_waktu_tunggu` root-cause cluster in both consumers of
 * deriveAgentRootCauses — SIDAK agent detail and TNA drill-down — without
 * moving non-HOLD findings out of their existing clusters. Local loopback
 * Supabase only (tnaFixture guards the endpoints).
 */
test.describe.configure({ mode: "serial" });
const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const indicatorId = randomUUID();
const agentId = fixture.ids.participants[1]!;
const periodId = fixture.ids.extraPeriods[0]!;
let app: Hono;
let users: Awaited<ReturnType<typeof fixture.seed>>;
let year: number;

// One call agent, one period, one parameter. Spec-owned `call` rows are the
// only call findings for this agent, so both responses see exactly these.
const findings: Array<
  [cluster: string, ketidaksesuaian: string, sebaiknya: string | null]
> = [
  [
    "hold_waktu_tunggu",
    "Agent melakukan HOLD pertama selama 01.04 menit",
    "Seharusnya agent melakukan HOLD pertama max 60 detik",
  ],
  [
    "hold_waktu_tunggu",
    "Agent melakukan HOLD pertama selama 01.20 menit",
    null,
  ],
  // Previously matched salah_jawaban via "tidak sesuai dalam melakukan".
  [
    "hold_waktu_tunggu",
    "Agent tidak sesuai dalam melakukan HOLD pertama.",
    null,
  ],
  [
    "hold_waktu_tunggu",
    "Terdapat dead air selama 25 detik tanpa informasi kepada konsumen",
    "Seharusnya waktu tunggu diinformasikan kepada konsumen",
  ],
  // Controls: existing assignments must not move.
  ["salah_penggunaan_sistem", "Agent salah mengisi kolom pada APPK", null],
  ["kurang_menggali", "Agent tidak melakukan probing lanjutan", null],
  ["salah_jawaban", "Agent salah memilih kategori produk", null],
  ["lainnya", "Agent kurang ramah saat menutup panggilan", null],
];
const expectedCounts = {
  hold_waktu_tunggu: 4,
  salah_penggunaan_sistem: 1,
  kurang_menggali: 1,
  salah_jawaban: 1,
  lainnya: 1,
};
const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
const countsOf = (
  clusters: Array<{ clusterId: string; findingsCount: number }>,
) => Object.fromEntries(clusters.map((c) => [c.clusterId, c.findingsCount]));

async function request(path: string, token: string, body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
  year = Number(
    runSql(
      fixture.env,
      `SELECT year FROM qa_periods WHERE id=${quoted(periodId)};`,
    ),
  );
  const rows = findings
    .map(
      ([, ketidaksesuaian, sebaiknya], i) =>
        `(${quoted(agentId)},${quoted(periodId)},${quoted(indicatorId)},'call',${quoted(`HOLD-${namespace}-${i}`)},false,2,${quoted(ketidaksesuaian)},${sebaiknya === null ? "NULL" : quoted(sebaiknya)},${year})`,
    )
    .join(",");
  runSql(
    fixture.env,
    `BEGIN;
    INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES (${quoted(indicatorId)},'call',${quoted(`Etika Bertelepon ${namespace}`)},'non_critical',1);
    INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,sebaiknya,tahun) VALUES ${rows};
    COMMIT;`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    fixture.env,
    `BEGIN;
    DELETE FROM tna_needs WHERE indicator_id=${quoted(indicatorId)};
    DELETE FROM qa_temuan WHERE indicator_id=${quoted(indicatorId)};
    DELETE FROM qa_indicators WHERE id=${quoted(indicatorId)};
    COMMIT;`,
  );
  await fixture.cleanup();
});

test("SIDAK agent detail maps HOLD findings to hold_waktu_tunggu and keeps other clusters", async () => {
  const response = await request(
    `/sidak/agents/${agentId}?year=${year}&service_type=call`,
    users.admin.token,
  );
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(countsOf(data.rootCauses)).toEqual(expectedCounts);
  const hold = data.rootCauses.find(
    (c: { clusterId: string }) => c.clusterId === "hold_waktu_tunggu",
  );
  expect(hold).toMatchObject({
    label: "Durasi hold/waktu tunggu melebihi standar",
    affectedTickets: 4,
  });
  expect(hold.matchedKeywords).toEqual(
    expect.arrayContaining(["melakukan hold", "hold pertama", "dead air"]),
  );
});

test("TNA drill-down suggests hold_waktu_tunggu and accepts it as the validated cause", async () => {
  const query = `service_type=call&period_id=${periodId}&indicator_id=${indicatorId}&compare_count=1`;
  const detail = await request(
    `/tna/parameters/detail?${query}`,
    users.trainer.token,
  );
  expect(detail.status).toBe(200);
  const { data } = await detail.json();
  expect(countsOf(data.clusters)).toEqual(expectedCounts);
  expect(data.clusters[0].clusterId).toBe("hold_waktu_tunggu");

  const created = await request("/tna/needs", users.trainer.token, {
    service_type: "call",
    period_id: periodId,
    indicator_id: indicatorId,
    compare_count: 1,
    validated_cluster_id: "hold_waktu_tunggu",
    cause_note: "Trainer memvalidasi durasi HOLD pertama melebihi 60 detik.",
    gap_type: "skill",
    outcome: "training",
  });
  expect(created.status).toBe(201);
  const need = (await created.json()).data;
  expect(need.suggested_cluster_id).toBe("hold_waktu_tunggu");
  expect(
    runSql(
      fixture.env,
      `SELECT suggested_cluster_id || ',' || validated_cluster_id FROM tna_needs WHERE id=${quoted(need.id)};`,
    ),
  ).toBe("hold_waktu_tunggu,hold_waktu_tunggu");
});
