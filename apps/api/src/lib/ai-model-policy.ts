import {
  AI_TASK_DEFINITIONS,
  AiTask,
  isAiTask,
  eligibleModelsForTask,
  AiModelPolicyItem,
  AiModelPolicyAuditEntry,
} from "@trainers/types";
import { readEffectivePricing } from "./ai-pricing-lookup";
import { createAdminClient } from "./supabase";
import { createTtlCache } from "./ttl-cache";

type AdminClient = ReturnType<typeof createAdminClient>;

interface PolicyRow {
  task: string;
  model_id: string;
  updated_by: string | null;
  updated_at: string;
}

interface AuditRow {
  id: string;
  task: string;
  old_model_id: string | null;
  new_model_id: string;
  changed_by: string | null;
  changed_at: string;
}

export class AiModelPolicyError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AiModelPolicyError";
  }
}

const policyCache = createTtlCache<"policy_map", Map<string, PolicyRow>>();

export function invalidateAiModelPolicyCache(): void {
  policyCache.invalidate();
}

async function loadPolicies(
  admin: AdminClient,
): Promise<Map<string, PolicyRow>> {
  try {
    const { data, error } = await admin
      .from("ai_model_policy")
      .select("task, model_id, updated_by, updated_at");
    if (error) {
      console.warn(
        "[ai-model-policy] Failed to load policies from DB:",
        error.message,
      );
      return new Map();
    }
    const map = new Map<string, PolicyRow>();
    for (const row of data ?? []) {
      map.set(row.task, row);
    }
    return map;
  } catch (err) {
    console.warn(
      "[ai-model-policy] Unexpected error reading ai_model_policy:",
      err,
    );
    return new Map();
  }
}

/**
 * Resolves the active model ID for a given task.
 * Primary path: database policy row (cached 60s).
 * Bounded fallback: codeDefault if row is missing, invalid, or DB is unavailable.
 */
export async function resolveTaskModel(
  task: AiTask,
): Promise<{ modelId: string; source: "policy" | "code" }> {
  const def = AI_TASK_DEFINITIONS[task];
  if (!def) {
    throw new Error(`Unknown AI task: ${task}`);
  }

  try {
    const admin = createAdminClient();
    const policies = await policyCache.get("policy_map", () =>
      loadPolicies(admin),
    );
    const row = policies.get(task);

    if (row && row.model_id) {
      // Validate that the model is still in eligibleModelsForTask
      const eligible = eligibleModelsForTask(task);
      const isEligible = eligible.some((m) => m.id === row.model_id);
      if (isEligible) {
        return { modelId: row.model_id, source: "policy" };
      }
      console.warn(
        `[ai-model-policy] Policy model "${row.model_id}" for task "${task}" is not eligible. Falling back to code default "${def.codeDefault}".`,
      );
    }
  } catch (err) {
    console.warn(
      `[ai-model-policy] Error resolving task model for "${task}":`,
      err,
    );
  }

  return { modelId: def.codeDefault, source: "code" };
}

/**
 * Returns all task policies, eligible models, and pricing availability for Monitoring -> Model.
 */
export async function listTaskModelPolicies(
  admin: AdminClient,
): Promise<AiModelPolicyItem[]> {
  const policies = await policyCache.get("policy_map", () =>
    loadPolicies(admin),
  );

  const tasks = Object.keys(AI_TASK_DEFINITIONS) as AiTask[];
  const modelIds = [
    ...new Set(
      tasks.flatMap((task) => eligibleModelsForTask(task).map((m) => m.id)),
    ),
  ];
  const at = new Date();
  const pricedModels = await Promise.all(
    modelIds.map(async (id) =>
      (await readEffectivePricing(admin, id, at)) ? id : null,
    ),
  );
  const modelsWithPricing = new Set(pricedModels.filter((id) => id !== null));

  const result: AiModelPolicyItem[] = [];

  for (const task of tasks) {
    const def = AI_TASK_DEFINITIONS[task];
    const row = policies.get(task);
    const eligible = eligibleModelsForTask(task).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      hasPricing: modelsWithPricing.has(m.id),
    }));

    let modelId = def.codeDefault;
    let source: "policy" | "code" = "code";

    if (row && row.model_id && eligible.some((m) => m.id === row.model_id)) {
      modelId = row.model_id;
      source = "policy";
    }

    result.push({
      task,
      label: def.label,
      description: def.description,
      modelId,
      source,
      codeDefault: def.codeDefault,
      eligible,
      updatedBy: row?.updated_by ?? null,
      updatedAt: row?.updated_at
        ? new Date(row.updated_at).toISOString()
        : null,
    });
  }

  return result;
}

/**
 * Updates or sets the policy for a task via atomic RPC.
 */
