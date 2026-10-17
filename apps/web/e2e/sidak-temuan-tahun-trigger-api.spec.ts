import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { readLoopbackEnv, runSql, sqlOne } from "./helpers/sidakRealBackend";

/**
 * Trigger `trg_fill_tahun` pada `qa_temuan` — paritas dengan prod.
 * Supabase lokal disposable, tanpa API: kontraknya ada di database.
 *
 * Prod punya trigger BEFORE INSERT yang mengisi `tahun` dari
 * `qa_periods.year` bila `tahun` kosong; repo tidak pernah membuatnya
 * (`docs/rebuild-logs/phase-37-database-legacy-parity-audit.md`). Tanpa
 * trigger, insert yang tidak menulis `tahun` tidak terlihat di agent detail,
 * ranking, tren, forecast, dan laporan yang memfilter `qa_temuan.tahun`.
 *
 * Kontrak:
 * - insert tanpa `tahun` mendapat tahun periode;
 * - `tahun` yang ditulis eksplisit tidak ditimpa;
 * - fungsi trigger memakai `search_path` kosong (hardening, beda dari prod).
 *
 * Fixture memakai tahun 2097 dan dibersihkan di `afterAll`.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2097;
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

const created = {
  periodId: null as string | null,
  folderName: `e2e-tahun-${ns}`,
  folderId: null as string | null,
  pesertaId: null as string | null,
  indicatorId: "",
};

function insertTemuan(tahun: number | null): string {
  const tahunColumn = tahun === null ? "" : ", tahun";
  const tahunValue = tahun === null ? "" : `, ${tahun}`;
  return sqlOne(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, nilai, no_tiket${tahunColumn})
     VALUES (${quoted(created.pesertaId!)}, ${quoted(created.periodId!)}, ${quoted(created.indicatorId)}, 'call', 0, ${quoted(`E2E-${ns}-${tahun ?? "auto"}`)}${tahunValue})
     RETURNING coalesce(tahun::text, 'NULL');`,
  );
}

test.beforeAll(() => {
  created.indicatorId = sqlOne(
    env,
    `SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, name LIMIT 1;`,
  );
  if (runSql(env, `SELECT id FROM qa_periods WHERE year=${YEAR} AND month=1;`))
    throw new Error(`Periode 1/${YEAR} sudah ada.`);
  created.periodId = sqlOne(
    env,
    `INSERT INTO qa_periods (month, year) VALUES (1, ${YEAR}) RETURNING id;`,
  );
  created.folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name) VALUES (${quoted(created.folderName)}) RETURNING id;`,
  );
  created.pesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(created.folderName)}, ${quoted(`Agen Tahun ${ns}`)}, 'Tim Uji', 'Agent', 1)
     RETURNING id;`,
  );
});

test.afterAll(() => {
  if (created.pesertaId)
    runSql(
      env,
      `DELETE FROM qa_temuan WHERE peserta_id=${quoted(created.pesertaId)};
       DELETE FROM profiler_peserta WHERE id=${quoted(created.pesertaId)};`,
    );
  if (created.folderId)
    runSql(
      env,
      `DELETE FROM profiler_folders WHERE id=${quoted(created.folderId)};`,
    );
  if (created.periodId)
    runSql(env, `DELETE FROM qa_periods WHERE id=${quoted(created.periodId)};`);
});

test("insert tanpa tahun mendapat tahun periode", () => {
  expect(insertTemuan(null)).toBe(String(YEAR));
});

test("tahun eksplisit tidak ditimpa", () => {
  expect(insertTemuan(2001)).toBe("2001");
});

test("fungsi trigger memakai search_path kosong", () => {
  const config = sqlOne(
    env,
    `SELECT coalesce(array_to_string(proconfig, ','), '<none>')
     FROM pg_proc WHERE oid = 'public.fill_tahun_from_period()'::regprocedure;`,
  );
  expect(config).toBe('search_path=""');
});
