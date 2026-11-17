import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const supabaseDir = fileURLToPath(
  new URL("../../../../supabase/", import.meta.url),
);

function read(path: string) {
  return readFileSync(`${supabaseDir}${path}`, "utf8");
}

/**
 * Later migrations that redefine a function touched by `version`'s rollback.
 *
 * A rollback round trip ends by reapplying the rolled-back migration. If a later
 * migration redefines one of the same functions, reapplying only the first one
 * leaves the database behind HEAD, and every spec that runs afterwards tests old
 * function bodies. A round trip must reapply `version` followed by exactly this
 * list; specs assert that before rolling back, so a new migration cannot be
 * silently missed.
 */
export function laterMigrationsRedefiningRollback(version: string): string[] {
  const rollback = readdirSync(`${supabaseDir}rollbacks`).find((file) =>
    file.startsWith(`rollback_${version}_`),
  );
  if (!rollback) throw new Error(`No rollback file for migration ${version}`);
  const functions = [
    ...new Set(
      [
        ...read(`rollbacks/${rollback}`).matchAll(
          /FUNCTION (?:IF EXISTS )?public\.([a-z0-9_]+)\s*\(/g,
        ),
      ].map((match) => match[1]!),
    ),
  ];
  if (functions.length === 0)
    throw new Error(`Rollback ${rollback} touches no public function`);
  return readdirSync(`${supabaseDir}migrations`)
    .filter((file) => file.endsWith(".sql") && file.slice(0, 14) > version)
    .sort()
    .filter((file) => {
      const source = read(`migrations/${file}`);
      return functions.some((name) =>
        new RegExp(
          `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\s*\\(`,
        ).test(source),
      );
    });
}
