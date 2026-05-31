import type { TableRLSConfig } from "./rls-config";

export const MIXED_ACCESS_TABLES: TableRLSConfig[] = [
  {
    table: "leader_access_requests",
    accessPattern: "mixed",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["admin", "trainer", "leader"],
        deniedRoles: ["anon"],
        policyName: "Leader views own requests + Admin manage",
        sqlPolicyNames: ["Leader views own requests", "Admin and trainer manage leader access requests"],
        ownershipField: "leader_user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["leader", "admin", "trainer"],
        deniedRoles: ["anon", "user"],
        policyName: "Leader inserts own pending request + Admin manage",
        sqlPolicyNames: ["Leader inserts own pending request", "Admin and trainer manage leader access requests"],
      },
    ],
  },
  {
    table: "leader_access_request_groups",
    accessPattern: "mixed",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["admin", "trainer", "leader"],
        deniedRoles: ["anon"],
        policyName: "Admin manage + Leader views own request groups",
        sqlPolicyNames: ["Admin and trainer manage access request groups", "Leader views own request groups"],
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user"],
        policyName: "Admin and trainer manage access request groups",
      },
    ],
  },
  {
    table: "ai_pricing_settings",
    accessPattern: "mixed",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ai_pricing_settings_select",
      },
    ],
  },
  {
    table: "ai_billing_settings",
    accessPattern: "mixed",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ai_billing_settings_select",
      },
    ],
  },
];
