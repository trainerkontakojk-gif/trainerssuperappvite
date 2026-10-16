import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import { runSql } from "./helpers/sidakRealBackend";

/**
 * Call communication findings (listening, word choice, voice, greeting) must
 * land in `komunikasi_layanan` through their indicator name in both consumers
 * of deriveAgentRootCauses — SIDAK agent detail and TNA drill-down. Call
 * near-misses map to existing clusters through audit-backed text phrases.
 * The new cluster loses every tie, is scoped to Call, and indicator names of
 * existing clusters (Pencatatan, Keakuratan) are not keywords.
 * Local loopback Supabase only (tnaFixture guards the endpoints).
 */
test.describe.configure({ mode: "serial" });
const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const agents = {
  mapped: fixture.ids.participants[3]!,
  controls: fixture.ids.participants[4]!,
};
const periodId = fixture.ids.extraPeriods[0]!;
// Production names: the communication ones carry the cluster's keywords.
const indicators = {
  menyimak: { service: "call", name: "Kemampuan Menyimak" },
  pilihanKata: { service: "call", name: "Pilihan Kata & Tata Bahasa" },
  suara: {
    service: "call",
    name: "Kualitas Suara, Artikulasi dan Kecepatan Berbicara",
  },
  salam: { service: "call", name: "Salam Pembuka" },
  pencatatan: {
    service: "call",
    name: "Kemampuan Pencatatan - Kesesuaian Informasi Kontak",
  },
  keakuratan: { service: "call", name: "Keakuratan Solusi / Informasi" },
  bertanya: { service: "call", name: "Kemampuan Bertanya dan Menganalisa" },
  etika: { service: "call", name: "Etika Bertelepon" },
  // Chat has its own etiquette indicators; the Call-scoped cluster skips them.
  chatSalam: { service: "chat", name: "Salam Pembuka" },
} as const;
type IndicatorKey = keyof typeof indicators;
const indicatorIds = Object.fromEntries(
  Object.keys(indicators).map((key) => [key, randomUUID()]),
) as Record<IndicatorKey, string>;
let app: Hono;
let users: Awaited<ReturnType<typeof fixture.seed>>;
let year: number;

// Spec-owned `call` rows are the only Call findings of these two agents
// (tnaFixture seeds only chat), so each response sees exactly its rows below.
const findings: Array<
  [
    agent: keyof typeof agents,
    indicator: IndicatorKey,
    cluster: string,
    ketidaksesuaian: string,
  ]
> = [
  // "menit" is a transcript timestamp; only the indicator name matches.
  [
    "mapped",
    "menyimak",
    "komunikasi_layanan",
    "Agent memotong pembicaraan konsumen pada menit 03.53.",
  ],
  [
    "mapped",
    "pilihanKata",
    "komunikasi_layanan",
    "Agent mengucapkan kalimat yang tidak baku pada menit 00.12.",
  ],
  [
    "mapped",
    "suara",
    "komunikasi_layanan",
    "Suara agent terdengar datar dan kurang bersemangat.",
  ],
  [
    "mapped",
    "salam",
    "komunikasi_layanan",
    "Agent kurang lengkap dalam mengucapkan salam pembuka.",
  ],
  // Near-miss expansions.
  [
    "mapped",
    "pencatatan",
    "kurang_teliti_verifikasi_data",
    "Agent tidak sesuai dalam mencatat kota domisili konsumen.",
  ],
  [
    "mapped",
    "keakuratan",
    "salah_jawaban",
    "Agent tidak tepat dalam menjawab pertanyaan konsumen terkait pembaruan data SLIK.",
  ],
  [
    "mapped",
    "bertanya",
    "kurang_menggali",
    "Agent melakukan probing yang tidak diperlukan pada detik 00.10.",
  ],
  [
    "mapped",
    "etika",
    "hold_waktu_tunggu",
    "Agent tidak lengkap dalam mengucapkan kalimat permohonan izin HOLD.",
  ],
  // Controls: a 1-1 tie keeps the existing cluster.
  [
    "controls",
    "menyimak",
    "kurang_menggali",
    "Agent tidak menanyakan nama PUJK kepada konsumen.",
  ],
  [
    "controls",
    "menyimak",
    "salah_penggunaan_sistem",
    "Agent salah mengisi kolom pada APPK.",
  ],
  // Indicator names of existing clusters are not keywords.
  [
    "controls",
    "pencatatan",
    "lainnya",
    "Pencatatan pada kolom Deskripsi terlalu umum.",
  ],
  [
    "controls",
    "keakuratan",
    "lainnya",
    "Agent kurang lengkap memberikan informasi alamat Kantor OJK.",
  ],
  [
    "controls",
    "chatSalam",
    "lainnya",
    "Agent tidak menyampaikan salam pembuka sesuai standar.",
  ],
];
const expectedMappedCounts = {
  komunikasi_layanan: 4,
  kurang_teliti_verifikasi_data: 1,
  salah_jawaban: 1,
  kurang_menggali: 1,
  hold_waktu_tunggu: 1,
};
const expectedControlCounts = {
  kurang_menggali: 1,
  salah_penggunaan_sistem: 1,
  lainnya: 2,
};
const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
const countsOf = (
  clusters: Array<{ clusterId: string; findingsCount: number }>,
) => Object.fromEntries(clusters.map((c) => [c.clusterId, c.findingsCount]));
const idList = Object.values(indicatorIds).map(quoted).join(",");

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

