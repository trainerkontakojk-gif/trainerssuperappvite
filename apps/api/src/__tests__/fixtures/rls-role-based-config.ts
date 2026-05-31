import type { TableRLSConfig } from "./rls-config";

export const ROLE_BASED_TABLES: TableRLSConfig[] = [
  {
    table: "profiler_years",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "profiler_folders",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "profiler_peserta",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "profiler_tim_list",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_periods",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_indicators",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_service_weights",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_temuan",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_service_rule_versions",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_service_rule_indicators",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_dashboard_period_summary",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "qa_dashboard_agent_period_summary",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "read_all",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "write_trainer",
      },
    ],
  },
  {
    table: "access_groups",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access groups",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access groups",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access groups",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access groups",
      },
    ],
  },
  {
    table: "access_group_items",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access group items",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access group items",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access group items",
      },
      {
        operation: "DELETE",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainer manage access group items",
      },
    ],
  },
  {
    table: "activity_logs",
    accessPattern: "role-based",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainers select and insert activity logs",
      },
      {
        operation: "INSERT",
        allowedRoles: ["admin", "trainer"],
        deniedRoles: ["anon", "user", "leader"],
        policyName: "Admin and trainers select and insert activity logs",
      },
    ],
  },
];

export const SERVICE_ROLE_INSERT_TABLES: TableRLSConfig[] = [
  {
    table: "ai_usage_logs",
    accessPattern: "service-role-insert",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ai_usage_logs_select_own",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["service_role"],
        deniedRoles: ["anon", "authenticated"],
        policyName: "service_role_only_insert",
        sqlPolicyNames: [],
      },
    ],
  },
];
