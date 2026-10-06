import {
  can,
  type Capability,
  type Role,
  type ServiceType,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import { getLeaderScopeSnapshot } from "./leader-scope";

export type DataScope =
  | { kind: "all" }
  | { kind: "self"; pesertaId: string }
  | { kind: "team"; pesertaIds: string[]; services: ServiceType[] }
  | {
      kind: "none";
      reason: "unlinked" | "not_approved" | "empty_scope";
      services?: ServiceType[];
    };

export { ScopeUnavailableError } from "./errors";
import { ScopeUnavailableError } from "./errors";

/** trainer_id is the account linked to a participant, not the trainer owner. */
export async function getLinkedPesertaId(
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id")
    .eq("trainer_id", userId)
    .maybeSingle();
  if (error) throw new ScopeUnavailableError();
  return data?.id ?? null;
}

export async function resolveDataScope(
  actor: { id: string; role: Role | null },
  module: "sidak" | "ktp",
): Promise<DataScope> {
  if (can(actor.role, "participants.readAll")) return { kind: "all" };
  if (actor.role === "agent") {
    const pesertaId = await getLinkedPesertaId(actor.id);
    return pesertaId
      ? { kind: "self", pesertaId }
      : { kind: "none", reason: "unlinked" };
  }
  if (actor.role !== "leader") return { kind: "none", reason: "not_approved" };
  const snapshot = await getLeaderScopeSnapshot(actor.id, module);
  if (snapshot.requestIds.length === 0)
    return { kind: "none", reason: "not_approved" };
  if (snapshot.pesertaIds.length === 0)
    return {
      kind: "none",
      reason: "empty_scope",
      services: snapshot.serviceTypes,
    };
  return {
    kind: "team",
    pesertaIds: snapshot.pesertaIds,
    services: snapshot.serviceTypes,
  };
}

/** Adapter for existing service signatures while their callers migrate to DataScope. */
export function pesertaScopeFromIds(
  ids: readonly string[] | null | undefined,
): DataScope {
  if (ids == null) return { kind: "all" };
  return ids.length
    ? { kind: "team", pesertaIds: [...ids], services: [] }
    : { kind: "none", reason: "empty_scope" };
}

export function scopePesertaIds(scope: DataScope): string[] | null {
  if (scope.kind === "all") return null;
  if (scope.kind === "self") return [scope.pesertaId];
  return scope.kind === "team" ? scope.pesertaIds : [];
}

/** in([]) has no matches, including for a malformed empty team scope. */
export function applyPesertaScope<
  Q extends { in: (column: string, ids: readonly string[]) => unknown },
>(query: Q, scope: DataScope, column = "peserta_id"): Q {
  const ids = scopePesertaIds(scope);
  return ids === null ? query : (query.in(column, ids) as Q);
}

export function isPesertaInScope(scope: DataScope, pesertaId: string): boolean {
  const ids = scopePesertaIds(scope);
  return ids === null || ids.includes(pesertaId);
}

/** Account-owned histories/settings must never be filtered by participant ID. */
export type AccountScope = { kind: "all" } | { kind: "self"; userId: string };
export function resolveAccountScope(actor: {
  id: string;
  role: Role | null;
}): Extract<AccountScope, { kind: "self" }>;
export function resolveAccountScope(
  actor: { id: string; role: Role | null },
  manage: Capability,
): AccountScope;
export function resolveAccountScope(
  actor: { id: string; role: Role | null },
  manage?: Capability,
): AccountScope {
  return manage && can(actor.role, manage)
    ? { kind: "all" }
    : { kind: "self", userId: actor.id };
}
export function isAccountInScope(
  scope: AccountScope,
  ownerId: string,
): boolean {
  return scope.kind === "all" || scope.userId === ownerId;
}
