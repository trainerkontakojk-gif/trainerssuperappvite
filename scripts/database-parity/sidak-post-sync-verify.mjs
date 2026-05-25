import fs from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg?.slice("--out=".length) ?? null;
const checkMv = args.includes("--check-mv");
const refreshSummaries = args.includes("--refresh-summaries");

function loadEnv() {
  const env = {};
  const content = fs.readFileSync(
    new URL("../../.env.migration", import.meta.url),
    "utf8",
  );
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i > 0) env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return env;
}

function connectionString(raw) {
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  return url.toString();
}

async function connect(raw) {
  const client = new pg.Client({
    connectionString: connectionString(raw),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function main() {
  const env = loadEnv();
  const oldDb = await connect(env.OLD_DB_URL);
  const newDb = await connect(env.NEW_DB_URL);
  await oldDb.query("begin read only");

  const report = {
    timestamp: new Date().toISOString(),
    targetCounts: {},
    legacyCounts: {},
    versionSummary: {},
    dashboardSummary: {},
    mvCheck: {},
    refreshResult: null,
  };

  // 1. Compare qa_temuan non-phantom counts by month/service
  const targetCounts = (
    await newDb.query(
      `select qp.month, qp.year, qt.service_type,
              count(*)::int as total,
              count(*) filter (where qt.is_phantom_padding = true)::int as phantom,
              count(*) filter (where qt.is_phantom_padding = false)::int as non_phantom
       from public.qa_temuan qt
       join public.qa_periods qp on qp.id = qt.period_id
       where qp.year = 2026
       group by qp.month, qp.year, qt.service_type
       order by qp.month, qt.service_type`,
    )
  ).rows;
  report.targetCounts.qaLiveCounts = targetCounts;

  const legacyCounts = (
    await oldDb.query(
      `select qp.month, qp.year, qt.service_type,
              count(*)::int as total,
              count(*) filter (where qt.is_phantom_padding = true)::int as phantom,
              count(*) filter (where qt.is_phantom_padding = false)::int as non_phantom
       from public.qa_temuan qt
       join public.qa_periods qp on qp.id = qt.period_id
       where qp.year = 2026
       group by qp.month, qp.year, qt.service_type
       order by qp.month, qt.service_type`,
    )
  ).rows;
  report.legacyCounts.qaLiveCounts = legacyCounts;

  // 2. Target qa_service_rule_versions by service/status
  const versionSummary = (
    await newDb.query(
      `select service_type, status, count(*)::int
       from public.qa_service_rule_versions
       group by service_type, status
       order by service_type, status`,
    )
  ).rows;
  report.versionSummary = versionSummary;

  // 3. Target qa_service_rule_indicators by service
  const indicatorSummary = (
    await newDb.query(
      `select service_type, count(*)::int
       from public.qa_service_rule_indicators
       group by service_type
       order by service_type`,
    )
  ).rows;
  report.versionSummary.indicators = indicatorSummary;

  // 4. Dashboard summary table counts
  const periodSummaryCount = (
    await newDb.query(
      `select count(*)::int from public.qa_dashboard_period_summary`,
    )
  ).rows[0];
  const agentSummaryCount = (
    await newDb.query(
      `select count(*)::int from public.qa_dashboard_agent_period_summary`,
    )
  ).rows[0];
  report.dashboardSummary = {
    periodSummaryRows: periodSummaryCount?.count ?? 0,
    agentPeriodSummaryRows: agentSummaryCount?.count ?? 0,
  };

  // 5. MV presence check
  if (checkMv) {
    const mvExists = (
      await newDb.query(
        `select to_regclass('public.mv_qa_period_summary') is not null as exists`,
      )
    ).rows[0];
    report.mvCheck.exists = mvExists?.exists ?? false;

    if (report.mvCheck.exists) {
      const mvRowCount = (
        await newDb.query(
          `select count(*)::int from public.mv_qa_period_summary`,
        )
      ).rows[0];
      report.mvCheck.rowCount = mvRowCount?.count ?? 0;

      try {
        await newDb.query(`select public.refresh_mv_qa_period_summary()`);
        report.mvCheck.refreshOk = true;
      } catch (e) {
        report.mvCheck.refreshOk = false;
        report.mvCheck.refreshError = e.message;
      }
    }
  }

  // 6. Refresh summaries if requested
  if (refreshSummaries) {
    const result = await newDb.query(
      `select public.refresh_qa_dashboard_summary_for_period(id, '__ALL__')
       from public.qa_periods
       where exists (
         select 1 from public.qa_temuan
         where qa_temuan.period_id = qa_periods.id
       )`,
    );
    report.refreshResult = { rows: result?.rowCount ?? 0 };

    // Refresh MV after summary backfill
    try {
      await newDb.query(`select public.refresh_mv_qa_period_summary()`);
      report.refreshResult.mvRefreshed = true;
    } catch (e) {
      report.refreshResult.mvRefreshed = false;
      report.refreshResult.mvError = e.message;
    }
  }

  // 7. FK orphan check for synced rows
  const orphanCheck = (
    await newDb.query(
      `select
         count(*) filter (where pp.id is null) as missing_peserta,
         count(*) filter (where qp.id is null) as missing_period,
         count(*) filter (where qi.id is null) as missing_indicator
       from public.qa_temuan qt
       left join public.profiler_peserta pp on pp.id = qt.peserta_id
       left join public.qa_periods qp on qp.id = qt.period_id
       left join public.qa_indicators qi on qi.id = qt.indicator_id
       where qt.tahun = 2026`,
    )
  ).rows[0];
  report.fkOrphans = orphanCheck;

  await oldDb.query("rollback");
  await oldDb.end();
  await newDb.end();

  const output = JSON.stringify(report, null, 2);
  if (outPath) fs.writeFileSync(outPath, `${output}\n`);
  console.log(output);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
