import { Context, Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { UserProfile, type SimulationSubjectSnapshot } from "@trainers/types";
import { createUserClient } from "../../lib/supabase";
import { resolveSimulationSubjectSnapshot } from "../../services/simulation-subject-service";

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
 * Resolve a submitted selection with the request JWT. The service-role
 * profiler client is intentionally not used for this boundary lookup.
 */
export async function resolveRequestSimulationSubject(
  c: Context,
  selection: unknown,
): Promise<SimulationSubjectSnapshot> {
  const user = c.get("user") as User;
  const profile = c.get("profile") as UserProfile;
  let userClient: ReturnType<typeof getUserClient> | undefined;

  return resolveSimulationSubjectSnapshot(
    {
      id: user.id,
      role: profile?.role,
      full_name: profile?.full_name,
      status: profile?.status,
      is_deleted: profile?.is_deleted,
    },
    selection,
    {
      getPesertaById: async (id) => {
        userClient ??= getUserClient(c);
        const { data, error } = await userClient
          .from("profiler_peserta")
          .select("id, nama, batch_name, tim")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
    },
  );
}

function errorText(err: unknown): string | null {
  return typeof err === "string"
    ? err
    : err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : String((err as { message: unknown }).message)
        : null;
}

function errorCode(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : null;
}

/**
 * Stable status mapping for PDKT RPC/service failures. Only explicit status
 * fields and known database markers are classified; generic DB failures stay
 * server errors instead of being misreported as not-found.
 */
export function pdktErrorStatus(err: unknown, fallback = 500): number {
  const explicitStatus =
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  if (explicitStatus !== null) return explicitStatus;

  const code = errorCode(err);
  if (code === "PGRST301" || code === "401" || code === "JWT_EXPIRED") {
    return 401;
  }
  if (code === "42501") return 403;
  if (code === "PGRST116") return 404;
  if (code === "23505") return 409;
  if (code === "22P02" || code === "23514") return 400;

  const message = errorText(err)?.toLowerCase() || "";
  if (
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("policy")
  )
    return 403;
  if (
    message.includes("not_found") ||
    message.includes("mailbox item not found") ||
    message.includes("peserta tidak ditemukan")
  )
    return 404;
  if (
    message.includes("conflict") ||
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("already exists") ||
    message.includes("cannot reply to a deleted")
  )
    return 409;
  if (message.includes("validation_error")) return 400;
  return fallback;
}

/**
 * Standard PDKT error message mapping.
 */
export function pdktErrorMessage(err: unknown): string {
  const original = errorText(err);
  if (!original) return "Terjadi kesalahan yang tidak diketahui.";

  const explicitStatus =
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  if (explicitStatus === 401) {
    return "Sesi Anda telah berakhir. Silakan login kembali.";
  }

  const msg = original.toLowerCase();
  if (msg.includes("duplicate key") || msg.includes("unique constraint"))
    return "Data sudah ada, tidak dapat membuat duplikat.";
  if (msg.includes("conflict") && msg.includes("idempotency"))
    return "Idempotency key digunakan untuk target berbeda.";
  if (msg.includes("cannot reply to a deleted"))
    return "Email yang sudah dihapus tidak dapat dibalas.";
  if (
    msg.includes("mailbox item not found") ||
    msg.includes("mailbox tidak ditemukan")
  )
    return "Email mailbox tidak ditemukan.";
  if (msg.includes("participant reply requires"))
    return "Hanya admin/trainer yang dapat membalas email bertarget peserta.";
  if (msg.includes("participant attribution requires"))
    return "Hanya admin/trainer yang dapat memilih peserta.";
  if (msg.includes("foreign key") || msg.includes("violates foreign key"))
    return "Data terkait tidak ditemukan atau rusak.";
  if (msg.includes("jwt expired") || msg.includes("token"))
    return "Sesi Anda telah berakhir. Silakan login kembali.";
  if (msg.includes("permission") || msg.includes("policy"))
    return "Anda tidak memiliki izin untuk melakukan tindakan ini.";
  if (msg.includes("validation")) return "Data mailbox tidak valid.";
  if (msg.includes("hanya dapat menghapus"))
    return "Anda hanya dapat menghapus email yang Anda buat sendiri.";

  // Never echo an unclassified database/provider message. PostgREST errors
  // commonly contain table names, constraints, SQL fragments, or function
  // signatures that are useful in logs but unsafe for a client response.
  return "Terjadi kesalahan saat memproses permintaan.";
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
  const status = pdktErrorStatus(err);
  const code =
    status === 400
      ? "VALIDATION_ERROR"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : status === 401
              ? "UNAUTHORIZED"
              : "DATABASE_ERROR";
  return c.json(
    {
      success: false,
      error: { code, message: pdktErrorMessage(err) },
    },
    status as any,
  );
}
