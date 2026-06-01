import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TableRLSConfig } from "../fixtures/rls-config";

const MIGRATIONS_DIR = join(process.cwd(), "..", "..", "supabase", "migrations");

export function readMigrationSqlSource(): string {
  if (!existsSync(MIGRATIONS_DIR)) return "";
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
    .join("\n");
}

export function findMissingPolicyReferences(
  configs: TableRLSConfig[],
  sqlSource: string,
): Array<{ table: string; policyName: string }> {
  return configs.flatMap((config) =>
    config.policies
      .filter((policy) => {
        if (!sqlSource.includes(config.table)) return true;
        
        const namesToCheck = policy.sqlPolicyNames !== undefined 
          ? policy.sqlPolicyNames 
          : [policy.policyName];
          
        if (namesToCheck.length === 0) return false;
        
        return !namesToCheck.every(name => sqlSource.includes(name));
      })
      .map((policy) => ({ table: config.table, policyName: policy.policyName })),
  );
}
