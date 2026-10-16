import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import { runSql } from "./helpers/sidakRealBackend";

/**
 * SLIK iDeb registration-process findings must land in the `proses_ideb_slik`
 * root-cause cluster in both consumers of deriveAgentRootCauses — SIDAK agent
 * detail and TNA drill-down. They match through the finding text or through
 * the iDeb indicator name. Findings under a neutral indicator keep their
 * existing clusters, and a Call-style "pada menit 03.53" timestamp stays in
 * `lainnya`. The cluster is scoped to SLIK: a Call agent explaining or probing
 * the consumer's own "iDeb SLIK" keeps the cluster its other keywords give it.
 * Local loopback Supabase only (tnaFixture guards the endpoints).
 */
test.describe.configure({ mode: "serial" });
const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const agentId = fixture.ids.participants[2]!;
const periodId = fixture.ids.extraPeriods[0]!;
const indicators = {
  // Production name: carries "alasan penolakan", "permohonan ideb", "ideb slik".
  penolakan: {
    id: randomUUID(),
    service: "slik",
    name: `Kesesuaian dan kelengkapan pengiriman alasan penolakan permohonan iDeb SLIK ${namespace}`,
  },
  // Production name without any iDeb keyword: the text must carry the match.
  foto: {
    id: randomUUID(),
    service: "slik",
    name: `Kesesuaian Foto ${namespace}`,
  },
  neutral: {
    id: randomUUID(),
    service: "slik",
    name: `Kesesuaian Data ${namespace}`,
  },
  // Production Call indicator; consumer-facing iDeb SLIK findings live here.
  // Not a komunikasi_layanan indicator name, so its rows keep testing scope.
  penjelasan: {
    id: randomUUID(),
    service: "call",
    name: `Keakuratan Solusi / Informasi ${namespace}`,
  },
};
type IndicatorKey = keyof typeof indicators;
let app: Hono;
let users: Awaited<ReturnType<typeof fixture.seed>>;
let year: number;

// One agent, one period. Spec-owned `slik` and `call` rows are the only
// findings of those services for this agent (tnaFixture seeds only chat), so
// each service-filtered response sees exactly its rows below.
const findings: Array<
  [
    indicator: IndicatorKey,
    cluster: string,
    ketidaksesuaian: string,
    sebaiknya: string | null,
  ]
> = [
  [
    "penolakan",
    "proses_ideb_slik",
    "Agent kurang lengkap dalam melampirkan alasan penolakan pada pendaftaran iDeb yang ditolak.",
    "Agent seharusnya sesuai dan lengkap dalam melampirkan alasan penolakan pada permohonan iDeb yang ditolak/gagal verifikasi.",
  ],
  // Matches only through the indicator name.
  [
    "penolakan",
    "proses_ideb_slik",
    "Penulisan “Tanggal Lahir Debitur” yang tertera pada formulir dan Identitas Asli berbeda;",
    null,
  ],
  // D2: matched kurang_teliti_verifikasi_data via "tidak melampirkan" before.
  [
    "penolakan",
    "proses_ideb_slik",
    "Agent tidak melampirkan keterangan pada pendaftaran iDeb yang ditolak.",
    null,
  ],
  [
    "foto",
    "proses_ideb_slik",
    'Agent tidak sesuai dalam memverifikasi foto yang dilampirkan pada "Foto Diri Mengikuti Gambar"',
    "Agent seharusnya sesuai dalam memverifikasi seluruh data dan dokumen yang dilampirkan oleh konsumen pada pendaftaran iDebku.",
  ],
  [
    "foto",
    "proses_ideb_slik",
    "Agent kurang lengkap dalam mengirimkan hasil iDeb milik konsumen.",
    null,
  ],
  // Controls: existing assignments must not move. rootCauses returns at most
  // five clusters, so APPK and probing controls are left to the HOLD spec.
  [
    "neutral",
    "hold_waktu_tunggu",
    "Agent melakukan HOLD pertama selama 01.04 menit",
    null,
  ],
  ["neutral", "salah_jawaban", "Agent salah memilih kategori produk", null],
  [
    "neutral",
    "kurang_teliti_verifikasi_data",
    "Agent tidak melampirkan bukti transfer pada tiket",
    null,
  ],
  // "menit" is a transcript timestamp, never a cluster keyword.
  [
    "neutral",
    "lainnya",
    "Agent memotong pembicaraan konsumen pada menit 03.53.",
    null,
  ],
  // Call: the consumer's own iDeb SLIK is not the back-office SOP.
  [
    "penjelasan",
    "lainnya",
    "Agent belum membantu konsumen membaca hasil iDeb SLIK miliknya dengan bahasa yang mudah dipahami.",
    null,
  ],
  [
    "penjelasan",
    "kurang_menggali",
    "Agent tidak melakukan probing lanjutan atas pinjaman yang tercantum dalam IDEB SLIK konsumen.",
    null,
  ],
];
const expectedCounts = {
  proses_ideb_slik: 5,
  hold_waktu_tunggu: 1,
  salah_jawaban: 1,
  kurang_teliti_verifikasi_data: 1,
  lainnya: 1,
};
const expectedCallCounts = { lainnya: 1, kurang_menggali: 1 };
const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
const countsOf = (
  clusters: Array<{ clusterId: string; findingsCount: number }>,
) => Object.fromEntries(clusters.map((c) => [c.clusterId, c.findingsCount]));
const indicatorIds = Object.values(indicators).map((i) => quoted(i.id));

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
  const indicatorRows = Object.values(indicators)
    .map(
      ({ id, service, name }) =>
        `(${quoted(id)},${quoted(service)},${quoted(name)},'non_critical',1)`,
    )
    .join(",");
  const rows = findings
    .map(
      ([indicator, , ketidaksesuaian, sebaiknya], i) =>
        `(${quoted(agentId)},${quoted(periodId)},${quoted(indicators[indicator].id)},${quoted(indicators[indicator].service)},${quoted(`SLIK-${namespace}-${i}`)},false,0,${quoted(ketidaksesuaian)},${sebaiknya === null ? "NULL" : quoted(sebaiknya)},${year})`,
    )
    .join(",");
  runSql(
    fixture.env,
    `BEGIN;
    INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES ${indicatorRows};
    INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,sebaiknya,tahun) VALUES ${rows};
    COMMIT;`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    fixture.env,
    `BEGIN;
    DELETE FROM tna_needs WHERE indicator_id IN (${indicatorIds.join(",")});
    DELETE FROM qa_temuan WHERE indicator_id IN (${indicatorIds.join(",")});
    DELETE FROM qa_indicators WHERE id IN (${indicatorIds.join(",")});
    COMMIT;`,
  );
  await fixture.cleanup();
});