export async function setTaskModelPolicy(
  admin: AdminClient,
  task: string,
  modelId: string,
  actorUserId: string,
): Promise<void> {
  if (!isAiTask(task)) {
    throw new AiModelPolicyError(
      400,
      "TASK_UNKNOWN",
      `Tugas "${task}" tidak dikenal.`,
    );
  }

  const def = AI_TASK_DEFINITIONS[task];
  const eligible = eligibleModelsForTask(task);
  const model = eligible.find((m) => m.id === modelId);

  if (!model) {
    throw new AiModelPolicyError(
      400,
      "MODEL_NOT_ELIGIBLE",
      `Model "${modelId}" tidak terdaftar atau tidak memenuhi kapabilitas untuk tugas "${def.label}".`,
    );
  }

  const pricing = await readEffectivePricing(admin, modelId);

  if (!pricing) {
    throw new AiModelPolicyError(
      400,
      "MODEL_NO_PRICING",
      `Model "${model.name}" belum memiliki pengaturan harga. Atur harga terlebih dahulu di tab Harga.`,
    );
  }

  // Guard: ketik_review_fallback cannot be the same as effective ketik_review
  if (task === "ketik_review_fallback") {
    const primary = await resolveTaskModel("ketik_review");
    if (primary.modelId === modelId) {
      throw new AiModelPolicyError(
        400,
        "FALLBACK_SAME_AS_PRIMARY",
        "Model fallback tidak boleh sama dengan model review KETIK utama.",
      );
    }
  } else if (task === "ketik_review") {
    const fallback = await resolveTaskModel("ketik_review_fallback");
    if (fallback.modelId === modelId) {
      throw new AiModelPolicyError(
        400,
        "FALLBACK_SAME_AS_PRIMARY",
        "Model review KETIK utama tidak boleh sama dengan model fallback yang sedang aktif.",
      );
    }
  }

  const { error } = await admin.rpc("ai_model_policy_set", {
    p_task: task,
    p_model_id: modelId,
    p_actor: actorUserId,
  });

  if (error) {
    console.error("[ai-model-policy] RPC ai_model_policy_set error:", error);
    throw new AiModelPolicyError(
      500,
      "DB_ERROR",
      "Gagal menyimpan kebijakan model AI. Coba lagi beberapa saat lagi.",
    );
  }

  invalidateAiModelPolicyCache();
}

/**
 * Deletes a task policy row, reverting to codeDefault and logging to audit.
 */
export async function deleteTaskModelPolicy(
  admin: AdminClient,
  task: string,
  actorUserId: string,
): Promise<void> {
  if (!isAiTask(task)) {
    throw new AiModelPolicyError(
      400,
      "TASK_UNKNOWN",
      `Tugas "${task}" tidak dikenal.`,
    );
  }

  const def = AI_TASK_DEFINITIONS[task];

  const { error } = await admin.rpc("ai_model_policy_reset", {
    p_task: task,
    p_default_model_id: def.codeDefault,
    p_actor: actorUserId,
  });
  if (error) {
    console.error("[ai-model-policy] Reset policy error:", error);
    throw new AiModelPolicyError(
      500,
      "DB_ERROR",
      "Gagal mengembalikan pengaturan model AI.",
    );
  }

  invalidateAiModelPolicyCache();
}

/**
 * Lists audit logs for AI model policy changes.
 */
export async function listTaskModelPolicyAudit(
  admin: AdminClient,
  limit = 20,
): Promise<AiModelPolicyAuditEntry[]> {
  const { data, error } = await admin
    .from("ai_model_policy_audit")
    .select("id, task, old_model_id, new_model_id, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ai-model-policy] List audit error:", error);
    return [];
  }

  const rows = (data ?? []) as AuditRow[];
  const userIds = Array.from(
    new Set(
      rows.map((r) => r.changed_by).filter((id): id is string => Boolean(id)),
    ),
  );

  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (profileError) {
      console.error(
        "[ai-model-policy] Audit profile lookup failed:",
        profileError.message,
      );
    }
    if (profiles) {
      nameMap = new Map(profiles.map((p) => [p.id, p.full_name ?? ""]));
    }
  }

  return rows.map((row) => ({
    id: row.id,
    task: row.task as AiTask,
    oldModelId: row.old_model_id,
    newModelId: row.new_model_id,
    changedBy: row.changed_by,
    changedByName: row.changed_by
      ? (nameMap.get(row.changed_by) ?? null)
      : null,
    changedAt: new Date(row.changed_at).toISOString(),
  }));
}

export interface KetikReviewModels {
  primary: string;
  fallback: string;
}
export async function resolveKetikReviewModels(): Promise<KetikReviewModels> {
  const [primary, fallback] = await Promise.all([
    resolveTaskModel("ketik_review"),
    resolveTaskModel("ketik_review_fallback"),
  ]);
  return { primary: primary.modelId, fallback: fallback.modelId };
}
