import fs from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg?.slice("--out=".length) ?? null;

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

// Legacy columns (what legacy table has)
const LEGACY_COLUMNS = [
  "id",
  "peserta_id",
  "period_id",
  "indicator_id",
  "no_tiket",
  "nilai",
  "ketidaksesuaian",
  "sebaiknya",
  "created_at",
  "service_type",
  "tahun",
  "is_phantom_padding",
  "phantom_batch_id",
  "rule_version_id",
  "rule_indicator_id",
];

// Target columns (what target table has — includes updated_at, phantom_batch_id is text)
const TARGET_COLUMNS = [
  "id",
  "peserta_id",
  "period_id",
  "indicator_id",
  "rule_version_id",
  "rule_indicator_id",
  "service_type",
  "no_tiket",
  "is_phantom_padding",
  "phantom_batch_id",
  "nilai",
  "ketidaksesuaian",
  "sebaiknya",
  "tahun",
  "created_at",
  "updated_at",
];

function legacyToTarget(row) {
  const result = {};
  for (const col of TARGET_COLUMNS) {
    if (col === "updated_at") {
      result[col] = row.created_at ?? new Date().toISOString();
    } else if (col === "phantom_batch_id") {
      result[col] = row.phantom_batch_id ? String(row.phantom_batch_id) : null;
    } else if (LEGACY_COLUMNS.includes(col)) {
      result[col] = row[col] ?? null;
    }
  }
  return result;
}

function comparable(row) {
  const cols = TARGET_COLUMNS.filter((c) => c !== "updated_at");
  return JSON.stringify(
    Object.fromEntries(
      cols.map((key) => {
        let val = row[key];
        if (typeof val === "string") val = val.replace(/\r\n/g, "\n");
        return [key, val ?? null];
      }),
    ),
  );
}

async function main() {
  const env = loadEnv();
  const oldDb = await connect(env.OLD_DB_URL);
  const newDb = await connect(env.NEW_DB_URL);
  await oldDb.query("begin read only");

  const legacyRows = (
    await oldDb.query(
      `select ${LEGACY_COLUMNS.map((c) => `qt.${c}`).join(", ")}
       from public.qa_temuan qt
       join public.qa_periods qp on qp.id = qt.period_id
       where qp.year = 2026
         and qp.month = 5
         and qt.is_phantom_padding = false
       order by qt.created_at, qt.id`,
    )
  ).rows;

  const legacyIds = legacyRows.map((row) => row.id);

  const targetRows = (
    await newDb.query(
      `select ${TARGET_COLUMNS.join(", ")}
       from public.qa_temuan
       where id = any($1::uuid[])`,
      [legacyIds],
    )
  ).rows;

  const targetById = new Map(targetRows.map((row) => [row.id, row]));
  const missing = legacyRows.filter((row) => !targetById.has(row.id));
  const conflicts = legacyRows.filter((row) => {
    const target = targetById.get(row.id);
    const mapped = legacyToTarget(row);
    return target && comparable(mapped) !== comparable(target);
  });

  const report = {
    mode: apply ? "apply" : "dry-run",
    legacyMayRows: legacyRows.length,
    targetOverlapRows: targetRows.length,
    missingRows: missing.length,
    conflictingRows: conflicts.length,
    insertedRows: 0,
    conflicts: conflicts.map((row) => row.id),
  };

  if (conflicts.length > 0) {
    throw new Error(
      `Conflict rows found: ${conflicts.length}. IDs: ${conflicts.map((row) => row.id).join(", ")}`,
    );
  }

  if (apply && missing.length > 0) {
    // Map legacy rows to target shape
    const mappedMissing = missing.map(legacyToTarget);

    await newDb.query("begin");
    try {
      const placeholders = mappedMissing
        .map((_, rowIdx) => {
          const base = rowIdx * TARGET_COLUMNS.length;
          return `(${TARGET_COLUMNS.map((_, colIdx) => `$${base + colIdx + 1}`).join(", ")})`;
        })
        .join(", ");

      const values = mappedMissing.flatMap((row) =>
        TARGET_COLUMNS.map((column) => row[column] ?? null),
      );

      const result = await newDb.query(
        `insert into public.qa_temuan (${TARGET_COLUMNS.join(", ")})
         values ${placeholders}
         on conflict (id) do nothing`,
        values,
      );
      report.insertedRows = result.rowCount ?? 0;
      await newDb.query("commit");
    } catch (error) {
      await newDb.query("rollback");
      throw error;
    }
  }

  await oldDb.query("rollback");
  await oldDb.end();
  await newDb.end();

  const output = JSON.stringify(report, null, 2);
  if (outPath) {
    const dir = outPath.substring(0, outPath.lastIndexOf("/"));
    if (dir) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, `${output}\n`);
  }
  console.log(output);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
