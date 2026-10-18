import {
  LIMITED_PRACTICE_ROLES,
  PRACTICE_MODULE_LABELS,
  formatPracticeLimit,
  normalizeRole,
  type LimitedPracticeRole,
  type ManagedUser,
  type PracticeLimitOverride,
  type PracticeLimitRule,
  type PracticeLimitsOverview,
  type PracticeModule,
  type UserPracticeLimit,
} from "@trainers/types";
import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import { logActivity } from "./activity-log-service";
import {
  AdminUserError,
  assertManageableTarget,
  type AdminActor,
} from "./admin-user-service";
import { getPracticeQuotaStatus } from "./practice-quota";

/**
 * Editing daily practice limits (plans/markdown/kontrol-user-fase-4.md): the
 * role rules for agent and leader, and per-user exceptions with an optional
 * end date. Counting and enforcement stay in the database functions.
 */

const ROLE_LABEL: Record<LimitedPracticeRole, string> = {
  agent: "Agent",
  leader: "Leader",
};

/** Today's Asia/Jakarta date as YYYY-MM-DD. */
function wibToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function nameOf(profile: { full_name: string | null; email: string } | null) {
  return profile ? profile.full_name?.trim() || profile.email : null;
}

function isLimitedRole(role: string | null): role is LimitedPracticeRole {
  return (LIMITED_PRACTICE_ROLES as readonly string[]).includes(role ?? "");
}

type OverrideRow = {
  id: string;
  user_id: string;
  module: PracticeModule;
  daily_limit: number | null;
  ends_on: string | null;
  note: string | null;
  updated_at: string;
  target: {
    full_name: string | null;
    email: string;
    role: string;
    is_deleted: boolean;
  } | null;
  editor: { full_name: string | null; email: string } | null;
};

async function activeOverrides(): Promise<OverrideRow[]> {
  const today = wibToday();
  const rows = await fetchAllPages({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("practice_limit_overrides")
        .select(
          "id, user_id, module, daily_limit, ends_on, note, updated_at, target:profiles!user_id(full_name, email, role, is_deleted), editor:profiles!created_by(full_name, email)",
        )
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
  });
  return rows as unknown as OverrideRow[];
}

export async function getPracticeLimitsOverview(): Promise<PracticeLimitsOverview> {
  const [rules, overrides, today] = await Promise.all([
    supabaseAdmin
      .from("practice_limit_rules")
      .select(
        "module, role, daily_limit, updated_at, editor:profiles!updated_by(full_name, email)",
      ),
    activeOverrides(),
    supabaseAdmin.rpc("practice_today_summary"),
  ]);
  if (rules.error) throw rules.error;
  if (today.error) throw today.error;

  type RuleRow = Omit<PracticeLimitRule, "updated_by_name"> & {
    editor: { full_name: string | null; email: string } | null;
  };
  return {
    rules: ((rules.data ?? []) as unknown as RuleRow[]).map(
      ({ editor, ...rule }) => ({ ...rule, updated_by_name: nameOf(editor) }),
    ),
    overrides: overrides
      .filter((row) => row.target && !row.target.is_deleted)
      .map(({ target, editor, ...row }): PracticeLimitOverride => ({
        ...row,
        user_name: nameOf(target)!,
        user_role: target!.role,
        updated_by_name: nameOf(editor),
      })),
    today: today.data as PracticeLimitsOverview["today"],
  };
}

/** Exceptions in force today, per account, for the users list column. */
export async function getActiveOverridesByUser(): Promise<
  Map<string, NonNullable<ManagedUser["practice_overrides"]>>
> {
  const byUser = new Map<
    string,
    NonNullable<ManagedUser["practice_overrides"]>
  >();
  for (const row of await activeOverrides()) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({
      module: row.module,
      daily_limit: row.daily_limit,
      ends_on: row.ends_on,
    });
    byUser.set(row.user_id, list);
  }
  return byUser;
}

