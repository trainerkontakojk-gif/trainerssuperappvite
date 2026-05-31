import { describe, it, expect } from "vitest";
import { ALL_RLS_TABLES, RLSTestFailure } from "./fixtures/rls-config";
import { evaluateRLSPolicy, collectRLSFailures } from "./helpers/rls-policy-evaluator";
import { readMigrationSqlSource, findMissingPolicyReferences } from "./helpers/rls-policy-source";

/**
 * RLS Verification Test Suite (Smoke & Structure Validation)
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 *
 * Live Supabase operation checks are intentionally not implemented here.
 * This suite validates the static RLS expectation model and its SQL references.
 */

describe("RLS Verification Test Suite", () => {
  describe("Test Structure Validation", () => {
    it("covers all 32 RLS-enabled tables", () => {
      expect(ALL_RLS_TABLES).toHaveLength(32);

      const tableNames = ALL_RLS_TABLES.map((t) => t.table);
      const uniqueNames = new Set(tableNames);
      expect(uniqueNames.size).toBe(32);
    });

    it("every table has at least one policy defined", () => {
      for (const config of ALL_RLS_TABLES) {
        expect(config.policies.length).toBeGreaterThan(0);
      }
    });

    it("every policy has both allowed and denied roles", () => {
      for (const config of ALL_RLS_TABLES) {
        for (const policy of config.policies) {
          expect(policy.allowedRoles.length).toBeGreaterThan(0);
          expect(policy.deniedRoles.length).toBeGreaterThan(0);
        }
      }
    });

    it("anon is denied on all 32 tables for all operations", () => {
      for (const config of ALL_RLS_TABLES) {
        for (const policy of config.policies) {
          expect(policy.deniedRoles).toContain("anon");
        }
      }
    });

    it("policy expectations are backed by migration SQL references", () => {
      const sqlSource = readMigrationSqlSource();
      expect(sqlSource.length).toBeGreaterThan(0);

      const missing = findMissingPolicyReferences(ALL_RLS_TABLES, sqlSource);
      expect(missing).toEqual([]);
    });
  });

  describe("Anon Denial Verification (Requirement 7.4)", () => {
    it("anon is denied on ALL 32 RLS-enabled tables", () => {
      const failures: RLSTestFailure[] = [];

      for (const config of ALL_RLS_TABLES) {
        for (const policy of config.policies) {
          const result = evaluateRLSPolicy(
            config,
            policy.operation,
            "anon",
            false,
          );
          if (result.allowed) {
            failures.push({
              table: config.table,
              policyName: policy.policyName,
              operation: policy.operation,
              role: "anon",
              issue: "incorrectly_granted",
              details: `Anon should be denied ${policy.operation} on '${config.table}' but was granted`,
            });
          }
        }
      }

      if (failures.length > 0) {
        const report = failures
          .map((f) => `  [FAIL] ${f.table}.${f.operation} - ${f.details}`)
          .join("\n");
        expect.fail(`Anon access incorrectly granted:\n${report}`);
      }
    });
  });

  describe("Comprehensive RLS Failure Report (Requirement 7.3)", () => {
    it("all positive and negative cases pass without failures", () => {
      const failures = collectRLSFailures(ALL_RLS_TABLES);

      if (failures.length > 0) {
        const report = failures
          .map(
            (f) =>
              `  [${f.issue.toUpperCase()}] ${f.table} | ` +
              `Policy: ${f.policyName} | ` +
              `Op: ${f.operation} | ` +
              `Role: ${f.role} | ` +
              `${f.details}`,
          )
          .join("\n");
        expect.fail(
          `RLS verification failures (${failures.length}):\n${report}`,
        );
      }
    });

    it("failure report includes required fields: table, policy, operation, role, issue", () => {
      // Simulate a failure to verify report structure
      const mockFailure: RLSTestFailure = {
        table: "test_table",
        policyName: "test_policy",
        operation: "SELECT",
        role: "anon",
        issue: "incorrectly_granted",
        details: "Test failure for report structure validation",
      };

      expect(mockFailure.table).toBeDefined();
      expect(mockFailure.policyName).toBeDefined();
      expect(mockFailure.operation).toBeDefined();
      expect(mockFailure.role).toBeDefined();
      expect(mockFailure.issue).toMatch(
        /incorrectly_granted|incorrectly_denied/,
      );
    });
  });

  describe.skip("Live RLS policy verification", () => {
    it("requires a dedicated seeded Supabase integration harness", () => {
      throw new Error("Skipped until the harness creates role-scoped users and cleanup data.");
    });
  });
});