test("SIDAK agent detail maps SLIK iDeb findings to proses_ideb_slik and keeps other clusters", async () => {
  const response = await request(
    `/sidak/agents/${agentId}?year=${year}&service_type=slik`,
    users.admin.token,
  );
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(countsOf(data.rootCauses)).toEqual(expectedCounts);
  const slik = data.rootCauses.find(
    (c: { clusterId: string }) => c.clusterId === "proses_ideb_slik",
  );
  expect(slik).toMatchObject({
    label: "Proses verifikasi/pengiriman iDeb SLIK tidak sesuai",
    affectedTickets: 5,
  });
  expect(slik.matchedKeywords).toEqual(
    expect.arrayContaining([
      "pendaftaran ideb",
      "hasil ideb",
      "foto diri mengikuti gambar",
      "alasan penolakan",
    ]),
  );
});

test("TNA drill-down suggests proses_ideb_slik per SLIK parameter and accepts it as the validated cause", async () => {
  const detailOf = async (indicatorId: string) => {
    const query = `service_type=slik&period_id=${periodId}&indicator_id=${indicatorId}&compare_count=1`;
    const detail = await request(
      `/tna/parameters/detail?${query}`,
      users.trainer.token,
    );
    expect(detail.status).toBe(200);
    return (await detail.json()).data;
  };
  expect(countsOf((await detailOf(indicators.penolakan.id)).clusters)).toEqual({
    proses_ideb_slik: 3,
  });
  expect(countsOf((await detailOf(indicators.foto.id)).clusters)).toEqual({
    proses_ideb_slik: 2,
  });

  const created = await request("/tna/needs", users.trainer.token, {
    service_type: "slik",
    period_id: periodId,
    indicator_id: indicators.penolakan.id,
    compare_count: 1,
    validated_cluster_id: "proses_ideb_slik",
    cause_note:
      "Trainer memvalidasi alasan penolakan pendaftaran iDeb tidak lengkap.",
    gap_type: "proses",
    outcome: "training",
  });
  expect(created.status).toBe(201);
  const need = (await created.json()).data;
  expect(need.suggested_cluster_id).toBe("proses_ideb_slik");
  expect(
    runSql(
      fixture.env,
      `SELECT suggested_cluster_id || ',' || validated_cluster_id FROM tna_needs WHERE id=${quoted(need.id)};`,
    ),
  ).toBe("proses_ideb_slik,proses_ideb_slik");
});

test("Call findings about the consumer's iDeb SLIK stay out of proses_ideb_slik", async () => {
  const response = await request(
    `/sidak/agents/${agentId}?year=${year}&service_type=call`,
    users.admin.token,
  );
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(countsOf(data.rootCauses)).toEqual(expectedCallCounts);

  const query = `service_type=call&period_id=${periodId}&indicator_id=${indicators.penjelasan.id}&compare_count=1`;
  const detail = await request(
    `/tna/parameters/detail?${query}`,
    users.trainer.token,
  );
  expect(detail.status).toBe(200);
  expect(countsOf((await detail.json()).data.clusters)).toEqual(
    expectedCallCounts,
  );
});
