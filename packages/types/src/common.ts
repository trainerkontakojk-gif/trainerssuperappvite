import type { Role } from "./access";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status?: "pending" | "active" | "inactive";
  is_deleted?: boolean;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: string; message: string; details?: JsonValue };
    };
