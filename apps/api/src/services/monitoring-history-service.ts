import { createAdminClient } from "../lib/supabase";

export type ReviewStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

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
  review_status: ReviewStatus;
  scores?: {
    final?: number;
    empathy?: number;
    probing?: number;
    resolution?: number;
    typo?: number;
    compliance?: number;
  };
  pdkt_evaluation?: {
    score: number;
    feedback: string;
    typos_count: number;
    clarity_issues_count: number;
    content_gaps_count: number;
  };
  telefun_assessment?: {
    overall_score: number;
    speaking_rate_wpm: number;
    intonation_score: number;
    articulation_score: number;
    filler_words_count: number;
    emotional_tone: string;
    strengths: string[];
    highlights: string[];
  };
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
  return [
    entry.user_id,
    entry.scenario_title,
    recordingUrl || entry.created_at,
  ].join("::");
}

export async function getMonitoringHistory(): Promise<UnifiedHistoryEntry[]> {
  const admin = createAdminClient();

  const [ketikRes, pdktRes, telefunHistoryRes, telefunResultsRes] =
    await Promise.all([
      admin
        .from("ketik_history")
        .select(
          "id, user_id, date, scenario_title, messages, final_score, empathy_score, probing_score, resolution_score, typo_score, compliance_score, review_status",
        )
        .order("date", { ascending: false })
        .limit(200),
      admin
        .from("pdkt_history")
        .select(
          "id, user_id, timestamp, config, emails, evaluation, evaluation_status, evaluation_error, time_taken",
        )
        .order("timestamp", { ascending: false })
        .limit(200),
      admin
        .from("telefun_history")
        .select(
          "id, user_id, created_at, scenario_title, duration_seconds, recording_path, score, voice_assessment, ai_summary, strengths, weaknesses",
        )
        .order("created_at", { ascending: false })
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
    console.error(
      "[monitoring] Failed to read telefun_history:",
      telefunHistoryRes.error,
    );
  if (telefunResultsRes.error)
    console.error(
      "[monitoring] Failed to read telefun results:",
      telefunResultsRes.error,
    );

  const allUserIds = new Set<string>();
  (ketikRes.data || []).forEach((row) => allUserIds.add(row.user_id));
  (pdktRes.data || []).forEach((row) => allUserIds.add(row.user_id));
  (telefunHistoryRes.data || []).forEach((row) => allUserIds.add(row.user_id));
  (telefunResultsRes.data || []).forEach((row) => allUserIds.add(row.user_id));

  const profilesMap: Record<
    string,
    { email: string | null; role: string | null }
  > = {};
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
      score: typeof row.final_score === "number" ? row.final_score : null,
      history: row.messages,
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
      review_status: (row.review_status as ReviewStatus) || "not_started",
      scores:
        typeof row.final_score === "number"
          ? {
              final: row.final_score ?? undefined,
              empathy: row.empathy_score ?? undefined,
              probing: row.probing_score ?? undefined,
              resolution: row.resolution_score ?? undefined,
              typo: row.typo_score ?? undefined,
              compliance: row.compliance_score ?? undefined,
            }
          : undefined,
    });
  });

  (pdktRes.data || []).forEach((row) => {
    const config =
      row.config && typeof row.config === "object" ? row.config : {};
    const evaluation =
      row.evaluation && typeof row.evaluation === "object"
        ? row.evaluation
        : {};

    const pdkt_evaluation =
      typeof evaluation?.score === "number"
        ? {
            score: evaluation.score,
            feedback: safeString(evaluation.feedback, "").slice(0, 150),
            typos_count: Array.isArray(evaluation.typos)
              ? evaluation.typos.length
              : 0,
            clarity_issues_count: Array.isArray(evaluation.clarityIssues)
              ? evaluation.clarityIssues.length
              : 0,
            content_gaps_count: Array.isArray(evaluation.contentGaps)
              ? evaluation.contentGaps.length
              : 0,
          }
        : undefined;

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
      score: typeof evaluation?.score === "number" ? evaluation.score : null,
      history: Array.isArray(row.emails) ? row.emails : [],
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
      review_status: (row.evaluation_status as ReviewStatus) || "not_started",
      pdkt_evaluation,
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
      review_status:
        typeof row.score === "number" ? "completed" : "not_started",
    };

    telefunSeen.add(createTelefunSignature(entry));
    unified.push(entry);
  });

  (telefunHistoryRes.data || []).forEach((row) => {
    const va =
      row.voice_assessment && typeof row.voice_assessment === "object"
        ? row.voice_assessment
        : null;

    const entry: UnifiedHistoryEntry = {
      id: row.id,
      user_id: row.user_id,
      module: "telefun",
      scenario_title: safeString(row.scenario_title, "Simulasi Telepon"),
      created_at: safeString(row.created_at, ""),
      duration_seconds: safeNumber(row.duration_seconds, 0),
      // Use voice_assessment.overallScore (0-10) when available, otherwise fall back to score
      score: va
        ? safeNumber(
            va.overallScore,
            typeof row.score === "number" ? row.score : 0,
          )
        : typeof row.score === "number"
          ? row.score
          : null,
      history: safeString(row.recording_path, ""),
      user_email: profilesMap[row.user_id]?.email ?? undefined,
      user_role: profilesMap[row.user_id]?.role ?? undefined,
      review_status:
        typeof row.score === "number" ? "completed" : "not_started",
      telefun_assessment: va
        ? {
            overall_score: safeNumber(va.overallScore, 0),
            speaking_rate_wpm: safeNumber(va.speakingRate?.wordsPerMinute, 0),
            intonation_score: safeNumber(va.intonation?.score, 0),
            articulation_score: safeNumber(va.articulation?.score, 0),
            filler_words_count: safeNumber(va.fillerWords?.count, 0),
            emotional_tone: safeString(va.emotionalTone?.dominant, ""),
            strengths: Array.isArray(va.strengths)
              ? va.strengths.slice(0, 3)
              : [],
            highlights: Array.isArray(va.highlights)
              ? va.highlights.slice(0, 3)
              : [],
          }
        : undefined,
    };

    const signature = createTelefunSignature(entry);
    if (!telefunSeen.has(signature)) {
      telefunSeen.add(signature);
      unified.push(entry);
    } else if (va) {
      // If telefun_history has voice_assessment but results table entry doesn't,
      // merge the assessment into the existing entry
      const existing = unified.find(
        (e) =>
          e.module === "telefun" && createTelefunSignature(e) === signature,
      );
      if (existing && !existing.telefun_assessment) {
        existing.telefun_assessment = entry.telefun_assessment;
      }
    }
  });

  return unified.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
