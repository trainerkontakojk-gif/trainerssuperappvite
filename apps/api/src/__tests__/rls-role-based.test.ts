import { describe, it, expect } from "vitest";
import { ROLE_BASED_TABLES, SERVICE_ROLE_INSERT_TABLES } from "./fixtures/rls-config";
import { evaluateRLSPolicy } from "./helpers/rls-policy-evaluator";

describe("Role-Based Access Pattern (admin/trainer)", () => {
  const roleBasedTableNames = [
    "profiler_years",
    "profiler_folders",
    "profiler_peserta",
    "profiler_tim_list",
    "qa_periods",
    "qa_indicators",
    "qa_service_weights",
    "qa_temuan",
    "qa_service_rule_versions",
    "qa_service_rule_indicators",
    "qa_dashboard_period_summary",
    "qa_dashboard_agent_period_summary",
    "access_groups",
    "access_group_items",
    "activity_logs",
  ];

  it("contains all expected role-based tables", () => {
    const actualNames = ROLE_BASED_TABLES.map((t) => t.table);
    for (const name of roleBasedTableNames) {
      expect(actualNames).toContain(name);
    }
  });

  it("positive case: admin/trainer can write to role-based tables", () => {
    for (const config of ROLE_BASED_TABLES) {
      const writePolicy = config.policies.find(
        (p) => p.operation === "INSERT",
      );
      if (writePolicy) {
        const adminResult = evaluateRLSPolicy(
          config,
          "INSERT",
          "admin",
          false,
        );
        const trainerResult = evaluateRLSPolicy(
          config,
          "INSERT",
          "trainer",
          false,
        );
        expect(adminResult.allowed).toBe(true);
        expect(trainerResult.allowed).toBe(true);
      }
    }
  });

  it("positive case: authenticated users can SELECT from role-based tables with read_all policy", () => {
    // Tables with read_all policy (SIDAK tables)
    const readAllTables = ROLE_BASED_TABLES.filter((t) =>
      t.policies.some(
        (p) =>
          p.operation === "SELECT" &&
          p.allowedRoles.includes("authenticated"),
      ),
    );
    for (const config of readAllTables) {
      const result = evaluateRLSPolicy(
        config,
        "SELECT",
        "authenticated",
        false,
      );
      expect(result.allowed).toBe(true);
    }
  });

  it("negative case: regular user/leader cannot write to role-based tables", () => {
    for (const config of ROLE_BASED_TABLES) {
      const writePolicy = config.policies.find(
        (p) => p.operation === "INSERT",
      );
      if (writePolicy) {
        const userResult = evaluateRLSPolicy(config, "INSERT", "user", false);
        const leaderResult = evaluateRLSPolicy(
          config,
          "INSERT",
          "leader",
          false,
        );
        expect(userResult.allowed).toBe(false);
        expect(leaderResult.allowed).toBe(false);
      }
    }
  });

  it("negative case: anon cannot access role-based tables", () => {
    for (const config of ROLE_BASED_TABLES) {
      for (const policy of config.policies) {
        const result = evaluateRLSPolicy(
          config,
          policy.operation,
          "anon",
          false,
        );
        expect(result.allowed).toBe(false);
      }
    }
  });
});

describe("Service-Role-Only INSERT Pattern", () => {
  it("ai_usage_logs: only service_role can INSERT", () => {
    const config = SERVICE_ROLE_INSERT_TABLES.find(
      (t) => t.table === "ai_usage_logs",
    )!;

    // Service role can insert
    const serviceResult = evaluateRLSPolicy(
      config,
      "INSERT",
      "service_role",
      false,
    );
    expect(serviceResult.allowed).toBe(true);

    // Authenticated users cannot insert directly
    const authResult = evaluateRLSPolicy(
      config,
      "INSERT",
      "authenticated",
      false,
    );
    expect(authResult.allowed).toBe(false);

    // Anon cannot insert
    const anonResult = evaluateRLSPolicy(config, "INSERT", "anon", false);
    expect(anonResult.allowed).toBe(false);
  });

  it("ai_usage_logs: owner can SELECT their own logs", () => {
    const config = SERVICE_ROLE_INSERT_TABLES.find(
      (t) => t.table === "ai_usage_logs",
    )!;

    // Owner can select
    const ownerResult = evaluateRLSPolicy(
      config,
      "SELECT",
      "authenticated",
      true,
    );
    expect(ownerResult.allowed).toBe(true);

    // Anon cannot select
    const anonResult = evaluateRLSPolicy(config, "SELECT", "anon", false);
    expect(anonResult.allowed).toBe(false);
  });
});
