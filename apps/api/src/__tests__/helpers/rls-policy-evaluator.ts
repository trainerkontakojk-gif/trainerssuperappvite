import {
  TableRLSConfig,
  Operation,
  Role,
  RLSTestFailure,
} from "../fixtures/rls-config";

/**
 * Simulates RLS policy evaluation for a given table, operation, and role.
 * In a real integration test (with `supabase start`), this would execute
 * actual queries against the database. Here we verify the test structure
 * and policy definitions are correct.
 */
export function evaluateRLSPolicy(
  config: TableRLSConfig,
  operation: Operation,
  role: Role,
  isOwner: boolean = false,
): { allowed: boolean; policyName: string } {
  const policy = config.policies.find((p) => p.operation === operation);

  if (!policy) {
    return { allowed: false, policyName: "no_policy_defined" };
  }

  // Anon is always denied
  if (role === "anon") {
    return { allowed: false, policyName: policy.policyName };
  }

  // Service role always has access
  if (role === "service_role") {
    return { allowed: true, policyName: policy.policyName };
  }

  // Check access pattern
  switch (config.accessPattern) {
    case "owner-only": {
      // Owner-only: authenticated users can access their own data
      if (
        role === "authenticated" ||
        role === "admin" ||
        role === "trainer" ||
        role === "leader" ||
        role === "user"
      ) {
        // For owner-only tables, access depends on ownership
        if (isOwner) {
          return { allowed: true, policyName: policy.policyName };
        }
        // Admin/trainer may have additional access on some tables (e.g., profiles)
        if (policy.allowedRoles.includes(role)) {
          return { allowed: true, policyName: policy.policyName };
        }
        return { allowed: false, policyName: policy.policyName };
      }
      return { allowed: false, policyName: policy.policyName };
    }

    case "role-based": {
      // Role-based: specific roles have access
      if (
        policy.allowedRoles.includes("authenticated") &&
        (role === "authenticated" ||
          role === "admin" ||
          role === "trainer" ||
          role === "leader" ||
          role === "user")
      ) {
        return { allowed: true, policyName: policy.policyName };
      }
      if (policy.allowedRoles.includes(role)) {
        return { allowed: true, policyName: policy.policyName };
      }
      return { allowed: false, policyName: policy.policyName };
    }

    case "service-role-insert": {
      if (operation === "INSERT") {
        // Only service_role can insert — but service_role is already handled above with early return
        // If we reach here, role is NOT service_role, so INSERT is denied
        return { allowed: false, policyName: policy.policyName };
      }
      // SELECT: owner can see own
      if (operation === "SELECT" && isOwner) {
        return { allowed: true, policyName: policy.policyName };
      }
      return { allowed: false, policyName: policy.policyName };
    }

    case "mixed": {
      if (
        policy.allowedRoles.includes("authenticated") &&
        (role === "authenticated" ||
          role === "admin" ||
          role === "trainer" ||
          role === "leader" ||
          role === "user")
      ) {
        return { allowed: true, policyName: policy.policyName };
      }
      if (policy.allowedRoles.includes(role)) {
        return { allowed: true, policyName: policy.policyName };
      }
      return { allowed: false, policyName: policy.policyName };
    }

    default:
      return { allowed: false, policyName: "unknown_pattern" };
  }
}

/**
 * Collects all RLS test failures for reporting.
 */
export function collectRLSFailures(tables: TableRLSConfig[]): RLSTestFailure[] {
  const failures: RLSTestFailure[] = [];

  for (const config of tables) {
    for (const policy of config.policies) {
      // Test allowed roles (positive cases)
      for (const role of policy.allowedRoles) {
        const result = evaluateRLSPolicy(config, policy.operation, role, true);
        if (!result.allowed) {
          failures.push({
            table: config.table,
            policyName: policy.policyName,
            operation: policy.operation,
            role,
            issue: "incorrectly_denied",
            details: `Role '${role}' should be allowed ${policy.operation} on '${config.table}' but was denied`,
          });
        }
      }

      // Test denied roles (negative cases)
      for (const role of policy.deniedRoles) {
        const result = evaluateRLSPolicy(config, policy.operation, role, false);
        if (result.allowed) {
          failures.push({
            table: config.table,
            policyName: policy.policyName,
            operation: policy.operation,
            role,
            issue: "incorrectly_granted",
            details: `Role '${role}' should be denied ${policy.operation} on '${config.table}' but was granted`,
          });
        }
      }
    }
  }

  return failures;
}
