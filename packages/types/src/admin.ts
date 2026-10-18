import { ROLES, type Role } from "./access";
import type { PracticeModule, UserPracticeLimit } from "./practice-quota";
import { z } from "zod";

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: "active" | "pending" | "inactive";
  is_deleted: boolean;
  created_at?: string;
  /** Last WIB day the account may be used; null or absent = no limit. */
  active_until?: string | null;
  /** KTP participant this account belongs to; null when unlinked. */
  linked_peserta?: LinkedPesertaSummary | null;
  /** Per-user practice exceptions still in force today. */
  practice_overrides?: {
    module: PracticeModule;
    daily_limit: number | null;
    ends_on: string | null;
  }[];
}

export interface LinkedPesertaSummary {
  id: string;
  nama: string;
  batch_name: string | null;
  tim: string | null;
}

export interface UserHistoryEntry {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
}

export interface ManagedUserDetail {
  user: ManagedUser & { last_sign_in_at: string | null };
  peserta:
    | (LinkedPesertaSummary & {
        jabatan: string | null;
        nik_ojk: string | null;
      })
    | null;
  ketik_assignment: {
    assigned_at: string;
    assigned_by_name: string | null;
  } | null;
  leader_access: {
    module: string;
    approved_at: string | null;
    group_names: string[];
  }[];
  history: UserHistoryEntry[];
  practice_limits: UserPracticeLimit[];
}

export interface PesertaLinkOption extends LinkedPesertaSummary {
  linked_user: { id: string; full_name: string | null; email: string } | null;
  /** The participant's Email OJK equals the account email (suggestion only). */
  email_match: boolean;
}

/** Account summary shown on a KTP profile. */
export interface LinkedAccountSummary {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
  status: ManagedUser["status"];
}

export interface PendingLeaderRequest {
  id: string;
  leader_user_id: string;
  leader_name: string;
  leader_email: string;
  module: string;
  created_at: string;
  status: string;
}

export interface ApprovedLeaderAccess {
  id: string;
  leader_user_id: string;
  leader_name: string;
  leader_email: string;
  module: string;
  access_group_ids: string[];
  access_group_names: string[];
  approved_at: string;
}

export interface AccessGroupRow {
  id: string;
  name: string;
  description: string | null;
  scope_type: string;
  is_active: boolean;
  created_at: string;
  item_count: number;
}

export interface AccessGroupItemRow {
  id: string;
  access_group_id: string;
  field_name: "peserta_id" | "batch_name" | "tim" | "service_type";
  field_value: string;
  is_active: boolean;
  created_at?: string;
}

export interface AccessScopeAgentOption {
  id: string;
  name: string;
  team: string;
  batch_name: string | null;
}

export interface AccessScopeOptions {
  teams: string[];
  services: { value: string; label: string }[];
  agentsByTeam: Record<string, AccessScopeAgentOption[]>;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  module: string | null;
  type: string | null;
  created_at: string;
}

export const updateUserStatusSchema = z.object({
  status: z.enum(["approved", "pending", "rejected"]),
});

/** Approve a pending account with its role and, optionally, its participant. */
export const approveUserSchema = z.object({
  role: z.enum(ROLES),
  peserta_id: z.string().uuid().nullable(),
  /** Last WIB day; omitted or null = no limit. */
  active_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const linkUserPesertaSchema = z.object({
  peserta_id: z.string().uuid(),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLES),
});

export const createAccessGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateAccessGroupSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const addAccessGroupItemSchema = z.object({
  fieldName: z.enum(["peserta_id", "batch_name", "tim", "service_type"]),
  fieldValue: z.string().min(1),
});

export const approveLeaderRequestSchema = z.object({
  accessGroupIds: z.array(z.string()),
});

export const rejectLeaderRequestSchema = z.object({
  note: z.string().optional(),
});

export const revokeLeaderRequestSchema = z.object({
  note: z.string().optional(),
});

export const reassignLeaderRequestGroupsSchema = z.object({
  accessGroupIds: z.array(z.string()),
});

export interface LeaderAccessStatusItem {
  status: "none" | "pending" | "approved" | "rejected" | "revoked";
  module: string;
  created_at: string | null;
}

export type LeaderAccessStatusMap = Record<string, LeaderAccessStatusItem>;
