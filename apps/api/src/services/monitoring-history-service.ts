import { createAdminClient } from "../lib/supabase";

export interface UnifiedHistoryEntry {
  id: string;
  user_id: string;
  module: "ketik" | "pdkt" | "telefun";
  scenario_title: string;
  created_at: string;
  duration_seconds: number;
  score: number | null;
  history: unknown;
  user_email?: string;
  user_role?: string;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function createTelefunSignature(
  entry: Pick<
    UnifiedHistoryEntry,
    "user_id" | "scenario_title" | "created_at" | "history"
  >,
): string {
  const recordingUrl = typeof entry.history === "string" ? entry.history : "";
  return [entry.user_id, entry.scenario_title, recordingUrl || entry.created_at]
    .join("::");
}

export async function getMonitoringHistory(): Promise<UnifiedHistoryEntry[]> {
  const admin = createAdminClient();

  const [ketikRes, pdktRes, telefunHistoryRes, telefunResultsRes] =
    await Promise.all([
      admin
        .from("ketik_history")
        .select("id, user_id, date, scenario_title, messages")
        .order("date", { ascending: false })
        .limit(200),
      admin
        .from("pdkt_history")
        .select(
          "id, user_id, timestamp, config, emails, evaluation, time_taken, evaluation_status",
        )
        .order("timestamp", { ascending: false })
        .limit(200),
      admin
        .from("telefun_history")
        .select("id, user_id, date, scenario_title, duration, recording_url")
        .order("date", { ascending: false })
        .limit(200),
      admin
        .from("results")
        .select("id, user_id, module, score, details, history, created_at")
        .eq("module", "telefun")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (ketikRes.error)
    console.error("[monitoring] Failed to read ketik_history:", ketikRes.error);
  if (pdktRes.error)
    console.error("[monitoring] Failed to read pdkt_history:", pdktRes.error);
  if (telefunHistoryRes.error)
    console.error("[monitoring] Failed to read telefun_history:", telefunHistoryRes.error);
  if (telefunResultsRes.error)
    console.error("[monitoring] Failed to read telefun results:", telefunResultsRes.error);

  const allUserIds = new Set<string>();
  (ketikRes.data || []).forEach((row) => allUserIds.add(row.user_id));
  (pdktRes.data || []).forEach((row) => allUserIds.add(row.user_id));
  (telefunHistoryRes.data || []).forEach((row) => allUserIds.add(row.user_id));
  (telefunResultsRes.data || []).forEach((row) => allUserIds.add(row.user_id));

  const profilesMap: Record<string, { email: string | null; role: string | null }> = {};
  if (allUserIds.size > 0) {
    const { data: profilesData, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("id", [...allUserIds]);

    if (profilesError) {
      console.error("[monitoring] Failed to read profiles:", profilesError);
    } else {
      (profilesData || []).forEach((profile) => {
        profilesMap[profile.id] = profile;
      });
    }
  }

  const unified: UnifiedHistoryEntry[] = [];

  (ketikRes.data || []).forEach((row) => {
    const messages = Array.isArray(row.messages) ? row.messages : [];
    const timestamps = messages
      .map((msg: { timestamp?: string }) =>
        new Date(msg.timestamp || "").getTime(),
      )
      .filter((t: number) => Number.isFinite(t));
    const durationSeconds =
      timestamps.length >= 2
        ? Math.floor((Math.max(...timestamps) - Math.min(...timestamps)) / 1000)
        : 0;

    unified.push({
      id: row.id,
      user_id: row.user_id,
      module: "ketik",
      scenario_title: safeString(row.scenario_title, "Simulasi Chat"),
      created_at: safeString(row.date, ""),
      duration_seconds: durationSeconds,
      score: null,
      history: row.messages,
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
    });
  });

  (pdktRes.data || []).forEach((row) => {
    const config =
      row.config && typeof row.config === "object" ? row.config : {};
    const evaluation =
      row.evaluation && typeof row.evaluation === "object"
        ? row.evaluation
        : {};

    unified.push({
      id: row.id,
      user_id: row.user_id,
      module: "pdkt",
      scenario_title: safeString(
        config?.scenarios?.[0]?.title,
        "Simulasi Email",
      ),
      created_at: safeString(row.timestamp, ""),
      duration_seconds: safeNumber(row.time_taken, 0),
      score:
        typeof evaluation?.score === "number" ? evaluation.score : null,
      history: Array.isArray(row.emails) ? row.emails : [],
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
    });
  });

  const telefunSeen = new Set<string>();

  (telefunResultsRes.data || []).forEach((row) => {
    const payload =
      row.details || row.history
        ? typeof row.details === "object"
          ? row.details
          : {}
        : {};
    const entry: UnifiedHistoryEntry = {
      id: row.id,
      user_id: row.user_id,
      module: "telefun",
      scenario_title: safeString(
        payload.scenario || payload.scenario_title,
        "Simulasi Telepon",
      ),
      created_at: safeString(row.created_at, ""),
      duration_seconds: safeNumber(payload.duration, 0),
      score: typeof row.score === "number" ? row.score : null,
      history: safeString(payload.recordingUrl, ""),
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
    };

    telefunSeen.add(createTelefunSignature(entry));
    unified.push(entry);
  });

  (telefunHistoryRes.data || []).forEach((row) => {
    const entry: UnifiedHistoryEntry = {
      id: row.id,
      user_id: row.user_id,
      module: "telefun",
      scenario_title: safeString(row.scenario_title, "Simulasi Telepon"),
      created_at: safeString(row.date, ""),
      duration_seconds: safeNumber(row.duration, 0),
      score: null,
      history: safeString(row.recording_url, ""),
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
    };

    const signature = createTelefunSignature(entry);
    if (!telefunSeen.has(signature)) {
      telefunSeen.add(signature);
      unified.push(entry);
    }
  });

  return unified.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
