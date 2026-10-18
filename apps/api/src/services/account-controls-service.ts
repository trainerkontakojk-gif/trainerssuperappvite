import {
  wibToday,
  type BulkUserResponse,
  type BulkUserResult,
  type LinkedPesertaSummary,
  type PesertaSuggestion,
  type PracticeModule,
} from "@trainers/types";
import { supabaseAdmin } from "../lib/supabase";
import { approveUser, updateUserStatus } from "./admin-service";
import {
  AdminUserError,
  assertManageableTarget,
  setActiveUntil,
  type AdminActor,
} from "./admin-user-service";
import {
  clearPracticeOverride,
  setPracticeOverride,
} from "./practice-limits-service";

/**
 * Bulk actions on the users list (plans/markdown/kontrol-user-fase-5b.md).
 * Each person goes through the same single-account function, so the same
 * checks apply; one failure never stops the others.
 */

/** Accounts changed at the same time; keeps a 100-person batch quick. */
const CONCURRENCY = 5;

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      row.full_name?.trim() || row.email || row.id,
    ]),
  );
}

function failureMessage(error: unknown): string {
  if (error instanceof AdminUserError) return error.message;
  console.error("[admin] bulk user change failed", error);
  return "Gagal diproses. Coba lagi.";
}

async function forEachUser(
  ids: string[],
  change: (userId: string) => Promise<void>,
): Promise<BulkUserResponse> {
  const names = await namesOf(ids);
  const results: BulkUserResult[] = [];
  for (let start = 0; start < ids.length; start += CONCURRENCY) {
    const batch = ids.slice(start, start + CONCURRENCY);
    results.push(
      ...(await Promise.all(
        batch.map(async (userId): Promise<BulkUserResult> => {
          const name = names.get(userId) ?? "Akun tidak dikenal";
          try {
            await change(userId);
            return { user_id: userId, name, ok: true, error: null };
          } catch (error) {
            return {
              user_id: userId,
              name,
              ok: false,
              error: failureMessage(error),
            };
          }
        }),
      )),
    );
  }
  return { results };
}

/** A day already past refuses the whole request, before anyone changes. */
function assertNotPast(day: string | null | undefined) {
  if (day && day < wibToday()) throw new AdminUserError("PAST_END_DATE");
}

export function bulkApprove(
  actor: AdminActor,
  input: {
    user_ids: string[];
    role: string;
    active_until: string | null;
    links: { user_id: string; peserta_id: string }[];
  },
): Promise<BulkUserResponse> {
  assertNotPast(input.active_until);
  const links = new Map(
    input.links.map((link) => [link.user_id, link.peserta_id]),
  );
  return forEachUser(input.user_ids, (userId) =>
    approveUser(
      actor,
      userId,
      input.role,
      links.get(userId) ?? null,
      input.active_until,
    ),
  );
}

/** Tangguhkan: active accounts only; their open logins end. */
export function bulkSuspend(
  actor: AdminActor,
  userIds: string[],
): Promise<BulkUserResponse> {
  return forEachUser(userIds, async (userId) => {
    const target = await assertManageableTarget(actor, userId);
    if (target.status !== "active") throw new AdminUserError("NOT_ACTIVE");
    await updateUserStatus(
      userId,
      "pending",
      actor.id,
      actor.email,
      actor.role ?? "",
    );
  });
}

export function bulkActiveUntil(
  actor: AdminActor,
  userIds: string[],
  day: string | null,
): Promise<BulkUserResponse> {
  assertNotPast(day);
  return forEachUser(userIds, (userId) => setActiveUntil(actor, userId, day));
}

export function bulkPracticeLimit(
  actor: AdminActor,
  input: {
    user_ids: string[];
    module: PracticeModule;
    limit: {
      daily_limit: number | null;
      ends_on: string | null;
      note: string | null;
    } | null;
  },
): Promise<BulkUserResponse> {
  const { limit, module } = input;
  assertNotPast(limit?.ends_on);
  return forEachUser(input.user_ids, (userId) =>
    limit
      ? setPracticeOverride(actor, userId, module, limit)
      : clearPracticeOverride(actor, userId, module),
  );
}

/**
 * For each account, the unlinked KTP participant whose Email OJK equals the
 * account email (case-insensitive). A suggestion only; nothing is linked.
 */
export async function pesertaSuggestions(
  userIds: string[],
): Promise<PesertaSuggestion[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .in("id", userIds)
    .eq("is_deleted", false);
  if (error) throw error;
  const emails = new Map(
    (data ?? []).map((row) => [row.id, row.email?.trim() ?? ""]),
  );
  const found = new Map<string, LinkedPesertaSummary>();
  for (let start = 0; start < userIds.length; start += CONCURRENCY * 2) {
    await Promise.all(
      userIds.slice(start, start + CONCURRENCY * 2).map(async (userId) => {
        const email = emails.get(userId);
        if (!email) return;
        const { data: match, error: matchError } = await supabaseAdmin
          .from("profiler_peserta")
          .select("id, nama, batch_name, tim")
          // ilike for case only: escape the LIKE wildcards an email can contain.
          .ilike("email_ojk", email.replace(/[\\%_]/g, "\\$&"))
          .is("akun_id", null)
          .order("nama")
          .limit(1)
          .maybeSingle();
        if (matchError) throw matchError;
        if (match) found.set(userId, match);
      }),
    );
  }
  return userIds.map((userId) => ({
    user_id: userId,
    peserta: found.get(userId) ?? null,
  }));
}
