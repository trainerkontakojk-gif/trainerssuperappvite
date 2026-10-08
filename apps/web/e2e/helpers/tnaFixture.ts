import { createHash, randomUUID } from "node:crypto";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql as executeSql,
  sqlOne,
} from "./sidakRealBackend";

type FixtureUser = Awaited<ReturnType<typeof createUserWithJwt>>;

/**
 * Synthetic SIDAK substrate for TNA E2E T1–T4. No production backup or remote
 * access. Use a fresh randomUUID namespace per serial spec. seed() is idempotent
 * within the handle; cleanup() is idempotent, can recover a interrupted seed,
 * and can be called from a new handle with the same namespace.
 *
 * Callers must clean their own dependent tna_* rows BEFORE cleanup(). This
 * helper never deletes unrelated rows or bypasses product immutable triggers.
 * JWT/password values are never persisted or logged.
 */
export function createTnaFixture(namespace: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      namespace,
    )
  ) {
    throw new Error("TNA fixture namespace must be a randomUUID");
  }
  const env = readLoopbackEnv();
  // Validate BOTH endpoints before installing clients or executing SQL.
  for (const raw of [env.apiUrl, env.dbUrl]) {
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        new URL(raw).hostname,
      )
    ) {
      throw new Error("TNA fixtures require loopback endpoints");
    }
  }
  installLoopbackFetchGuard();
  const admin = createAdmin(env);
  const runSql = (_env: typeof env, query: string) => {
    try {
      return executeSql(env, query);
    } catch {
      // execFile errors can contain the DB URL/password. Never surface them.
      throw new Error("TNA fixture SQL failed (details suppressed)");
    }
  };
  const prefix = `tna-fixture-${namespace}`;
  const names = {
    mapped: `${prefix}-mapped`,
    mappedRuleV1: `${prefix}-mapped-v1`,
    alpha: `${prefix}-alpha`,
    critical: `${prefix}-critical`,
    beta: `${prefix}-beta`,
    delta: `${prefix}-delta`,
    bulk: `${prefix}-bulk`,
  };
  const uuid = (label: string) => {
    const h = createHash("sha256").update(`${prefix}:${label}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  const ids = {
    folder: uuid("folder"),
    periods: Array.from({ length: 3 }, (_, i) => uuid(`period-${i}`)),
    versions: Array.from({ length: 2 }, (_, i) => uuid(`version-${i}`)),
    indicators: [uuid("legacy")],
    mappedRuleIndicators: Array.from({ length: 2 }, (_, i) =>
      uuid(`mapped-${i}`),
    ),
    unmappedRuleIndicators: Array.from({ length: 2 }, (_, i) =>
      uuid(`unmapped-${i}`),
    ),
    participants: Array.from({ length: 6 }, (_, i) => uuid(`agent-${i}`)),
    findings: Array.from({ length: 18 }, (_, i) => uuid(`finding-${i}`)),
    // T2 metric substrate: four extra masters plus a bulk master with >1000
    // countable rows in one period. Kept out of `findings`/`periods` so the T1
    // assertions and counts stay intact.
    extraPeriods: [uuid("period-3")],
    metricsIndicators: {
      alpha: uuid("alpha"),
      critical: uuid("critical"),
      beta: uuid("beta"),
      delta: uuid("delta"),
    },
    bulkIndicator: uuid("bulk"),
  };
  const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const list = (values: string[]) => values.map(quoted).join(",");
  let users: { admin: FixtureUser; trainer: FixtureUser } | undefined;
  let seeding = false;

  async function cleanup() {
    // Exact owned UUIDs/emails only. Transaction failure leaves the fixture
    // intact and reports the error; never broad-delete to force cleanup.
    runSql(
      env,
      `BEGIN;
      DELETE FROM activity_logs WHERE user_id IN (
        SELECT id FROM auth.users WHERE email IN (${["admin", "trainer"].map((role) => quoted(`e2e-browser-${role}-${namespace}@local.test`)).join(",")})
      );
      DELETE FROM qa_temuan WHERE peserta_id IN (${list(ids.participants)});
      DELETE FROM qa_service_rule_indicators WHERE id IN (${list([...ids.mappedRuleIndicators, ...ids.unmappedRuleIndicators])});
      DELETE FROM qa_service_rule_versions WHERE id IN (${list(ids.versions)});
      DELETE FROM qa_indicators WHERE id IN (${list([
        ...ids.indicators,
        ...Object.values(ids.metricsIndicators),
        ids.bulkIndicator,
      ])});
      DELETE FROM profiler_peserta WHERE id IN (${list(ids.participants)});
      DELETE FROM profiler_folders WHERE id=${quoted(ids.folder)};
      DELETE FROM qa_periods WHERE id IN (${list([...ids.periods, ...ids.extraPeriods])});
      COMMIT;`,
    );
    for (const role of ["admin", "trainer"] as const) {
      const email = `e2e-browser-${role}-${namespace}@local.test`;
      const userId = runSql(
        env,
        `SELECT id FROM auth.users WHERE email=${quoted(email)};`,
      );
      if (userId) {
        const result = await admin.auth.admin.deleteUser(userId);
        if (result.error) throw new Error("TNA fixture auth cleanup failed");
      }
    }
    users = undefined;
  }

  async function seed() {
    if (users) return users;
    if (seeding) throw new Error("Seed TNA fixtures serially");
    seeding = true;
    try {
      // Recover only this namespace's interrupted attempt, never reuse unknown
      // calendar rows/accounts. Existing year/month collisions fail closed.
      await cleanup();
      const adminUser = await createUserWithJwt(env, "admin", namespace);
      const trainerUser = await createUserWithJwt(env, "trainer", namespace);
      const year = 2080 + (parseInt(namespace.slice(0, 4), 16) % 20);
      const periods = [...ids.periods, ...ids.extraPeriods]
        .map((id, i) => `(${quoted(id)},${i + 1},${year})`)
        .join(",");
      const participants = ids.participants
        .map(
          (id, i) =>
            `(${quoted(id)},${quoted(prefix)},${quoted(`${prefix}-agent-${i}`)},'Chat',${quoted(i === 5 ? "QA" : "Agent")},${i + 1})`,
        )
        .join(",");
      const versions = ids.versions
        .map(
          (id, i) =>
            `(${quoted(id)},'chat',${quoted(ids.periods[i === 0 ? 0 : 2]!)},${quoted(i === 0 ? "superseded" : "published")},0.5,0.5,'weighted',${i + 1},${quoted(prefix)},${quoted(adminUser.userId)})`,
        )
        .join(",");
      const ruleRows = ids.versions
        .flatMap((versionId, i) => [
          // Version 1 keeps a distinct rule-side name so the TNA engine cannot
          // pass by reading the master row for the published period.
          `(${quoted(ids.mappedRuleIndicators[i]!)},${quoted(versionId)},${quoted(ids.indicators[0]!)},'chat',${quoted(i === 0 ? names.mapped : names.mappedRuleV1)},'non_critical',1,0)`,
          `(${quoted(ids.unmappedRuleIndicators[i]!)},${quoted(versionId)},NULL,'chat',${quoted(prefix + "-unmapped")},'non_critical',1,1)`,
        ])
        .join(",");
      const indicatorRows = (
        [
          [ids.indicators[0], names.mapped, "non_critical"],
          [ids.metricsIndicators.alpha, names.alpha, "non_critical"],
          [ids.metricsIndicators.critical, names.critical, "critical"],
          [ids.metricsIndicators.beta, names.beta, "non_critical"],
          [ids.metricsIndicators.delta, names.delta, "non_critical"],
          [ids.bulkIndicator, names.bulk, "non_critical"],
        ] as const
      )
        .map(
          ([id, name, category]) =>
            `(${quoted(id)},'chat',${quoted(name)},${quoted(category)},1)`,
        )
        .join(",");
      // Extra rows carry no rule mapping: they exercise the qa_indicators
      // fallback while the original rows exercise the rule-indicator path.
      // Per period and agent: agent0 12 sessions, agent1 5, agent2 4,
      // agent3 6, agent4 5 (phantom-only). Findings: alpha 3, critical 3,
      // beta 3 across 2 agents, delta 9, mapped 3; QA agent stays excluded.
      type ExtraRow = [string, number, string, number, string | null, boolean];
      const rowsForPeriod = (p: number): ExtraRow[] => [
        [
          `alpha-${p}-0`,
          0,
          ids.metricsIndicators.alpha,
          2,
          "Kurang menggali kebutuhan",
          false,
        ],
        [
          `alpha-${p}-1`,
          1,
          ids.metricsIndicators.alpha,
          2,
          "Kurang menggali kebutuhan",
          false,
        ],
        [
          `alpha-${p}-2`,
          2,
          ids.metricsIndicators.alpha,
          2,
          "Kurang menggali kebutuhan",
          false,
        ],
        [`alpha-${p}-3`, 3, ids.metricsIndicators.alpha, 3, null, false],
        // Whitespace-only note is NOT a countable finding (nilai = 3).
        [`alpha-${p}-3-ws`, 3, ids.metricsIndicators.alpha, 3, "   ", false],
        // Phantom with a countable-looking row: phantom must NEVER count as
        // a finding even when nilai < 3 and a note is present.
        [
          `alpha-${p}-4`,
          4,
          ids.metricsIndicators.alpha,
          1,
          "Tidak melakukan probing",
          true,
        ],
        [
          `critical-${p}-0`,
          0,
          ids.metricsIndicators.critical,
          0,
          "Salah penggunaan sistem",
          false,
        ],
        [
          `critical-${p}-1`,
          1,
          ids.metricsIndicators.critical,
          0,
          "Salah penggunaan sistem",
          false,
        ],
        [
          `critical-${p}-2`,
          2,
          ids.metricsIndicators.critical,
          0,
          "Salah penggunaan sistem",
          false,
        ],
        [`critical-${p}-3`, 3, ids.metricsIndicators.critical, 3, null, false],
        [`critical-${p}-4`, 4, ids.metricsIndicators.critical, 3, null, true],
        // nilai = 3 + real note is countable; nilai < 3 is countable.
        [
          `beta-${p}-0a`,
          0,
          ids.metricsIndicators.beta,
          3,
          "Salah menulis",
          false,
        ],
        [
          `beta-${p}-0b`,
          0,
          ids.metricsIndicators.beta,
          1,
          "Salah menulis",
          false,
        ],
        [
          `beta-${p}-1`,
          1,
          ids.metricsIndicators.beta,
          1,
          "Salah menulis",
          false,
        ],
        [`beta-${p}-3`, 3, ids.metricsIndicators.beta, 3, null, false],
        [`beta-${p}-4`, 4, ids.metricsIndicators.beta, 3, null, true],
        ...Array.from({ length: 7 }, (_, k): ExtraRow => [
          `delta-${p}-0-${k}`,
          0,
          ids.metricsIndicators.delta,
          1,
          "Tidak melakukan probing",
          false,
        ]),
        [
          `delta-${p}-1`,
          1,
          ids.metricsIndicators.delta,
          1,
          "Tidak melakukan probing",
          false,
        ],
        [
          `delta-${p}-2`,
          2,
          ids.metricsIndicators.delta,
          1,
          "Tidak melakukan probing",
          false,
        ],
        [`delta-${p}-3`, 3, ids.metricsIndicators.delta, 3, null, false],
        [`delta-${p}-4`, 4, ids.metricsIndicators.delta, 3, null, true],
      ];
      const extraRows = ids.periods.flatMap((periodId, p) =>
        rowsForPeriod(p).map(
          ([label, agent, indicator, nilai, note, phantom]) =>
            `(${quoted(uuid(label))},${quoted(ids.participants[agent]!)},${quoted(periodId)},${quoted(indicator)},'chat',${quoted(`${prefix}-${label}`)},${phantom},${nilai},${note === null ? "NULL" : quoted(note)},${year})`,
        ),
      );
      // >1000 rows in exactly one service+period: pagination must see all of
      // them. 5 audited agents x 250 distinct sessions = 1250 findings.
      const bulkSql = `INSERT INTO qa_temuan(id,peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,tahun)
        SELECT gen_random_uuid(), ((ARRAY[${list(ids.participants.slice(0, 5))}])[((s - 1) % 5) + 1])::uuid, ${quoted(ids.extraPeriods[0]!)}, ${quoted(ids.bulkIndicator)}, 'chat', ${quoted(`${prefix}-bulk-`)} || s, false, 1, 'Tidak melakukan probing', ${year}
        FROM generate_series(1, 1250) AS s;`;
      // Per period: five audited agents (one phantom-only), one excluded QA.
      // Three real countable findings, one clean real row, one phantom, one QA.
      const rows = ids.findings
        .map((id, n) => {
          const p = Math.floor(n / 6),
            a = n % 6,
            version = p === 2 ? 1 : 0;
          const finding = a < 3 || a === 5;
          return `(${quoted(id)},${quoted(ids.participants[a]!)},${quoted(ids.periods[p]!)},${quoted(ids.indicators[0]!)},${quoted(ids.versions[version]!)},${quoted(ids.mappedRuleIndicators[version]!)},'chat',${quoted(`${prefix}-ticket-${p}-${a}`)},${a === 4},${finding ? 1 : 3},${finding ? quoted("Tidak melakukan probing") : "NULL"},${year})`;
        })
        .join(",");
      runSql(
        env,
        `BEGIN;
        INSERT INTO qa_periods(id,month,year) VALUES ${periods};
        INSERT INTO profiler_folders(id,name) VALUES (${quoted(ids.folder)},${quoted(prefix)});
        INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut) VALUES ${participants};
        INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES ${indicatorRows};
        INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,change_reason,created_by) VALUES ${versions};
        INSERT INTO qa_service_rule_indicators(id,rule_version_id,legacy_indicator_id,service_type,name,category,bobot,sort_order) VALUES ${ruleRows};
        INSERT INTO qa_temuan(id,peserta_id,period_id,indicator_id,rule_version_id,rule_indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,tahun) VALUES ${rows};
        INSERT INTO qa_temuan(id,peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,tahun) VALUES ${extraRows.join(",")};
        ${bulkSql}
        COMMIT;`,
      );
      users = { admin: adminUser, trainer: trainerUser };
      return users;
    } catch (error) {
      await cleanup();
      throw error;
    } finally {
      seeding = false;
    }
  }

  return {
    env,
    ids,
    names,
    seed,
    cleanup,
    /**
     * Phantom padding batch seperti SIDAK (`__PHANTOM__<batchId>_1..5`, 5 sesi,
     * nilai 3). Dipakai untuk membuktikan guardrail SIDAK #3: agent yang punya
     * row real tidak boleh menghitung sesi phantom. Return batch id.
     */
    addPhantomBatch: (args: {
      periodId: string;
      pesertaId: string;
      indicatorId: string;
    }): string => {
      const batchId = randomUUID();
      runSql(
        env,
        `INSERT INTO qa_temuan(peserta_id, period_id, tahun, indicator_id, service_type, no_tiket, nilai, is_phantom_padding, phantom_batch_id)
        SELECT ${quoted(args.pesertaId)}, ${quoted(args.periodId)}, (SELECT year FROM qa_periods WHERE id=${quoted(args.periodId)}), ${quoted(args.indicatorId)}, 'chat', ${quoted(`__PHANTOM__${batchId}_`)} || s, 3, true, ${quoted(batchId)}
        FROM generate_series(1, 5) AS s;`,
      );
      return batchId;
    },
    removePhantomBatch: (args: {
      periodId: string;
      pesertaId: string;
    }): void => {
      runSql(
        env,
        `DELETE FROM qa_temuan WHERE peserta_id=${quoted(args.pesertaId)} AND period_id=${quoted(args.periodId)} AND is_phantom_padding = true AND no_tiket LIKE '__PHANTOM__%';`,
      );
    },
    countOwnedFindings: () =>
      Number(
        sqlOne(
          env,
          `SELECT count(*) FROM qa_temuan WHERE id IN (${list(ids.findings)});`,
        ),
      ),
  };
}
