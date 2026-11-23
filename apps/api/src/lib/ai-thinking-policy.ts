import {
  AI_MODELS,
  SELECTABLE_MODELS,
  AI_THINKING_SCOPE_DEFINITIONS,
  AI_THINKING_SCOPES,
  isAiThinkingLevel,
  isAiThinkingScope,
  type AiThinkingLevel,
  type AiThinkingPolicyListResponse,
  type AiThinkingPolicyAuditEntry,
  type AiThinkingScope,
} from "@trainers/types";
import { createAdminClient } from "./supabase";
import { createTtlCache } from "./ttl-cache";

type AdminClient = ReturnType<typeof createAdminClient>;

interface PolicyRow {
  scope: string;
  thinking_level: string | null;
  updated_by: string | null;
  updated_at: string;
}

interface AuditRow {
  id: string;
  scope: string;
  old_thinking_level: string | null;
  new_thinking_level: string | null;
  changed_by: string | null;
  changed_at: string;
}

export class AiThinkingPolicyError extends Error {
  constructor(
    readonly status: 400 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AiThinkingPolicyError";
  }
}

const policyCache = createTtlCache<"policy_map", Map<string, PolicyRow>>();

export function invalidateAiThinkingPolicyCache(): void {
  policyCache.invalidate();
}

async function loadPolicies(
  admin: AdminClient,
): Promise<Map<string, PolicyRow>> {
  try {
    const { data, error } = await admin
      .from("ai_thinking_policy")
      .select("scope, thinking_level, updated_by, updated_at");
    if (error) {
      console.warn(
        "[ai-thinking-policy] Failed to load policies from DB:",
        error.message,
      );
      return new Map();
    }
    return new Map((data ?? []).map((row) => [row.scope, row]));
  } catch (error) {
    console.warn("[ai-thinking-policy] Unexpected DB read error:", error);
    return new Map();
  }
}

async function getPolicyMap(
  admin = createAdminClient(),
): Promise<Map<string, PolicyRow>> {
  return policyCache.get("policy_map", () => loadPolicies(admin));
}

function effectiveLevel(
  scope: AiThinkingScope,
  row: PolicyRow | undefined,
): { thinkingLevel: AiThinkingLevel | null; source: "policy" | "code" } {
  const codeDefault = AI_THINKING_SCOPE_DEFINITIONS[scope].codeDefault;
  if (!row) return { thinkingLevel: codeDefault, source: "code" };
  if (row.thinking_level === null)
    return { thinkingLevel: null, source: "policy" };
  if (isAiThinkingLevel(row.thinking_level))
    return { thinkingLevel: row.thinking_level, source: "policy" };

  console.warn(
    `[ai-thinking-policy] Invalid stored level for "${scope}"; using code default.`,
  );
  return { thinkingLevel: codeDefault, source: "code" };
}

/**
 * Resolves a configured level against the model selected for this exact call.
 * Unsupported, unknown, unverified, and non-Gemini models receive no level.
 */
export async function resolveAiThinkingLevel(
  scope: AiThinkingScope,
  effectiveModelId: string,
): Promise<AiThinkingLevel | undefined> {
  const model = AI_MODELS.find((candidate) => candidate.id === effectiveModelId);
  if (model?.provider !== "gemini") return undefined;
  const supportedLevels = model.supportedThinkingLevels;
  if (!supportedLevels) return undefined;

  const policies = await getPolicyMap();
  const { thinkingLevel } = effectiveLevel(scope, policies.get(scope));
  return thinkingLevel && supportedLevels.includes(thinkingLevel)
    ? thinkingLevel
    : undefined;
}

