import type { SupabaseClient } from "@supabase/supabase-js";

export const SETTINGS_CONFLICT_CODE = "SETTINGS_CONFLICT" as const;

export class SettingsConflictError extends Error {
  readonly code = SETTINGS_CONFLICT_CODE;
  readonly status = 409 as const;

  constructor(
    message = "Pengaturan berubah di tempat lain. Silakan muat ulang dan coba lagi.",
  ) {
    super(message);
    this.name = "SettingsConflictError";
  }
}

export function isSettingsConflictError(
  error: unknown,
): error is SettingsConflictError {
  return (
    error instanceof SettingsConflictError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === SETTINGS_CONFLICT_CODE)
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

export const ABSENT_SETTINGS_VERSION = "absent" as const;
export type SettingsVersion = string;

type SettingsRow = {
  settings?: unknown;
  updated_at?: unknown;
};

export type GuardedSettingsWriteResult = Record<string, unknown> & {
  settings?: unknown;
  updated_at: string;
};

/**
 * Performs a namespaced user_settings read/modify/write with a client-version
 * check and an optimistic compare-and-swap on the row's existing updated_at.
 */
export async function guardedUserSettingsWrite(
  client: SupabaseClient,
  userId: string,
  buildSettings: (existingSettings: unknown) => Record<string, unknown>,
  expectedVersion?: SettingsVersion,
): Promise<GuardedSettingsWriteResult> {
  const { data, error: readError } = await client
    .from("user_settings")
    .select("settings, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw readError;

  const existing = (data as SettingsRow | null) ?? null;
  if (expectedVersion !== undefined) {
    const matchesExpectedVersion =
      expectedVersion === ABSENT_SETTINGS_VERSION
        ? existing === null
        : existing !== null && existing.updated_at === expectedVersion;
    if (!matchesExpectedVersion) throw new SettingsConflictError();
  }

  const nextSettings = buildSettings(existing?.settings);
  const updatedAt = new Date().toISOString();

  if (!existing) {
    const { data: inserted, error: insertError } = await client
      .from("user_settings")
      .insert({
        user_id: userId,
        settings: nextSettings,
        updated_at: updatedAt,
      })
      .select()
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        throw new SettingsConflictError();
      }
      throw insertError;
    }
    const insertedAt = (inserted as SettingsRow | null)?.updated_at;
    if (!inserted || typeof insertedAt !== "string") {
      throw new SettingsConflictError();
    }
    return {
      ...(inserted as Record<string, unknown>),
      updated_at: insertedAt,
    };
  }

  if (typeof existing.updated_at !== "string") {
    throw new SettingsConflictError();
  }

  const { data: updated, error: updateError } = await client
    .from("user_settings")
    .update({
      user_id: userId,
      settings: nextSettings,
      updated_at: updatedAt,
    })
    .eq("user_id", userId)
    .eq("updated_at", existing.updated_at)
    .select()
    .maybeSingle();

  if (updateError) throw updateError;
  const updatedAtValue = (updated as SettingsRow | null)?.updated_at;
  if (!updated || typeof updatedAtValue !== "string") {
    throw new SettingsConflictError();
  }

  return {
    ...(updated as Record<string, unknown>),
    updated_at: updatedAtValue,
  };
}
