import type { TableRLSConfig } from "./rls-config";

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
        sqlPolicyNames: ["profiles_select_own", "profiles_select_admin"],
        ownershipField: "id",
      },
      {
        operation: "UPDATE",
        allowedRoles: ["authenticated", "admin", "trainer"],
        deniedRoles: ["anon"],
        policyName: "profiles_update_own + profiles_update_admin",
        sqlPolicyNames: ["profiles_update_own", "profiles_update_admin"],
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