export async function listAiThinkingPolicies(
  admin: AdminClient,
): Promise<AiThinkingPolicyListResponse> {
  const policies = await getPolicyMap(admin);
  const items = AI_THINKING_SCOPES.map((scope) => {
    const definition = AI_THINKING_SCOPE_DEFINITIONS[scope];
    const row = policies.get(scope);
    const effective = effectiveLevel(scope, row);
    return {
      scope,
      label: definition.label,
      description: definition.description,
      thinkingLevel: effective.thinkingLevel,
      source: effective.source,
      codeDefault: definition.codeDefault,
      updatedBy: row?.updated_by ?? null,
      updatedAt: row?.updated_at
        ? new Date(row.updated_at).toISOString()
        : null,
    };
  });
  const models = SELECTABLE_MODELS.filter(
    (model) =>
      model.provider === "gemini" &&
      model.capabilities?.supportsText &&
      !model.realtime,
  ).map((model) => ({
    id: model.id,
    name: model.name,
    supportedLevels: model.supportedThinkingLevels ?? null,
  }));
  return { items, models };
}

export async function listAiThinkingPolicyAudit(
  admin: AdminClient,
  limit = 20,
): Promise<AiThinkingPolicyAuditEntry[]> {
  const { data, error } = await admin
    .from("ai_thinking_policy_audit")
    .select(
      "id, scope, old_thinking_level, new_thinking_level, changed_by, changed_at",
    )
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ai-thinking-policy] List audit error:", error.message);
    return [];
  }
  const rows = (data ?? []) as AuditRow[];
  const userIds = Array.from(
    new Set(rows.map((row) => row.changed_by).filter((id): id is string => !!id)),
  );
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (profileError) {
      console.error(
        "[ai-thinking-policy] Audit profile lookup failed:",
        profileError.message,
      );
    }
    if (profiles) nameMap = new Map(profiles.map((p) => [p.id, p.full_name ?? ""]));
  }

  return rows.flatMap((row) => {
    if (!isAiThinkingScope(row.scope)) return [];
    const toLevel = (level: string | null) =>
      level === null || isAiThinkingLevel(level) ? level : null;
    return [{
      id: row.id,
      scope: row.scope,
      oldThinkingLevel: toLevel(row.old_thinking_level),
      newThinkingLevel: toLevel(row.new_thinking_level),
      changedBy: row.changed_by,
      changedByName: row.changed_by ? nameMap.get(row.changed_by) ?? null : null,
      changedAt: new Date(row.changed_at).toISOString(),
    }];
  });
}

export async function setAiThinkingPolicy(
  admin: AdminClient,
  scope: string,
  thinkingLevel: unknown,
  actorUserId: string,
): Promise<void> {
  if (!isAiThinkingScope(scope)) {
    throw new AiThinkingPolicyError(400, "SCOPE_UNKNOWN", "Use case AI tidak dikenal.");
  }
  if (thinkingLevel !== null && !isAiThinkingLevel(thinkingLevel)) {
    throw new AiThinkingPolicyError(400, "LEVEL_INVALID", "Thinking level tidak valid.");
  }

  const { error } = await admin.rpc("ai_thinking_policy_set", {
    p_scope: scope,
    p_thinking_level: thinkingLevel,
    p_code_default: AI_THINKING_SCOPE_DEFINITIONS[scope].codeDefault,
    p_actor: actorUserId,
  });
  if (error) {
    console.error("[ai-thinking-policy] Set RPC failed:", error.message);
    throw new AiThinkingPolicyError(
      500,
      "DB_ERROR",
      "Gagal menyimpan thinking level. Coba lagi beberapa saat lagi.",
    );
  }
  invalidateAiThinkingPolicyCache();
}

export async function deleteAiThinkingPolicy(
  admin: AdminClient,
  scope: string,
  actorUserId: string,
): Promise<void> {
  if (!isAiThinkingScope(scope)) {
    throw new AiThinkingPolicyError(400, "SCOPE_UNKNOWN", "Use case AI tidak dikenal.");
  }
  const { error } = await admin.rpc("ai_thinking_policy_reset", {
    p_scope: scope,
    p_code_default: AI_THINKING_SCOPE_DEFINITIONS[scope].codeDefault,
    p_actor: actorUserId,
  });
  if (error) {
    console.error("[ai-thinking-policy] Reset RPC failed:", error.message);
    throw new AiThinkingPolicyError(
      500,
      "DB_ERROR",
      "Gagal mengembalikan thinking level ke bawaan kode.",
    );
  }
  invalidateAiThinkingPolicyCache();
}

