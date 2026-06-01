import { Context, Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { UserProfile } from "@trainers/types";
import { createUserClient } from "../../lib/supabase";

export type Variables = { user: User; profile: UserProfile };
export type PdktHono = Hono<{ Variables: Variables }>;

/**
 * Extracts Bearer token from the Authorization header.
 */
export function getBearerToken(c: Context): string {
  const authHeader = c.req.header("Authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";
}

/**
 * Creates a Supabase user client using the current request's token.
 */
export function getUserClient(c: Context) {
  const token = getBearerToken(c);
  return createUserClient(token);
}

/**
 * Standard PDKT error message mapping.
 */
export function pdktErrorMessage(err: unknown): string {
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
      ? typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : String((err as { message: unknown }).message)
      : null;

  if (!message) return "Terjadi kesalahan yang tidak diketahui.";

  const msg = message.toLowerCase();
  if (msg.includes("duplicate key") || msg.includes("unique constraint"))
    return "Data sudah ada, tidak dapat membuat duplikat.";
  if (msg.includes("foreign key") || msg.includes("violates foreign key"))
    return "Data terkait tidak ditemukan atau rusak.";
  if (msg.includes("jwt expired") || msg.includes("token"))
    return "Sesi Anda telah berakhir. Silakan login kembali.";
  if (msg.includes("permission") || msg.includes("policy"))
    return "Anda tidak memiliki izin untuk melakukan tindakan ini.";
  return message;
}

/**
 * Standard 404 response for PDKT.
 */
export function jsonNotFound(c: Context, message: string) {
  return c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message },
    },
    404,
  );
}

/**
 * Standard 502 response for AI-related errors.
 */
export function jsonAiError(c: Context, message: string) {
  return c.json(
    {
      success: false,
      error: { code: "AI_ERROR", message },
    },
    502,
  );
}

/**
 * Standard 500 response for generic database/server errors.
 */
export function jsonServerError(c: Context, err: unknown) {
  return c.json(
    {
      success: false,
      error: { code: "DATABASE_ERROR", message: pdktErrorMessage(err) },
    },
    500,
  );
}
