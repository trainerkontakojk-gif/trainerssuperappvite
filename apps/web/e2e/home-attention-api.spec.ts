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

/**
 * `GET /api/v1/home/attention` — backend NYATA in-process + Supabase lokal.
 *
 * Kontrak (rencana `plans/markdown/shell-beranda-redesign.md`, hasil E):
 * - item hanya untuk capability peran; agent menerima `items: []`;
 * - "agen di bawah target" memakai definisi direktori agen SIDAK dan scope
 *   leader yang sama (tidak bocor ke agen di luar timnya);
 * - permintaan akses leader dihitung dari sumber `/admin/leader-requests/pending`;
 * - satu sumber gagal → 200 dengan `partial: true`, item lain tetap ada.
 *
 * Tahap 3 `plans/markdown/dashboard-wsn.md` §7 menambah `worstAgents` pada item
 * `agents_below_target`: maksimal tiga agen berisiko dengan skor terendah
 * (seri diurutkan nama), hanya dari direktori yang sudah dibatasi scope.
 *
 * Fixture memakai nama unik per run dan dibersihkan di `afterAll`. Kegagalan
 * sumber disuntikkan di batas jaringan Supabase (fetch ke `qa_periods`), bukan
 * dengan mengubah kode produk.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Saklar fault injection: aktif → request PostgREST `qa_periods` gagal 503. */
let failQaPeriods = false;

function jakartaYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)!.value);
  return { year: get("year"), month: get("month") };
}

type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let trainer: Identity;
let leader: Identity;
let pendingLeader: Identity;
let agent: Identity;
const created = {
  pesertaIds: [] as string[],
  folderName: `e2e-home-attention-${ns}`,
  periodId: null as string | null,
  periodCreated: false,
  groupId: null as string | null,
  requestIds: [] as string[],
};

async function get(path: string, token: string) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

type DirectoryAgent = {
  id: string;
  nama: string;
  avgScore: number | null;
  atRisk: boolean;
};

type AttentionItem = {
  kind: string;
  count: number;
  scope: string;
  period?: unknown;
  worstAgents?: { agentId: string; nama: string; score: number }[];
};

async function attention(token: string) {
  const response = await get("/home/attention", token);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.data as {
    items: AttentionItem[];
    partial: boolean;
  };
}

/** Oracle: hitungan `atRisk` dari direktori agen untuk identitas yang sama. */
async function directoryAtRisk(token: string, year: number) {
  const response = await get(`/sidak/agents?year=${year}`, token);
  expect(response.status).toBe(200);
  const { data } = await response.json();
  return (data.agents as DirectoryAgent[]).filter((a) => a.atRisk);
}

/**
 * Oracle `worstAgents`: agen berisiko paling jauh dari target, maksimal
 * `max`, seri diurutkan nama seperti urutan direktori.
 */
