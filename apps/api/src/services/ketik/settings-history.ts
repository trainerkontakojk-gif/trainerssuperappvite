import {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikSessionReview,
  KetikTypoFinding,
  ChatMessage,
  DEFAULT_KETIK_SETTINGS,
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
    quickTemplates:
      stored.quickTemplates || DEFAULT_KETIK_SETTINGS.quickTemplates,
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

export type KetikSettingsSnapshot = {
  settings: KetikAppSettings;
  version: string;
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

  return {
    settings:
      data?.settings?.ketik && typeof data.settings.ketik === "object"
        ? parseSettings(data.settings.ketik as Partial<KetikAppSettings>)
        : DEFAULT_KETIK_SETTINGS,
    version:
      typeof data?.updated_at === "string"
        ? data.updated_at
        : ABSENT_SETTINGS_VERSION,
  };
}

export async function getSettings(userId: string): Promise<KetikAppSettings> {
  try {
    return (await getSettingsSnapshot(userId)).settings;
  } catch {
    return DEFAULT_KETIK_SETTINGS;
  }
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
        ketik: settings,
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

export async function getHistory(
  userId: string,
): Promise<KetikSessionHistoryItem[]> {
  const adminClient = createAdminClient();

  let data, error;

  // Try 1: specific columns
  const res1 = await adminClient
    .from("ketik_history")
    .select(
      "id, date, created_at, scenario_title, consumer_name, consumer_phone, consumer_city, messages, simulation_duration, final_score, empathy_score, probing_score, resolution_score, typo_score, compliance_score, review_status",
    )
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(50);

  data = res1.data;
  error = res1.error;

  // Try 2: wildcard
  if (error) {
    const res2 = await adminClient
      .from("ketik_history")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(50);
    data = res2.data;
    error = res2.error;
  }

  // Try 3: results table fallback
  if (error) {
    const res3 = await adminClient
      .from("results")
      .select("session_id, created_at, metadata, score, status")
      .eq("user_id", userId)
      .eq("module", "ketik")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!res3.error && res3.data) {
      return res3.data.map((item: any) => ({
        id: item.session_id,
        date: item.created_at,
        scenarioTitle: item.metadata?.scenario_title || "Simulation Chat",
        consumerName: item.metadata?.consumer_name || "Consumer",
        consumerPhone: "",
        consumerCity: "",
        messages: [],
        simulationDuration: item.metadata?.simulation_duration,
        finalScore: item.score,
        reviewStatus: item.status || "pending",
      }));
    }
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    date: item.date || item.created_at,
    scenarioTitle: item.scenario_title || "Simulation Chat",
    consumerName: item.consumer_name || "Consumer",
    consumerPhone: item.consumer_phone,
    consumerCity: item.consumer_city,
    messages: Array.isArray(item.messages) ? item.messages : [],
    simulationDuration: item.simulation_duration,
    finalScore: item.final_score,
    empathyScore: item.empathy_score,
    probingScore: item.probing_score,
    resolutionScore: item.resolution_score ?? undefined,
    typoScore: item.typo_score,
    complianceScore: item.compliance_score,
    reviewStatus: item.review_status,
  }));
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

  const { data: history, error: historyError } = await adminClient
    .from("ketik_history")
    .select(
      "review_status, final_score, empathy_score, probing_score, resolution_score, typo_score, compliance_score",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (historyError || !history || history.review_status !== "completed")
    return null;

  const [{ data: reviewData }, { data: typosData }] = await Promise.all([
    adminClient
      .from("ketik_session_reviews")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle(),
    adminClient
      .from("ketik_typo_findings")
      .select("*")
      .eq("session_id", sessionId),
  ]);

  if (!reviewData) return null;

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