export async function updatePracticeRules(
  actor: AdminActor,
  rules: {
    module: PracticeModule;
    role: LimitedPracticeRole;
    daily_limit: number | null;
  }[],
): Promise<void> {
  const { data: before, error } = await supabaseAdmin
    .from("practice_limit_rules")
    .select("module, role, daily_limit");
  if (error) throw error;
  const current = new Map(
    (before ?? []).map((rule) => [
      `${rule.module}:${rule.role}`,
      rule.daily_limit,
    ]),
  );
  const changed = rules.filter(
    (rule) => current.get(`${rule.module}:${rule.role}`) !== rule.daily_limit,
  );
  if (!changed.length) return;

  const now = new Date().toISOString();
  const { error: saveError } = await supabaseAdmin
    .from("practice_limit_rules")
    .upsert(
      changed.map((rule) => ({
        ...rule,
        updated_at: now,
        updated_by: actor.id,
      })),
      { onConflict: "module,role" },
    );
  if (saveError) throw saveError;

  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    action: `Mengubah aturan batas latihan: ${changed
      .map(
        (rule) =>
          `${PRACTICE_MODULE_LABELS[rule.module]} ${ROLE_LABEL[rule.role]} ${formatPracticeLimit(current.get(`${rule.module}:${rule.role}`) ?? null)} menjadi ${formatPracticeLimit(rule.daily_limit)}`,
      )
      .join("; ")}`,
    module: "USER_MGMT",
    type: "practice_rules",
  });
}

async function limitedTarget(actor: AdminActor, userId: string) {
  const target = await assertManageableTarget(actor, userId);
  if (!isLimitedRole(normalizeRole(target.role)))
    throw new AdminUserError("NOT_LIMITED_ROLE");
  return target;
}

export async function setPracticeOverride(
  actor: AdminActor,
  userId: string,
  module: PracticeModule,
  input: {
    daily_limit: number | null;
    ends_on: string | null;
    note: string | null;
  },
): Promise<void> {
  const target = await limitedTarget(actor, userId);
  if (input.ends_on && input.ends_on < wibToday())
    throw new AdminUserError("PAST_END_DATE");
  const note = input.note?.trim() || null;
  const { error } = await supabaseAdmin.from("practice_limit_overrides").upsert(
    {
      user_id: userId,
      module,
      daily_limit: input.daily_limit,
      ends_on: input.ends_on,
      note,
      created_by: actor.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,module" },
  );
  if (error) throw error;

  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    target_user_id: userId,
    action: `Mengubah batas ${PRACTICE_MODULE_LABELS[module]} ${nameOf(target)} menjadi ${formatPracticeLimit(input.daily_limit)}${input.ends_on ? ` sampai ${formatDay(input.ends_on)}` : ""}${note ? ` (${note})` : ""}`,
    module: "USER_MGMT",
    type: "practice_override",
  });
}

export async function clearPracticeOverride(
  actor: AdminActor,
  userId: string,
  module: PracticeModule,
): Promise<void> {
  const target = await assertManageableTarget(actor, userId);
  const { data, error } = await supabaseAdmin
    .from("practice_limit_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("module", module)
    .select("id");
  if (error) throw error;
  if (!data?.length) return;
  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    target_user_id: userId,
    action: `Mengembalikan batas ${PRACTICE_MODULE_LABELS[module]} ${nameOf(target)} ke aturan peran`,
    module: "USER_MGMT",
    type: "practice_override",
  });
}

/** Today's limit per module for one account, with the role rule behind it. */
export async function getUserPracticeLimits(
  userId: string,
  role: string | null,
): Promise<UserPracticeLimit[]> {
  const [status, rules, overrides] = await Promise.all([
    getPracticeQuotaStatus(userId),
    supabaseAdmin
      .from("practice_limit_rules")
      .select("module, daily_limit")
      .eq("role", normalizeRole(role) ?? ""),
    supabaseAdmin
      .from("practice_limit_overrides")
      .select("module, note")
      .eq("user_id", userId),
  ]);
  if (rules.error) throw rules.error;
  if (overrides.error) throw overrides.error;
  const roleLimit = new Map(
    (rules.data ?? []).map((rule) => [rule.module, rule.daily_limit]),
  );
  const notes = new Map(
    (overrides.data ?? []).map((row) => [row.module, row.note]),
  );
  return status.map((entry) => ({
    ...entry,
    // A role without a rule cannot start (resolve_practice_limit fails closed).
    role_limit: roleLimit.has(entry.module) ? roleLimit.get(entry.module)! : 0,
    note:
      entry.source === "override" ? (notes.get(entry.module) ?? null) : null,
  }));
}
