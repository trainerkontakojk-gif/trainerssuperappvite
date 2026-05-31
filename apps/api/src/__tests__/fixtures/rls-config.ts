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
  sqlPolicyNames?: string[];
  ownershipField?: string;
  requiresJoin?: boolean;
}

export interface RLSTestFailure {
  table: string;
  policyName: string;
  operation: Operation;
  role: Role;
  issue: "incorrectly_granted" | "incorrectly_denied";
  details: string;
}

export { OWNER_ONLY_TABLES } from "./rls-owner-only-config";
export { ROLE_BASED_TABLES, SERVICE_ROLE_INSERT_TABLES } from "./rls-role-based-config";
export { MIXED_ACCESS_TABLES } from "./rls-mixed-access-config";

import { OWNER_ONLY_TABLES } from "./rls-owner-only-config";
import { ROLE_BASED_TABLES, SERVICE_ROLE_INSERT_TABLES } from "./rls-role-based-config";
import { MIXED_ACCESS_TABLES } from "./rls-mixed-access-config";

export const ALL_RLS_TABLES: TableRLSConfig[] = [
  ...OWNER_ONLY_TABLES,
  ...ROLE_BASED_TABLES,
  ...SERVICE_ROLE_INSERT_TABLES,
  ...MIXED_ACCESS_TABLES,
];
