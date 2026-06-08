import { z } from "zod";

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "trainer" | "leader" | "agent" | "qa";
  status: "active" | "pending" | "inactive";
  is_deleted: boolean;
  created_at?: string;
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

export const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "trainer", "leader", "agent"]),
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