function worstOf(atRisk: DirectoryAgent[], max = 3) {
  return atRisk
    .filter((agent) => agent.avgScore !== null)
    .sort(
      (a, b) => a.avgScore! - b.avgScore! || a.nama.localeCompare(b.nama, "id"),
    )
    .slice(0, max)
    .map((agent) => ({
      agentId: agent.id,
      nama: agent.nama,
      score: agent.avgScore!,
    }));
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
  // Dipasang SEBELUM app diimpor: klien Supabase menangkap `fetch` saat dibuat.
  const guarded = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    if (failQaPeriods && url.includes("/rest/v1/qa_periods")) {
      return new Response(JSON.stringify({ message: "injected outage" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return guarded(input, init);
  }) as typeof fetch;

  trainer = await createUserWithJwt(env, "trainer", `home-${ns}`);
  leader = await createUserWithJwt(env, "leader", `home-${ns}`);
  pendingLeader = await createUserWithJwt(env, "leader", `home-pending-${ns}`);
  agent = await createUserWithJwt(env, "agent", `home-${ns}`);

  const { year, month } = jakartaYearMonth();
  const indicatorIds = runSql(
    env,
    `SELECT id FROM qa_indicators WHERE service_type='chat' AND is_active ORDER BY sort_order, name;`,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (indicatorIds.length === 0)
    throw new Error("Butuh ≥1 indikator chat aktif di Supabase lokal.");

  // Periode tahun berjalan selain bulan ini, supaya status "periode bulan ini
  // belum dibuat" tidak berubah karena fixture.
  const existing = runSql(
    env,
    `SELECT id FROM qa_periods WHERE year=${year} AND month<>${month} ORDER BY month LIMIT 1;`,
  );
  if (existing) {
    created.periodId = existing;
  } else {
    const fixtureMonth = month === 1 ? 2 : 1;
    created.periodId = sqlOne(
      env,
      `INSERT INTO qa_periods (month, year) VALUES (${fixtureMonth}, ${year}) RETURNING id;`,
    );
    created.periodCreated = true;
  }

  const yearId = sqlOne(
    env,
    `WITH ins AS (INSERT INTO profiler_years (year, label) VALUES (${year}, 'E2E ${year}') ON CONFLICT (year) DO NOTHING RETURNING id)
     SELECT id FROM ins UNION ALL SELECT id FROM profiler_years WHERE year=${year} LIMIT 1;`,
  );
  runSql(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES (${quoted(created.folderName)}, ${quoted(yearId)});`,
  );
  for (const [index, name] of [
    "Agen Dalam Tim A",
    "Agen Dalam Tim B",
    "Agen Dalam Tim C",
    "Agen Dalam Tim D",
    "Agen Luar Tim",
  ].entries()) {
    const pesertaId = sqlOne(
      env,
      `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
       VALUES (${quoted(created.folderName)}, ${quoted(`${name} ${ns}`)}, 'Tim Uji', 'Agent', ${index + 1})
       RETURNING id;`,
    );
    created.pesertaIds.push(pesertaId);
    // Empat agen dalam scope berskor berbeda dan satu agen luar scope.
    // Urutan skor sengaja berbeda dari urutan nama agar sorting benar-benar diuji.
    const nilai = [2, 0, 1, 1, 0][index]!;
    const rows = indicatorIds
      .map(
        (indicatorId) =>
          `(${quoted(pesertaId)},${quoted(created.periodId!)},${quoted(indicatorId)},'chat',${quoted(`e2e-home-${ns}-${index}`)},false,${nilai},'E2E temuan',${year})`,
      )
      .join(",");
    runSql(
      env,
      `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun) VALUES ${rows};`,
    );
  }

  // Leader hanya punya scope SIDAK atas empat agen pertama (rantai produksi:
  // request approved → request_groups → access_group_items).
  created.groupId = sqlOne(
    env,
    `INSERT INTO access_groups (name, description, is_active) VALUES (${quoted(`e2e-home-${ns}`)}, 'e2e', true) RETURNING id;`,
  );
  for (const pesertaId of created.pesertaIds.slice(0, 4))
    runSql(
      env,
      `INSERT INTO access_group_items (access_group_id, field_name, field_value, is_active)
     VALUES (${quoted(created.groupId)}, 'peserta_id', ${quoted(pesertaId)}, true);`,
    );
  const approvedId = sqlOne(
    env,
    `INSERT INTO leader_access_requests (leader_user_id, module, status) VALUES (${quoted(leader.userId)}, 'sidak', 'approved') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO leader_access_request_groups (request_id, access_group_id) VALUES (${quoted(approvedId)}, ${quoted(created.groupId)});`,
  );
  const pendingId = sqlOne(
    env,
    `INSERT INTO leader_access_requests (leader_user_id, module, status) VALUES (${quoted(pendingLeader.userId)}, 'ktp', 'pending') RETURNING id;`,
  );
  created.requestIds.push(approvedId, pendingId);

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  failQaPeriods = false;
  const list = (ids: string[]) => ids.map(quoted).join(",") || "NULL";
  if (created.pesertaIds.length)
    runSql(
      env,
      `DELETE FROM qa_temuan WHERE peserta_id IN (${list(created.pesertaIds)});
       DELETE FROM profiler_peserta WHERE id IN (${list(created.pesertaIds)});`,
    );
  runSql(
    env,
    `DELETE FROM profiler_folders WHERE name=${quoted(created.folderName)};`,
  );
  if (created.requestIds.length)
    runSql(
      env,
      `DELETE FROM leader_access_request_groups WHERE request_id IN (${list(created.requestIds)});
       DELETE FROM leader_access_requests WHERE id IN (${list(created.requestIds)});`,
    );
  if (created.groupId)
    runSql(
      env,
      `DELETE FROM access_group_items WHERE access_group_id=${quoted(created.groupId)};
       DELETE FROM access_groups WHERE id=${quoted(created.groupId)};`,
    );
  if (created.periodCreated && created.periodId)
    runSql(env, `DELETE FROM qa_periods WHERE id=${quoted(created.periodId)};`);
  for (const user of [trainer, leader, pendingLeader, agent]) {
    if (!user) continue;
    const { error } = await createAdmin(env).auth.admin.deleteUser(user.userId);
    expect(error).toBeNull();
  }
});

test("tanpa token ditolak", async () => {
  const response = await tnaApiRequest(
    app,
    "http://localhost/api/v1/home/attention",
    { method: "GET", headers: {} },
  );
  expect(response.status).toBe(401);
});

test("agent: tidak ada item dan tidak partial", async () => {
  expect(await attention(agent.token)).toEqual({ items: [], partial: false });
});

test("trainer: item mengikuti sumber aslinya", async () => {
  const { year, month } = jakartaYearMonth();
  const data = await attention(trainer.token);
  expect(data.partial).toBe(false);
  const byKind = new Map(data.items.map((item) => [item.kind, item]));

  // Permintaan akses: sama dengan daftar pending admin, dan fixture terhitung.
  const pending = await get("/admin/leader-requests/pending", trainer.token);
  const pendingCount = (await pending.json()).data.length;
  expect(pendingCount).toBeGreaterThanOrEqual(1);
  expect(byKind.get("leader_access_pending")).toEqual({
    kind: "leader_access_pending",
    count: pendingCount,
    scope: "all",
  });

  // Agen di bawah target: definisi direktori agen, seluruh fixture ikut.
  const atRisk = await directoryAtRisk(trainer.token, year);
  expect(atRisk.map((a) => a.id)).toEqual(
    expect.arrayContaining(created.pesertaIds),
  );
  const expectedWorst = worstOf(atRisk);
  expect(byKind.get("agents_below_target")).toEqual({
    kind: "agents_below_target",
    count: atRisk.length,
    scope: "all",
    worstAgents: expectedWorst,
  });
  // Tiga agen terendah saja, urut skor naik, semuanya memang di bawah target.
  expect(expectedWorst).toHaveLength(Math.min(3, atRisk.length));
  const scores = expectedWorst.map((agent) => agent.score);
  expect(scores).toEqual([...scores].sort((a, b) => a - b));
  const atRiskIds = new Set(atRisk.map((a) => a.id));
  for (const agent of expectedWorst) {
    expect(atRiskIds.has(agent.agentId)).toBe(true);
  }

  // Periode bulan berjalan: ada item hanya bila periodenya belum dibuat.
  const hasCurrentPeriod =
    runSql(
      env,
      `SELECT 1 FROM qa_periods WHERE year=${year} AND month=${month};`,
    ) === "1";
  expect(byKind.get("qa_period_missing")).toEqual(
    hasCurrentPeriod
      ? undefined
      : {
          kind: "qa_period_missing",
          count: 1,
          scope: "all",
          period: { year, month },
        },
  );
  // Item berhitungan 0 tidak pernah dikirim.
  for (const item of data.items) expect(item.count).toBeGreaterThan(0);
});

test("leader: hanya agen di scope timnya, tanpa item admin/konfigurasi", async () => {
  const { year } = jakartaYearMonth();
  const data = await attention(leader.token);
  expect(data.partial).toBe(false);
  // Sama dengan direktori agen leader, yang hanya berisi agen dalam tim.
  const atRisk = await directoryAtRisk(leader.token, year);
  expect(atRisk.map((a) => a.id)).toHaveLength(4);
  expect(atRisk.map((a) => a.id)).toEqual(
    expect.arrayContaining(created.pesertaIds.slice(0, 4)),
  );
  expect(new Set(atRisk.map((a) => a.avgScore)).size).toBeGreaterThan(1);
  const expectedWorst = worstOf(atRisk);
  expect(data.items).toEqual([
    {
      kind: "agents_below_target",
      count: 4,
      scope: "team",
      worstAgents: expectedWorst,
    },
  ]);
  // Nama agen di luar tim leader tidak pernah keluar.
  expect(expectedWorst).toHaveLength(3);
  expect(data.items[0]!.worstAgents!.map((a) => a.agentId)).not.toContain(
    created.pesertaIds[4],
  );
  expect(data.items[0]!.worstAgents).toEqual(expectedWorst);
  expect(expectedWorst[0]!.agentId).toBe(created.pesertaIds[1]);
});

test("leader tanpa persetujuan: tidak ada item", async () => {
  expect(await attention(pendingLeader.token)).toEqual({
    items: [],
    partial: false,
  });
});

test("satu sumber gagal: 200, partial true, item lain tetap", async () => {
  failQaPeriods = true;
  try {
    const data = await attention(trainer.token);
    expect(data.partial).toBe(true);
    const kinds = data.items.map((item) => item.kind);
    expect(kinds).not.toContain("qa_period_missing");
    expect(kinds).toContain("leader_access_pending");
  } finally {
    failQaPeriods = false;
  }
});
