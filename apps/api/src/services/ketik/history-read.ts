import { z } from "zod";
import {
  mapSimulationSubjectRowToSnapshot,
  type KetikHistoryQuery,
  type KetikHistoryPage,
  type KetikHistorySummaryItem,
  type KetikHistoryDetail,
  type KetikLandingSummary,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import { readHistoryAttachments } from "./history-attachments";

const COLUMNS =
  "id,date,scenario_title,consumer_name,consumer_phone,consumer_city,consumer_nik,consumer_email,simulation_duration,final_score,empathy_score,probing_score,resolution_score,typo_score,compliance_score,review_status,simulation_subject_type,simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,simulation_subject_team";
const cursorSchema = z.strictObject({
  // Preserve Postgres microseconds. Date.toISOString() would lose precision.
  date: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  q: z.string().max(120),
  status: z.enum(["all", "completed", "running", "failed", "not_started"]),
});
export class InvalidHistoryCursor extends Error {}
function decodeCursor(query: KetikHistoryQuery) {
  if (!query.cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
    );
    if (value.q !== query.q || value.status !== query.status) throw new Error();
    return value;
  } catch {
    throw new InvalidHistoryCursor();
  }
}
// Query projection is controlled here and in the RPC, not supplied by callers.
function mapRow(row: Record<string, unknown>): KetikHistorySummaryItem {
  return {
    ...(row.transcript_provenance === "legacy" ||
    row.transcript_provenance === "server_v1"
      ? { transcriptProvenance: row.transcript_provenance }
      : {}),
    id: row.id as string,
    date: row.date as string,
    scenarioTitle: (row.scenario_title || "Simulation Chat") as string,
    consumerName: (row.consumer_name || "Consumer") as string,
    consumerPhone: (row.consumer_phone ?? undefined) as string | undefined,
    consumerNik: (row.consumer_nik ?? null) as string | null,
    consumerEmail: (row.consumer_email ?? null) as string | null,
    consumerCity: (row.consumer_city ?? undefined) as string | undefined,
    simulationDuration: (row.simulation_duration ?? undefined) as
      number | undefined,
    finalScore: (row.final_score ?? undefined) as number | undefined,
    empathyScore: (row.empathy_score ?? undefined) as number | undefined,
    probingScore: (row.probing_score ?? undefined) as number | undefined,
    resolutionScore: (row.resolution_score ?? undefined) as number | undefined,
    typoScore: (row.typo_score ?? undefined) as number | undefined,
    complianceScore: (row.compliance_score ?? undefined) as number | undefined,
    reviewStatus: row.review_status as KetikHistorySummaryItem["reviewStatus"],
    simulationSubject: mapSimulationSubjectRowToSnapshot(row),
  };
}
export async function getHistoryPage(
  owner: string,
  query: KetikHistoryQuery,
): Promise<KetikHistoryPage> {
  const before = decodeCursor(query);
  const { data, error } = await createAdminClient().rpc("ketik_history_page", {
    p_owner: owner,
    p_limit: query.limit,
    p_query: query.q,
    p_status: query.status,
    p_before_date: before?.date ?? null,
    p_before_id: before?.id ?? null,
  });
  if (error) throw error;
  const rows = data.items as Record<string, unknown>[];
  const items = rows.slice(0, query.limit).map(mapRow);
  const last = items.at(-1);
  return {
    items,
    total: data.counts[query.status],
    counts: data.counts,
    reviewedCount:
      query.status === "all" || query.status === "completed"
        ? data.reviewedCount
        : 0,
    averageScore:
      query.status === "all" || query.status === "completed"
        ? data.averageScore
        : null,
    nextCursor:
      rows.length > query.limit && last
        ? Buffer.from(
            JSON.stringify({
              date: last.date,
              id: last.id,
              q: query.q,
              status: query.status,
            }),
          ).toString("base64url")
        : null,
  };
}
export async function getHistoryDetail(
  owner: string,
  id: string,
): Promise<KetikHistoryDetail | null> {
  const db = createAdminClient();
  const { data: snapshot, error } = await db.rpc("read_ketik_review", {
    p_actor: owner,
    p_session: id,
  });
  if (error) throw error;
  if (!snapshot) return null;
  const data = snapshot.history;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const [attachments, previous] = await Promise.all([
    readHistoryAttachments(db, id, data.user_id, messages),
    db
      .from("ketik_history")
      .select("final_score")
      .eq("user_id", data.user_id)
      .eq("review_status", "completed")
      .not("final_score", "is", null)
      .lt("date", data.date)
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);
  if (previous.error) throw previous.error;
  return {
    ...mapRow(data),
    messages,
    attachments,
    previousFinalScore: previous.data?.[0]?.final_score ?? null,
  };
}
const ASPECTS = [
  ["empathyScore", "Empati & Komunikasi"],
  ["probingScore", "Probing"],
  ["resolutionScore", "Resolusi"],
  ["typoScore", "Tata Tulis"],
  ["complianceScore", "Kepatuhan"],
] as const;
function focusOf(items: KetikHistorySummaryItem[]) {
  let lowest: KetikLandingSummary["focus"] = null;
  for (const [field, label] of ASPECTS) {
    const values = items
      .map((s) => s[field])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!values.length) continue;
    const score = Math.round(
      values.reduce((sum, v) => sum + v, 0) / values.length,
    );
    if (!lowest || score < lowest.score) lowest = { label, score };
  }
  return lowest;
}
function participantLabel(s: KetikHistorySummaryItem) {
  const subject = s.simulationSubject;
  if (subject?.type === "self") return "Anda";
  if (subject?.type !== "participant") return "Tidak tercatat";
  return `${subject.displayName || "Peserta"}${subject.participantId ? "" : " (data peserta sudah dihapus)"}`;
}
export async function getHistorySummary(
  owner: string,
): Promise<KetikLandingSummary> {
  const db = createAdminClient();
  const now = new Date(Date.now() + 7 * 3600_000);
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 7 * 3600_000,
  ).toISOString();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 7 * 3600_000,
  ).toISOString();
  const results = await Promise.all([
    db
      .from("ketik_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner)
      .gte("date", from)
      .lt("date", to),
    db
      .from("ketik_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner)
      .eq("review_status", "processing"),
    db
      .from("ketik_history")
      .select(COLUMNS)
      .eq("user_id", owner)
      .eq("review_status", "completed")
      .not("final_score", "is", null)
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
    db
      .from("ketik_history")
      .select(COLUMNS)
      .eq("user_id", owner)
      .or("review_status.in.(pending,failed),review_status.is.null")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(3),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const reviewed = (results[2].data ?? []).map(mapRow);
  return {
    sessionsThisMonth: results[0].count ?? 0,
    reviewing: results[1].count ?? 0,
    average: reviewed.length
      ? {
          score: Math.round(
            reviewed.reduce((sum, s) => sum + s.finalScore!, 0) /
              reviewed.length,
          ),
          sessions: reviewed.length,
        }
      : null,
    focus: focusOf(reviewed),
    recent: reviewed.slice(0, 3).map((session) => ({
      session,
      subjectLabel: participantLabel(session),
      score: session.finalScore!,
      lowestAspect: focusOf([session])?.label ?? null,
    })),
    followUps: (results[3].data ?? []).map(mapRow).map((session) => ({
      session,
      meta: [
        participantLabel(session),
        session.consumerName,
        session.consumerCity,
      ]
        .filter(Boolean)
        .join(" · "),
      status:
        session.reviewStatus === "failed" ? "Telaah gagal" : "Belum ditelaah",
    })),
  };
}
