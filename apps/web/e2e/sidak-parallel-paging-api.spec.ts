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
 * Bacaan `qa_temuan` setahun penuh — backend NYATA in-process + Supabase lokal.
 *
 * Kontrak (`plans/markdown/sidak-parallel-paging.md`):
 * - `/home/attention`, `/sidak/agents`, `/sidak/dashboard`, dan
 *   `/sidak/dashboard/trend` menjaga lebih dari satu request PostgREST
 *   `qa_temuan` berjalan bersamaan (bukan halaman satu per satu);
 * - hasil tetap lengkap: baris sesudah halaman ketiga ikut, total sama dengan
 *   oracle SQL;
 * - dashboard membaca `qa_temuan` tanpa embed `profiler_peserta`; filter tim
 *   tetap mempersempit hasil sama persis;
 * - forecast `cacheOnly`: `missing` → refresh → `hit` → `stale` setelah data
 *   berubah, dan pencarian snapshot berjalan bersamaan dengan bacaan temuan.
 *
 * Fixture memakai tahun 2097 (2.705 baris, lebih dari dua halaman 1.000) supaya
 * oracle hanya berisi data run ini, lalu dibersihkan di `afterAll`. Jumlah
 * request yang sedang berjalan dihitung di batas jaringan Supabase.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2097;
const AGENTS = 30;
const TICKETS = 9;
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

const inFlight = { current: 0, max: 0 };
/** Request PostgREST yang dicatat sejak `get`/`post` terakhir. */
const requestLog: { url: string; start: number; end: number }[] = [];

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
const created = {
  folderName: `e2e-sidak-paging-${ns}`,
  folderId: null as string | null,
  /** Tim kedua: hanya agen ekor, supaya filter tim benar-benar mempersempit. */
  otherFolderName: `e2e-sidak-paging-b-${ns}`,
  otherFolderId: null as string | null,
  yearId: null as string | null,
  yearCreated: false,
  pesertaIds: [] as string[],
  tailPesertaId: null as string | null,
  periodIds: [] as string[],
  periodsCreated: [] as string[],
};

async function call(path: string, init: { method: string; body?: unknown }) {
  inFlight.current = 0;
  inFlight.max = 0;
  requestLog.length = 0;
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.success).toBe(true);
  return body.data;
}

const get = (path: string) => call(path, { method: "GET" });

function countableOracle(folderName?: string): number {
  const folderFilter = folderName
    ? ` AND peserta_id IN (SELECT id FROM profiler_peserta WHERE batch_name=${quoted(folderName)})`
    : "";
  return Number(
    runSql(
      env,
      `SELECT count(*) FROM qa_temuan WHERE tahun=${YEAR} AND NOT is_phantom_padding AND nilai < 3${folderFilter};`,
    ),
  );
}

/** Ada request `a` yang mulai sebelum request `b` terakhir selesai. */
function startsBeforeLastEnds(a: string, b: string): boolean {
  const starts = requestLog
    .filter((r) => r.url.includes(a))
    .map((r) => r.start);
  const ends = requestLog.filter((r) => r.url.includes(b)).map((r) => r.end);
  expect(starts.length).toBeGreaterThan(0);
  expect(ends.length).toBeGreaterThan(0);
  return Math.min(...starts) < Math.max(...ends);
}

type ForecastLookup = {
  status: "fresh" | "stale" | "missing";
  snapshot: { cache: { status: string } } | null;
};

