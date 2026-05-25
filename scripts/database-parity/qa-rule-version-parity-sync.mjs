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

const VERSION_LEGACY_COLS = [
  "id", "service_type", "effective_period_id", "status",
  "critical_weight", "non_critical_weight", "scoring_mode",
  "created_by", "published_by", "created_at", "updated_at",
  "published_at", "version_number", "change_reason", "updated_by",
  "superseded_at", "superseded_by", "superseded_by_version_id",
  "created_from_version_id",
];

const VERSION_TARGET_COLS = [
  "id", "service_type", "effective_period_id", "status",
  "critical_weight", "non_critical_weight", "scoring_mode",
  "version_number", "change_reason", "created_by", "published_by",
  "updated_by", "created_at", "updated_at", "published_at",
  "superseded_at", "superseded_by", "superseded_by_version_id",
  "created_from_version_id",
];

const INDICATOR_LEGACY_COLS = [
  "id", "rule_version_id", "legacy_indicator_id", "name",
  "category", "bobot", "has_na", "threshold", "sort_order",
  "created_at", "updated_at", "service_type", "updated_by",
];

const INDICATOR_TARGET_COLS = [
  "id", "rule_version_id", "legacy_indicator_id", "service_type",
  "name", "category", "bobot", "has_na", "threshold", "sort_order",
  "created_by", "updated_by", "created_at", "updated_at",
];

function mapVersionToTarget(row) {
  const result = {};
  for (const col of VERSION_TARGET_COLS) {
    result[col] = row[col] ?? null;
  }
  return result;
}

function mapIndicatorToTarget(row) {
  const result = {};
  for (const col of INDICATOR_TARGET_COLS) {
    if (col === "created_by") {
      result[col] = null;
    } else {
      result[col] = row[col] ?? null;
    }
  }
  return result;
}

function comparable(obj, cols) {
  const str = JSON.stringify(
    Object.fromEntries(cols.map((k) => {
      let v = obj[k];
      if (typeof v === "string") v = v.replace(/\r\n/g, "\n");
      return [k, v ?? null];
    })),
  );
  return str;
}

async function main() {
  const env = loadEnv();
  const oldDb = await connect(env.OLD_DB_URL);
  const newDb = await connect(env.NEW_DB_URL);
  await oldDb.query("begin read only");

  // --- Rule Versions ---
  const legacyVersions = (
    await oldDb.query(
      `select ${VERSION_LEGACY_COLS.join(", ")}
       from public.qa_service_rule_versions
       order by created_at, id`,
    )
  ).rows;

  const targetVersions = (
    await newDb.query(
      `select ${VERSION_TARGET_COLS.join(", ")}
       from public.qa_service_rule_versions
       order by created_at, id`,
    )
  ).rows;

  const targetVersionById = new Map(targetVersions.map((row) => [row.id, row]));
  const missingVersions = legacyVersions.filter((row) => !targetVersionById.has(row.id));
  const conflictingVersions = legacyVersions.filter((row) => {
    const target = targetVersionById.get(row.id);
    const mapped = mapVersionToTarget(row);
    return target && comparable(mapped, VERSION_TARGET_COLS) !== comparable(target, VERSION_TARGET_COLS);
  });
  const targetOnlyVersions = targetVersions.filter(
    (row) => !legacyVersions.find((lv) => lv.id === row.id),
  );

  // --- Rule Indicators ---
  const legacyIndicators = (
    await oldDb.query(
      `select ${INDICATOR_LEGACY_COLS.join(", ")}
       from public.qa_service_rule_indicators
       order by created_at, id`,
    )
  ).rows;

  const targetIndicators = (
    await newDb.query(
      `select ${INDICATOR_TARGET_COLS.join(", ")}
       from public.qa_service_rule_indicators
       order by created_at, id`,
    )
  ).rows;

  const targetIndicatorById = new Map(targetIndicators.map((row) => [row.id, row]));
  const missingIndicators = legacyIndicators.filter((row) => !targetIndicatorById.has(row.id));
  const conflictingIndicators = legacyIndicators.filter((row) => {
    const target = targetIndicatorById.get(row.id);
    const mapped = mapIndicatorToTarget(row);
    return target && comparable(mapped, INDICATOR_TARGET_COLS) !== comparable(target, INDICATOR_TARGET_COLS);
  });

  const report = {
    mode: apply ? "apply" : "dry-run",
    missingVersions: missingVersions.length,
    missingIndicators: missingIndicators.length,
    conflictingVersions: conflictingVersions.length,
    conflictingIndicators: conflictingIndicators.length,
    targetOnlyVersions: targetOnlyVersions.length,
    targetOnlyVersionIds: targetOnlyVersions.map((v) => v.id),
    insertedVersions: 0,
    insertedIndicators: 0,
  };

  if (conflictingVersions.length > 0) {
    throw new Error(`Version conflicts: ${conflictingVersions.length}. IDs: ${conflictingVersions.map((v) => v.id).join(", ")}`);
  }
  if (conflictingIndicators.length > 0) {
    throw new Error(`Indicator conflicts: ${conflictingIndicators.length}. IDs: ${conflictingIndicators.map((i) => i.id).join(", ")}`);
  }

  if (apply) {
    if (missingVersions.length > 0) {
      const mapped = missingVersions.map(mapVersionToTarget);
      await newDb.query("begin");
      try {
        const placeholders = mapped.map((_, rowIdx) => {
          const base = rowIdx * VERSION_TARGET_COLS.length;
          return `(${VERSION_TARGET_COLS.map((_, colIdx) => `$${base + colIdx + 1}`).join(", ")})`;
        }).join(", ");
        const values = mapped.flatMap((row) => VERSION_TARGET_COLS.map((col) => row[col] ?? null));
        const result = await newDb.query(
          `insert into public.qa_service_rule_versions (${VERSION_TARGET_COLS.join(", ")})
           values ${placeholders}
           on conflict (id) do nothing`,
          values,
        );
        report.insertedVersions = result.rowCount ?? 0;
        await newDb.query("commit");
      } catch (error) {
        await newDb.query("rollback");
        throw error;
      }
    }

    if (missingIndicators.length > 0) {
      const mapped = missingIndicators.map(mapIndicatorToTarget);
      await newDb.query("begin");
      try {
        const placeholders = mapped.map((_, rowIdx) => {
          const base = rowIdx * INDICATOR_TARGET_COLS.length;
          return `(${INDICATOR_TARGET_COLS.map((_, colIdx) => `$${base + colIdx + 1}`).join(", ")})`;
        }).join(", ");
        const values = mapped.flatMap((row) => INDICATOR_TARGET_COLS.map((col) => row[col] ?? null));
        const result = await newDb.query(
          `insert into public.qa_service_rule_indicators (${INDICATOR_TARGET_COLS.join(", ")})
           values ${placeholders}
           on conflict (id) do nothing`,
          values,
        );
        report.insertedIndicators = result.rowCount ?? 0;
        await newDb.query("commit");
      } catch (error) {
        await newDb.query("rollback");
        throw error;
      }
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
