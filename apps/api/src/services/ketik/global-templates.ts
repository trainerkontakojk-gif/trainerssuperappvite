import {
  DEFAULT_KETIK_QUICK_TEMPLATES,
  ketikQuickTemplateSchema,
  type KetikQuickTemplate,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import {
  ABSENT_SETTINGS_VERSION,
  SettingsConflictError,
} from "../../lib/guarded-user-settings";

type GlobalTemplatesRow = {
  quick_templates?: unknown;
  updated_at?: unknown;
};

type GlobalTemplatesSnapshot = {
  templates: KetikQuickTemplate[];
  version: string;
};

const GLOBAL_SETTINGS_KEY = "default";

function parseGlobalTemplates(value: unknown): KetikQuickTemplate[] {
  const parsed = ketikQuickTemplateSchema.array().safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_KETIK_QUICK_TEMPLATES;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function readGlobalTemplatesRow(): Promise<GlobalTemplatesRow | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("ketik_global_settings")
    .select("quick_templates, updated_at")
    .eq("key", GLOBAL_SETTINGS_KEY)
    .maybeSingle();

  if (error) throw error;
  return (data as GlobalTemplatesRow | null) ?? null;
}

export async function getGlobalKetikQuickTemplatesSnapshot(): Promise<GlobalTemplatesSnapshot> {
  const row = await readGlobalTemplatesRow();

  return {
    templates: row
      ? parseGlobalTemplates(row.quick_templates)
      : DEFAULT_KETIK_QUICK_TEMPLATES,
    version:
      typeof row?.updated_at === "string"
        ? row.updated_at
        : ABSENT_SETTINGS_VERSION,
  };
}

export async function getGlobalKetikQuickTemplates(): Promise<
  KetikQuickTemplate[]
> {
  return (await getGlobalKetikQuickTemplatesSnapshot()).templates;
}

export async function saveGlobalKetikQuickTemplates(
  templates: KetikQuickTemplate[],
  expectedVersion?: string,
): Promise<string> {
  const adminClient = createAdminClient();
  const { data: existing, error: readError } = await adminClient
    .from("ketik_global_settings")
    .select("quick_templates, updated_at")
    .eq("key", GLOBAL_SETTINGS_KEY)
    .maybeSingle();

  if (readError) throw readError;

  const current = (existing as GlobalTemplatesRow | null) ?? null;
  if (expectedVersion !== undefined) {
    const matchesExpectedVersion =
      expectedVersion === ABSENT_SETTINGS_VERSION
        ? current === null
        : current !== null && current.updated_at === expectedVersion;
    if (!matchesExpectedVersion) throw new SettingsConflictError();
  }

  const updatedAt = new Date().toISOString();
  if (!current) {
    const { data: inserted, error: insertError } = await adminClient
      .from("ketik_global_settings")
      .insert({
        key: GLOBAL_SETTINGS_KEY,
        quick_templates: templates,
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

    const insertedAt = (inserted as GlobalTemplatesRow | null)?.updated_at;
    if (!inserted || typeof insertedAt !== "string") {
      throw new SettingsConflictError();
    }
    return insertedAt;
  }

  if (typeof current.updated_at !== "string") {
    throw new SettingsConflictError();
  }

  const { data: updated, error: updateError } = await adminClient
    .from("ketik_global_settings")
    .update({
      key: GLOBAL_SETTINGS_KEY,
      quick_templates: templates,
      updated_at: updatedAt,
    })
    .eq("key", GLOBAL_SETTINGS_KEY)
    .eq("updated_at", current.updated_at)
    .select()
    .maybeSingle();

  if (updateError) throw updateError;

  const updatedAtValue = (updated as GlobalTemplatesRow | null)?.updated_at;
  if (!updated || typeof updatedAtValue !== "string") {
    throw new SettingsConflictError();
  }

  return updatedAtValue;
}