const forecast = (options: { cacheOnly?: boolean; forceRefresh?: boolean }) =>
  call("/sidak/dashboard/forecast", {
    method: "POST",
    body: {
      filters: { year: YEAR, serviceType: "chat" },
      horizonMonths: 3,
      cacheOnly: options.cacheOnly ?? false,
      forceRefresh: options.forceRefresh ?? false,
    },
  }) as Promise<ForecastLookup>;

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
    const tracked = url.includes("/rest/v1/qa_temuan");
    if (tracked) {
      inFlight.current += 1;
      inFlight.max = Math.max(inFlight.max, inFlight.current);
    }
    const entry = url.includes("/rest/v1/")
      ? { url: decodeURIComponent(url), start: performance.now(), end: 0 }
      : null;
    try {
      return await guarded(input, init);
    } finally {
      if (tracked) inFlight.current -= 1;
      if (entry) {
        entry.end = performance.now();
        requestLog.push(entry);
      }
    }
  }) as typeof fetch;

  trainer = await createUserWithJwt(env, "trainer", `paging-${ns}`);

  if (
    runSql(env, `SELECT count(*) FROM qa_temuan WHERE tahun=${YEAR};`) !== "0"
  )
    throw new Error(`Tahun fixture ${YEAR} harus kosong di Supabase lokal.`);

  for (const month of [1, 2]) {
    const existing = runSql(
      env,
      `SELECT id FROM qa_periods WHERE year=${YEAR} AND month=${month};`,
    );
    const id =
      existing ||
      sqlOne(
        env,
        `INSERT INTO qa_periods (month, year) VALUES (${month}, ${YEAR}) RETURNING id;`,
      );
    created.periodIds.push(id);
    if (!existing) created.periodsCreated.push(id);
  }

  created.yearId = runSql(
    env,
    `SELECT id FROM profiler_years WHERE year=${YEAR};`,
  );
  if (!created.yearId) {
    created.yearId = sqlOne(
      env,
      `INSERT INTO profiler_years (year, label) VALUES (${YEAR}, 'E2E ${YEAR}') RETURNING id;`,
    );
    created.yearCreated = true;
  }
  created.folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES (${quoted(created.folderName)}, ${quoted(created.yearId)}) RETURNING id;`,
  );
  created.otherFolderId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES (${quoted(created.otherFolderName)}, ${quoted(created.yearId)}) RETURNING id;`,
  );

  for (let index = 0; index < AGENTS; index += 1)
    created.pesertaIds.push(
      sqlOne(
        env,
        `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
         VALUES (${quoted(created.folderName)}, ${quoted(`Agen Paging ${String(index).padStart(2, "0")} ${ns}`)}, 'Tim Uji', 'Agent', ${index + 1})
         RETURNING id;`,
      ),
    );
  created.tailPesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(created.otherFolderName)}, ${quoted(`Agen Paging Ekor ${ns}`)}, 'Tim Uji', 'Agent', ${AGENTS + 1})
     RETURNING id;`,
  );

  const indicatorCount = Number(
    runSql(
      env,
      `SELECT count(*) FROM qa_indicators WHERE service_type='chat' AND is_active;`,
    ),
  );
  if (indicatorCount === 0)
    throw new Error("Butuh ≥1 indikator chat aktif di Supabase lokal.");

  const periodList = created.periodIds.map(quoted).join(",");
  // Nilai 0..3 bergantian per tiket: sebagian temuan countable, sebagian tidak.
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun)
     SELECT p.id, per.id, i.id, 'chat', ${quoted(`e2e-paging-${ns}-`)} || p.nomor_urut || '-' || per.month || '-' || t, false, t % 4, NULL, ${YEAR}
     FROM profiler_peserta p
     CROSS JOIN (SELECT id, month FROM qa_periods WHERE id IN (${periodList})) per
     CROSS JOIN (SELECT id FROM qa_indicators WHERE service_type='chat' AND is_active) i
     CROSS JOIN generate_series(1, ${TICKETS}) t
     WHERE p.id IN (${created.pesertaIds.map(quoted).join(",")});`,
  );
  // Agen "ekor": baris tertua, jadi berada di halaman terakhir urutan
  // `created_at desc` direktori agen.
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun, created_at)
     SELECT ${quoted(created.tailPesertaId)}, ${quoted(created.periodIds[1]!)}, i.id, 'chat', ${quoted(`e2e-paging-${ns}-ekor`)}, false, 0, NULL, ${YEAR}, now() - interval '1 day'
     FROM qa_indicators i WHERE i.service_type='chat' AND i.is_active;`,
  );
  const total = Number(
    runSql(env, `SELECT count(*) FROM qa_temuan WHERE tahun=${YEAR};`),
  );
  expect(total).toBe(AGENTS * 2 * indicatorCount * TICKETS + indicatorCount);
  expect(total).toBeGreaterThan(2000);

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (trainer)
    runSql(
      env,
      `DELETE FROM sidak_dashboard_forecast_snapshots WHERE generated_by=${quoted(trainer.userId)};`,
    );
  const ids = [...created.pesertaIds, created.tailPesertaId].filter(
    (id): id is string => Boolean(id),
  );
  if (ids.length)
    runSql(
      env,
      `DELETE FROM qa_temuan WHERE peserta_id IN (${ids.map(quoted).join(",")});
       DELETE FROM profiler_peserta WHERE id IN (${ids.map(quoted).join(",")});`,
    );
  for (const folderId of [created.folderId, created.otherFolderId])
    if (folderId)
      runSql(env, `DELETE FROM profiler_folders WHERE id=${quoted(folderId)};`);
  if (created.yearCreated && created.yearId)
    runSql(
      env,
      `DELETE FROM profiler_years WHERE id=${quoted(created.yearId)};`,
    );
  if (created.periodsCreated.length)
    runSql(
      env,
      `DELETE FROM qa_periods WHERE id IN (${created.periodsCreated.map(quoted).join(",")});`,
    );
  if (trainer) {
    const { error } = await createAdmin(env).auth.admin.deleteUser(
      trainer.userId,
    );
    expect(error).toBeNull();
  }
});

test("direktori agen: halaman paralel dan agen di halaman terakhir tetap dinilai", async () => {
  const data = await get(`/sidak/agents?year=${YEAR}`);
  expect(inFlight.max).toBeGreaterThan(1);

  const byId = new Map(
    (data.agents as { id: string; avgScore: number | null }[]).map((a) => [
      a.id,
      a,
    ]),
  );
  // Skor null berarti baris agen tidak terbaca; agen ekor hanya punya baris
  // di halaman terakhir.
  for (const id of [...created.pesertaIds, created.tailPesertaId!]) {
    expect(byId.get(id)?.avgScore ?? null).not.toBeNull();
  }
});

test("dashboard SIDAK: halaman paralel dan total temuan sama dengan oracle", async () => {
  const data = await get(
    `/sidak/dashboard?year=${YEAR}&service_type=chat&startMonth=1&endMonth=2`,
  );
  expect(inFlight.max).toBeGreaterThan(1);
  expect(data.summary.totalDefects).toBe(countableOracle());
});

test("tren dashboard: halaman paralel dan total temuan sama dengan oracle", async () => {
  const data = await get(
    `/sidak/dashboard/trend?year=${YEAR}&startMonth=1&endMonth=2&service_type=chat`,
  );
  expect(inFlight.max).toBeGreaterThan(1);
  expect(data.totalSummary.totalDefects).toBe(countableOracle());
  expect(data.totalSummary.auditedAgents).toBe(AGENTS + 1);
});

test("Beranda perlu tindakan: halaman paralel, tidak partial", async () => {
  const data = await get("/home/attention");
  expect(inFlight.max).toBeGreaterThan(1);
  expect(data.partial).toBe(false);
});

test("dashboard SIDAK: tanpa embed peserta, filter tim tetap sama dengan oracle", async () => {
  const all = await get(`/sidak/dashboard?year=${YEAR}&service_type=chat`);
  const temuanUrls = requestLog
    .filter((r) => r.url.includes("/rest/v1/qa_temuan"))
    .map((r) => r.url);
  expect(temuanUrls.length).toBeGreaterThan(0);
  for (const url of temuanUrls) expect(url).not.toContain("profiler_peserta");
  expect(all.summary.totalDefects).toBe(countableOracle());

  const team = await get(
    `/sidak/dashboard?year=${YEAR}&service_type=chat&folder_ids=${created.folderId}`,
  );
  expect(team.summary.totalDefects).toBe(countableOracle(created.folderName));
  expect(team.summary.totalDefects).toBeLessThan(all.summary.totalDefects);
  expect(
    team.topAgents.map((a: { agentId: string }) => a.agentId),
  ).not.toContain(created.tailPesertaId);

  const other = await get(
    `/sidak/dashboard?year=${YEAR}&service_type=chat&folder_ids=${created.otherFolderId}`,
  );
  expect(other.summary.totalDefects).toBe(
    countableOracle(created.otherFolderName),
  );
});

test("forecast cacheOnly: missing → hit → stale, snapshot dicari bersamaan dengan temuan", async () => {
  const missing = await forecast({ cacheOnly: true });
  expect(missing).toEqual({ status: "missing", snapshot: null });
  expect(
    startsBeforeLastEnds(
      "sidak_dashboard_forecast_snapshots",
      "/rest/v1/qa_temuan",
    ),
  ).toBe(true);

  const refreshed = await forecast({ forceRefresh: true });
  expect(refreshed.status).toBe("fresh");
  expect(refreshed.snapshot?.cache.status).toBe("refreshed");

  const snapshotCount = () =>
    runSql(
      env,
      `SELECT count(*) FROM sidak_dashboard_forecast_snapshots WHERE generated_by=${quoted(trainer.userId)};`,
    );
  expect(snapshotCount()).toBe("1");

  const hit = await forecast({ cacheOnly: true });
  expect(hit.status).toBe("fresh");
  expect(hit.snapshot?.cache.status).toBe("hit");
  // Cache hit membaca snapshot yang ada, tidak menulis snapshot baru.
  expect(snapshotCount()).toBe("1");
  expect(
    startsBeforeLastEnds(
      "sidak_dashboard_forecast_snapshots",
      "/rest/v1/qa_temuan",
    ),
  ).toBe(true);

  // Satu temuan baru mengubah data historis: snapshot lama jadi usang.
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun)
     SELECT ${quoted(created.pesertaIds[0]!)}, ${quoted(created.periodIds[1]!)}, id, 'chat', ${quoted(`e2e-paging-${ns}-baru`)}, false, 0, NULL, ${YEAR}
     FROM qa_indicators WHERE service_type='chat' AND is_active LIMIT 1;`,
  );
  expect(await forecast({ cacheOnly: true })).toEqual({
    status: "stale",
    snapshot: null,
  });
});
