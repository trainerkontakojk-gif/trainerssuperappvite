import {
  mapSimulationSubjectRowToSnapshot,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import {
  KetikAppSettings,
  KetikQuickTemplate,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikSessionReview,
  KetikTypoFinding,
  ChatMessage,
  DEFAULT_KETIK_SETTINGS,
  ketikQuickTemplateSchema,
  mergeKetikQuickTemplates,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import { buildKetikEducation } from "./review-policy";
import {
  DEFAULT_AI_MODEL_ID,
  KETIK_PDKT_MODELS,
  normalizeModelId,
} from "../../lib/ai-models";
import {
  ABSENT_SETTINGS_VERSION,
  guardedUserSettingsWrite,
  isSettingsConflictError,
} from "../../lib/guarded-user-settings";
import { getGlobalKetikQuickTemplatesSnapshot } from "./global-templates";

const coerceKetikModelId = (modelId?: string) => {
  const normalized = normalizeModelId(modelId);
  return KETIK_PDKT_MODELS.some((model) => model.id === normalized)
    ? normalized
    : DEFAULT_AI_MODEL_ID;
};

const coerceDuration = (duration?: number) => {
  if (typeof duration !== "number" || isNaN(duration)) return 5;
  return Math.max(1, Math.min(60, duration));
};

function parseKetikQuickTemplates(value: unknown): KetikQuickTemplate[] {
  const parsed = ketikQuickTemplateSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function preserveGlobalKeyPersonalTemplates(
  existingTemplates: KetikQuickTemplate[],
  globalTemplates: KetikQuickTemplate[],
): KetikQuickTemplate[] {
  const globalIds = new Set(globalTemplates.map((template) => template.id));
  const globalKeywords = new Set(
    globalTemplates.map((template) => template.keyword.trim().toLowerCase()),
  );
  return existingTemplates.filter(
    (template) =>
      globalIds.has(template.id) ||
      globalKeywords.has(template.keyword.trim().toLowerCase()),
  );
}

function dedupeKetikQuickTemplates(
  templates: KetikQuickTemplate[],
): KetikQuickTemplate[] {
  const seenIds = new Set<string>();
  return templates.filter((template) => {
    if (seenIds.has(template.id)) return false;
    seenIds.add(template.id);
    return true;
  });
}

function parseSettings(stored: Partial<KetikAppSettings>): KetikAppSettings {
  const mergedScenarios = DEFAULT_KETIK_SETTINGS.scenarios.map(
    (defaultItem) => {
      const existing = stored.scenarios?.find((s) => s.id === defaultItem.id);
      return existing
        ? { ...existing, description: defaultItem.description }
        : defaultItem;
    },
  );
  const customScenarios = (stored.scenarios || []).filter(
    (s) => !DEFAULT_KETIK_SETTINGS.scenarios.find((d) => d.id === s.id),
  );

  const mergedConsumers = DEFAULT_KETIK_SETTINGS.consumerTypes.map(
    (defaultItem) => {
      const existing = stored.consumerTypes?.find(
        (s) => s.id === defaultItem.id,
      );
      return existing
        ? { ...existing, description: defaultItem.description }
        : defaultItem;
    },
  );
  const customConsumers = (stored.consumerTypes || []).filter(
    (s) => !DEFAULT_KETIK_SETTINGS.consumerTypes.find((d) => d.id === s.id),
  );

  return {
    scenarios: [...mergedScenarios, ...customScenarios],
    consumerTypes: [...mergedConsumers, ...customConsumers],
    quickTemplates: parseKetikQuickTemplates(stored.quickTemplates),
    activeConsumerTypeId: stored.activeConsumerTypeId || "random",
    identitySettings: {
      displayName: stored.identitySettings?.displayName || "",
      signatureName: stored.identitySettings?.signatureName || "",
      phoneNumber: stored.identitySettings?.phoneNumber || "",
      city: stored.identitySettings?.city || "",
    },
    selectedModel: coerceKetikModelId(stored.selectedModel),
    simulationDuration: coerceDuration(stored.simulationDuration),
    responsePacingMode: stored.responsePacingMode || "realistic",
  };
}

function buildPersonalKetikSettings(
  settings: KetikAppSettings,
  existingSettings: unknown,
): Record<string, unknown> {
  const {
    globalQuickTemplates,
    personalQuickTemplates,
    ...settingsWithoutMetadata
  } = settings;
  const existingKetik =
    existingSettings && typeof existingSettings === "object"
      ? (existingSettings as { ketik?: unknown }).ketik
      : undefined;
  const existingPersonalTemplates =
    existingKetik && typeof existingKetik === "object"
      ? parseKetikQuickTemplates(
          (existingKetik as { quickTemplates?: unknown }).quickTemplates,
        )
      : [];
  const templatesToPersist = Array.isArray(personalQuickTemplates)
    ? dedupeKetikQuickTemplates([
        ...(Array.isArray(globalQuickTemplates)
          ? preserveGlobalKeyPersonalTemplates(
              existingPersonalTemplates,
              parseKetikQuickTemplates(globalQuickTemplates),
            )
          : []),
        ...personalQuickTemplates,
      ])
    : existingKetik && typeof existingKetik === "object"
      ? existingPersonalTemplates
      : parseKetikQuickTemplates(settings.quickTemplates);

  return {
    ...settingsWithoutMetadata,
    quickTemplates: templatesToPersist,
  };
}

export type KetikSettingsSnapshot = {
  settings: KetikAppSettings;
  version: string;
  globalTemplatesVersion: string;
};

export async function getSettingsSnapshot(
  userId: string,
): Promise<KetikSettingsSnapshot> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_settings")
    .select("settings, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  const globalTemplates = await getGlobalKetikQuickTemplatesSnapshot();
  const storedKetik =
    data?.settings?.ketik && typeof data.settings.ketik === "object"
      ? (data.settings.ketik as Partial<KetikAppSettings>)
      : undefined;
  const personalQuickTemplates = storedKetik
    ? parseKetikQuickTemplates(storedKetik.quickTemplates)
    : [];
  const baseSettings = storedKetik
    ? parseSettings(storedKetik)
    : DEFAULT_KETIK_SETTINGS;

  return {
    settings: {
      ...baseSettings,
      quickTemplates: mergeKetikQuickTemplates(
        globalTemplates.templates,
        personalQuickTemplates,
      ),
      globalQuickTemplates: globalTemplates.templates,
      personalQuickTemplates,
    },
    version:
      typeof data?.updated_at === "string"
        ? data.updated_at
        : ABSENT_SETTINGS_VERSION,
    globalTemplatesVersion: globalTemplates.version,
  };
}

export async function getSettings(userId: string): Promise<KetikAppSettings> {
  return (await getSettingsSnapshot(userId)).settings;
}

export async function saveSettings(
  userId: string,
  settings: KetikAppSettings,
  expectedVersion?: string,
): Promise<string> {
  const adminClient = createAdminClient();

  try {
    const saved = await guardedUserSettingsWrite(
      adminClient,
      userId,
      (existingSettings) => ({
        ...(existingSettings && typeof existingSettings === "object"
          ? existingSettings
          : {}),
        ketik: buildPersonalKetikSettings(settings, existingSettings),
      }),
      expectedVersion,
    );
    return saved.updated_at;
  } catch (error: unknown) {
    if (isSettingsConflictError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Gagal menyimpan pengaturan: ${message}`, {
      cause: error,
    });
  }
}

export async function persistSession(
  userId: string,
  params: {
    scenarioTitle: string;
    consumerName: string;
    consumerPhone: string;
    consumerCity: string;
    messages: ChatMessage[];
    simulationDuration?: number;
    simulationSubjectSnapshot?: SimulationSubjectSnapshot | null;
  },
): Promise<KetikSessionHistoryItem> {
  const adminClient = createAdminClient();

  const sessionData = {
    user_id: userId,
    date: new Date().toISOString(),
    scenario_title: params.scenarioTitle,
    consumer_name: params.consumerName,
    consumer_phone: params.consumerPhone,
    consumer_city: params.consumerCity,
    messages: params.messages,
    simulation_duration: params.simulationDuration,
    simulation_subject_type: params.simulationSubjectSnapshot?.type ?? "self",
    simulation_subject_peserta_id:
      params.simulationSubjectSnapshot?.participantId ?? null,
    simulation_subject_name:
      params.simulationSubjectSnapshot?.displayName ?? null,
    simulation_subject_batch_name:
      params.simulationSubjectSnapshot?.batchName ?? null,
    simulation_subject_team: params.simulationSubjectSnapshot?.team ?? null,
  };

  const { data, error } = await adminClient
    .from("ketik_history")
    .insert([sessionData])
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Gagal menyimpan sesi.");
  }

  // Dual-write to results table for legacy compatibility
  try {
    await adminClient.from("results").insert({
      user_id: userId,
      module: "ketik",
      session_id: data.id,
      created_at: new Date().toISOString(),
      metadata: {
        scenario_title: params.scenarioTitle,
        consumer_name: params.consumerName,
        simulation_duration: params.simulationDuration,
        simulation_subject: params.simulationSubjectSnapshot ?? null,
      },
    });
  } catch (err) {
    console.error(
      `[KETIK] Failed to dual-write to results table for session ${data.id}:`,
      err,
    );
  }

  return {
    id: data.id,
    date: data.date || data.created_at,
    scenarioTitle: data.scenario_title || params.scenarioTitle,
    consumerName: data.consumer_name || params.consumerName,
    consumerPhone: data.consumer_phone,
    consumerCity: data.consumer_city,
    messages: data.messages || params.messages,
    simulationDuration: data.simulation_duration,
    reviewStatus: data.review_status || "pending",
    simulationSubject: mapSimulationSubjectRowToSnapshot(data),
  };
}

export async function deleteSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("ketik_history")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Gagal menghapus sesi: ${error.message}`);

  // Dual-delete from results
  try {
    await adminClient
      .from("results")
      .delete()
      .eq("session_id", sessionId)
      .eq("module", "ketik");
  } catch (e) {
    console.error(e);
  }
}

export async function clearHistory(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("ketik_history")
    .delete()
    .eq("user_id", userId);

  if (error) throw new Error(`Gagal menghapus riwayat: ${error.message}`);

  // Dual-delete from results
  try {
    await adminClient
      .from("results")
      .delete()
      .eq("user_id", userId)
      .eq("module", "ketik");
  } catch (e) {
    console.error(e);
  }
}

export async function getReviewDetail(
  sessionId: string,
  userId: string,
): Promise<KetikReviewDetail | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc("read_ketik_review", {
    p_actor: userId,
    p_session: sessionId,
  });
  if (error) throw error;
  if (!data || data.history.review_status !== "completed" || !data.review)
    return null;
  const history = data.history;
  const reviewData = data.review;
  const typosData = data.typos;

  const review: KetikSessionReview = {
    id: reviewData.id,
    sessionId: reviewData.session_id,
    aiSummary: reviewData.ai_summary,
    strengths: reviewData.strengths,
    weaknesses: reviewData.weaknesses,
    coachingFocus: reviewData.coaching_focus,
    // Legacy rows (pre-education) get deterministic rule-based guidance from
    // stored scores — no AI rerun needed.
    education:
      reviewData.education ??
      buildKetikEducation(undefined, {
        final: history.final_score ?? 0,
        empathy: history.empathy_score ?? 0,
        probing: history.probing_score ?? 0,
        resolution: history.resolution_score ?? 0,
        typo: history.typo_score ?? 0,
        compliance: history.compliance_score ?? 0,
      }),
    createdAt: reviewData.created_at,
  };

  const typos: KetikTypoFinding[] = (typosData || []).map((t: any) => ({
    id: t.id,
    sessionId: t.session_id,
    messageId: t.message_id,
    originalWord: t.original_word,
    correctedWord: t.corrected_word,
    severity: t.severity,
    createdAt: t.created_at,
  }));

  return {
    sessionId,
    review,
    typos,
    scores: {
      final: history.final_score,
      empathy: history.empathy_score,
      probing: history.probing_score,
      resolution: history.resolution_score ?? undefined,
      typo: history.typo_score,
      compliance: history.compliance_score,
    },
  };
}
