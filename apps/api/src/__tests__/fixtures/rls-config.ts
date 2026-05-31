export type AccessPattern =
  | "owner-only"
  | "role-based"
  | "service-role-insert"
  | "mixed";
export type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
export type Role =
  | "anon"
  | "authenticated"
  | "admin"
  | "trainer"
  | "leader"
  | "user"
  | "service_role";

export interface TableRLSConfig {
  table: string;
  accessPattern: AccessPattern;
  policies: PolicyExpectation[];
}

export interface PolicyExpectation {
  operation: Operation;
  allowedRoles: Role[];
  deniedRoles: Role[];
  policyName: string;
  ownershipField?: string; // e.g., 'user_id', 'id' for profiles
  requiresJoin?: boolean; // e.g., ketik_session_reviews via session_id
}

export interface RLSTestFailure {
  table: string;
  policyName: string;
  operation: Operation;
  role: Role;
  issue: "incorrectly_granted" | "incorrectly_denied";
  details: string;
}

export const OWNER_ONLY_TABLES: TableRLSConfig[] = [
  {
    table: "profiles",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated", "admin", "trainer"],
        deniedRoles: ["anon"],
        policyName: "profiles_select_own + profiles_select_admin",
        ownershipField: "id",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["authenticated", "admin", "trainer"],
        deniedRoles: ["anon"],
        policyName: "profiles_update_own + profiles_update_admin",
        ownershipField: "id",
      },
    ],
  },
  {
    table: "ketik_history",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ketik_history_select_own",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ketik_history_insert_own",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "ketik_session_reviews",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ketik_session_reviews_select_own",
        ownershipField: "session_id",
        requiresJoin: true,
      },
    ],
  },
  {
    table: "ketik_typo_findings",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ketik_typo_findings_select_own",
        ownershipField: "session_id",
        requiresJoin: true,
      },
    ],
  },
  {
    table: "ketik_review_jobs",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "ketik_review_jobs_select_own",
        ownershipField: "session_id",
        requiresJoin: true,
      },
    ],
  },
  {
    table: "pdkt_history",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "pdkt_history_select_own",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "pdkt_history_insert_own",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "pdkt_mailbox_items",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "pdkt_mailbox_select_own",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "pdkt_mailbox_insert_own",
        ownershipField: "user_id",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "pdkt_mailbox_update_own",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "telefun_history",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "telefun_history_select_own",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "telefun_history_insert_own",
        ownershipField: "user_id",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "telefun_history_update_own",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "telefun_coaching_summary",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can view their own coaching summaries",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "telefun_replay_annotations",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can view their own replay annotations",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can insert their own replay annotations",
        ownershipField: "user_id",
      },
      {
        operation: "DELETE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can delete their own replay annotations",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "user_settings",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can manage own settings",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can manage own settings",
        ownershipField: "user_id",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can manage own settings",
        ownershipField: "user_id",
      },
      {
        operation: "DELETE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "Users can manage own settings",
        ownershipField: "user_id",
      },
    ],
  },
  {
    table: "report_archives",
    accessPattern: "owner-only",
    policies: [
      {
        operation: "SELECT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "users_view_own_reports",
        ownershipField: "user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "users_insert_own_reports",
        ownershipField: "user_id",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "users_update_own_reports",
        ownershipField: "user_id",
      },
      {
        operation: "DELETE",
        allowedRoles: ["authenticated"],
        deniedRoles: ["anon"],
        policyName: "users_delete_own_reports",
        ownershipField: "user_id",
      },
    ],
  },
];

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
      },
    ],
  },
];

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
        ownershipField: "leader_user_id",
      },
      {
        operation: "INSERT",
        allowedRoles: ["leader", "admin", "trainer"],
        deniedRoles: ["anon", "user"],
        policyName: "Leader inserts own pending request + Admin manage",
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

export const ALL_RLS_TABLES: TableRLSConfig[] = [
  ...OWNER_ONLY_TABLES,
  ...ROLE_BASED_TABLES,
  ...SERVICE_ROLE_INSERT_TABLES,
  ...MIXED_ACCESS_TABLES,
];