async function agentClusters(agent: keyof typeof agents) {
  const response = await request(
    `/sidak/agents/${agents[agent]}?year=${year}&service_type=call`,
    users.admin.token,
  );
  expect(response.status).toBe(200);
  return (await response.json()).data.rootCauses;
}

async function parameterClusters(indicator: IndicatorKey) {
  const { service } = indicators[indicator];
  const query = `service_type=${service}&period_id=${periodId}&indicator_id=${indicatorIds[indicator]}&compare_count=1`;
  const response = await request(
    `/tna/parameters/detail?${query}`,
    users.trainer.token,
  );
  expect(response.status).toBe(200);
  return countsOf((await response.json()).data.clusters);
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
  const indicatorRows = (Object.keys(indicators) as IndicatorKey[])
    .map(
      (key) =>
        `(${quoted(indicatorIds[key])},${quoted(indicators[key].service)},${quoted(`${indicators[key].name} ${namespace}`)},'non_critical',1)`,
    )
    .join(",");
  const rows = findings
    .map(
      ([agent, indicator, , ketidaksesuaian], i) =>
        `(${quoted(agents[agent])},${quoted(periodId)},${quoted(indicatorIds[indicator])},${quoted(indicators[indicator].service)},${quoted(`KOM-${namespace}-${i}`)},false,2,${quoted(ketidaksesuaian)},NULL,${year})`,
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
    DELETE FROM tna_needs WHERE indicator_id IN (${idList});
    DELETE FROM qa_temuan WHERE indicator_id IN (${idList});
    DELETE FROM qa_indicators WHERE id IN (${idList});
    COMMIT;`,
  );
  await fixture.cleanup();
});

test("SIDAK agent detail maps Call communication findings to komunikasi_layanan and near-misses to existing clusters", async () => {
  const rootCauses = await agentClusters("mapped");
  expect(countsOf(rootCauses)).toEqual(expectedMappedCounts);
  const komunikasi = rootCauses.find(
    (c: { clusterId: string }) => c.clusterId === "komunikasi_layanan",
  );
  expect(komunikasi).toMatchObject({
    label: "Komunikasi & etika layanan telepon kurang optimal",
    priority: 4,
    affectedTickets: 4,
  });
  expect(komunikasi.matchedKeywords).toEqual(
    expect.arrayContaining([
      "kemampuan menyimak",
      "pilihan kata",
      "kualitas suara",
      "salam pembuka",
    ]),
  );
});

test("Ties, existing-cluster indicator names and chat rows stay out of komunikasi_layanan", async () => {
  expect(countsOf(await agentClusters("controls"))).toEqual(
    expectedControlCounts,
  );
  expect(await parameterClusters("chatSalam")).toEqual({ lainnya: 1 });
});

test("TNA drill-down suggests komunikasi_layanan per Call parameter and accepts it as the validated cause", async () => {
  expect(await parameterClusters("suara")).toEqual({ komunikasi_layanan: 1 });
  expect(await parameterClusters("menyimak")).toEqual({
    komunikasi_layanan: 1,
    kurang_menggali: 1,
    salah_penggunaan_sistem: 1,
  });

  const created = await request("/tna/needs", users.trainer.token, {
    service_type: "call",
    period_id: periodId,
    indicator_id: indicatorIds.suara,
    compare_count: 1,
    validated_cluster_id: "komunikasi_layanan",
    cause_note: "Trainer memvalidasi intonasi agent datar sepanjang layanan.",
    gap_type: "skill",
    outcome: "training",
  });
  expect(created.status).toBe(201);
  const need = (await created.json()).data;
  expect(need.suggested_cluster_id).toBe("komunikasi_layanan");
  expect(
    runSql(
      fixture.env,
      `SELECT suggested_cluster_id || ',' || validated_cluster_id FROM tna_needs WHERE id=${quoted(need.id)};`,
    ),
  ).toBe("komunikasi_layanan,komunikasi_layanan");
});
