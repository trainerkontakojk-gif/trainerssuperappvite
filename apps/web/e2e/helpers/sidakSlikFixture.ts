/**
 * Fixture SLIK mandiri untuk spec SIDAK real-backend.
 *
 * Spec yang memanggil route batch temuan butuh versi aturan `slik` published
 * yang memetakan master `qa_indicators`. Fixture ini membuat semuanya sendiri di
 * database lokal disposable — tanpa `scratch/sidak-local-db/seed-slik-baseline.sh`:
 *   - satu `qa_periods` di slot (month, year) yang masih kosong,
 *   - N master `qa_indicators` SLIK aktif dengan nama ber-namespace,
 *   - satu versi aturan published di periode itu, dengan snapshot yang
 *     memetakan setiap master.
 *
 * Slot dicari dari tahun 2100 ke bawah: versi published hanya berlaku untuk
 * periode di atau setelah periode efektifnya, jadi tahun paling akhir tidak menggeser
 * versi efektif data lain. Cleanup hanya menghapus baris milik fixture ini.
 */
import { randomUUID } from "node:crypto";

export type SlikFixtureIndicator = {
  id: string;
  service_type: "slik";
  name: string;
  parameter_group: string | null;
  category: "critical" | "non_critical";
  bobot: number;
  is_active: true;
};

export type SlikRuleFixture = {
  namespace: string;
  periodId: string;
  month: number;
  year: number;
  versionId: string;
  indicators: SlikFixtureIndicator[];
};

type RunSql = (query: string) => string;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function seedSlikRuleFixture(
  runSql: RunSql,
  options: { label: string; indicatorCount: number },
): SlikRuleFixture {
  const namespace = `${options.label}-${randomUUID()}`;
  const slot = runSql(
    `SELECT m || '|' || y FROM generate_series(2100, 2000, -1) AS y,
       generate_series(1, 12) AS m
     WHERE NOT EXISTS (SELECT 1 FROM public.qa_periods p WHERE p.year = y AND p.month = m)
     ORDER BY y DESC, m LIMIT 1;`,
  ).trim();
  const [month, year] = slot.split("|").map(Number);
  if (!month || !year) throw new Error("Tidak ada slot qa_periods kosong");

  const periodId = randomUUID();
  const versionId = randomUUID();
  const indicators: SlikFixtureIndicator[] = Array.from(
    { length: options.indicatorCount },
    (_, i) => ({
      id: randomUUID(),
      service_type: "slik",
      name: `${namespace}-param-${i + 1}`,
      parameter_group: null,
      category: i === 0 ? "critical" : "non_critical",
      bobot: 1,
      is_active: true,
    }),
  );

  runSql(
    `BEGIN;
    INSERT INTO public.qa_periods (id, month, year) VALUES (${q(periodId)}, ${month}, ${year});
    INSERT INTO public.qa_indicators (id, service_type, name, category, bobot, sort_order, is_active) VALUES
      ${indicators.map((ind, i) => `(${q(ind.id)}, 'slik', ${q(ind.name)}, ${q(ind.category)}, ${ind.bobot}, ${i}, true)`).join(",\n      ")};
    INSERT INTO public.qa_service_rule_versions
      (id, service_type, effective_period_id, status, critical_weight, non_critical_weight, scoring_mode, version_number, published_at)
      VALUES (${q(versionId)}, 'slik', ${q(periodId)}, 'published', 0.5, 0.5, 'weighted', 1, now());
    INSERT INTO public.qa_service_rule_indicators
      (rule_version_id, legacy_indicator_id, service_type, name, category, bobot, sort_order) VALUES
      ${indicators.map((ind, i) => `(${q(versionId)}, ${q(ind.id)}, 'slik', ${q(ind.name)}, ${q(ind.category)}, ${ind.bobot}, ${i})`).join(",\n      ")};
    COMMIT;`,
  );

  return { namespace, periodId, month, year, versionId, indicators };
}

/**
 * Hapus baris milik fixture. Semua `qa_temuan` di periode fixture milik spec
 * pemanggil (periode dibuat khusus untuknya), jadi aman dihapus di sini sebelum
 * versi aturan (FK tanpa cascade) dan master indikator (FK RESTRICT).
 */
export function cleanupSlikRuleFixture(
  runSql: RunSql,
  fixture: SlikRuleFixture | undefined,
): void {
  if (!fixture) return;
  const indicatorIds = fixture.indicators.map((ind) => q(ind.id)).join(",");
  runSql(
    `BEGIN;
    DELETE FROM public.qa_temuan WHERE period_id = ${q(fixture.periodId)};
    DELETE FROM public.qa_service_rule_versions WHERE id = ${q(fixture.versionId)};
    DELETE FROM public.qa_indicators WHERE id IN (${indicatorIds});
    DELETE FROM public.qa_periods WHERE id = ${q(fixture.periodId)};
    COMMIT;`,
  );
}
