import {
  chatMessageSchema,
  emailMessageSchema,
  pdktEvaluationAiOutputSchema,
  pdktSessionConfigSchema,
  parseTelefunTranscript,
  parseVoiceQualityAssessment,
} from "@trainers/types";
import type {
  ChatMessage,
  EmailMessage,
  MonitoringHistoryEntry,
  MonitoringTelefunAssessment,
  PdktEvaluationResult,
  PdktSessionConfig,
  VoiceQualityAssessment,
} from "@trainers/types";
import { createAdminClient } from "../lib/supabase";
import {
  evaluateTelefunHoldAssessment,
  normalizeTelefunHoldMetrics,
} from "../lib/telefun-hold-assessment";

export type ReviewStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

type JsonObject = Record<string, unknown>;
type SourceRow = JsonObject & { id?: string; user_id?: string };
type QueryResult = { data: unknown; error: { message?: string } | null };
type Query = PromiseLike<QueryResult> & {
  select(columns: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  range(from: number, to: number): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: string[]): Query;
};

type ConsumerMetadata = {
  consumer_name?: string | null;
  consumer_phone?: string | null;
  consumer_city?: string | null;
  consumer_gender?: string | null;
  consumer_type?: string | null;
  recipient?: string | null;
  contact?: string | null;
};

export type UnifiedHistoryEntry = MonitoringHistoryEntry;

const PAGE_SIZE = 200;
const BATCH_SIZE = 100;
function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeRecordingPath(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && !/^https?:\/\//i.test(value)
    && !value.startsWith("/") && !value.includes("..") && !value.includes("\\") && !value.includes("//")
    ? value
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export type TelefunCoachingRecommendation = { text: string; priority: number };

export function normalizeTelefunCoachingRecommendations(value: unknown): TelefunCoachingRecommendation[] {
  return array(value).flatMap((item) => {
    const candidate = object(item);
    const text = candidate.text;
    const priority = candidate.priority;
    return typeof text === "string" && text.trim().length > 0
      && typeof priority === "number" && Number.isFinite(priority) && priority >= 1 && priority <= 5
      ? [{ text: text.trim(), priority }]
      : [];
  });
}

export function normalizePdktConfig(value: unknown): PdktSessionConfig | null {
  const parsed = pdktSessionConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeKetikMessages(value: unknown): ChatMessage[] {
  return array(value).flatMap((item) => {
    const parsed = chatMessageSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function normalizePdktEmails(value: unknown): EmailMessage[] {
  return array(value).flatMap((item) => {
    const parsed = emailMessageSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function normalizePdktEvaluation(value: unknown): PdktEvaluationResult | null {
  const full = pdktEvaluationAiOutputSchema.safeParse(value);
  const raw = object(value);
  const { scoreBreakdown: _scoreBreakdown, ...legacyInput } = raw;
  const legacy = pdktEvaluationAiOutputSchema.omit({ scoreBreakdown: true }).safeParse(legacyInput);
  const parsed = full.success ? full.data : legacy.success ? legacy.data : null;
  if (!parsed) return null;
  return {
    score: parsed.score,
    feedback: parsed.feedback,
    typos: parsed.typos,
    clarityIssues: parsed.clarityIssues,
    contentGaps: parsed.contentGaps,
    scoreBreakdown: full.success ? full.data.scoreBreakdown : undefined,
    ...(parsed.edu
      ? {
          // Persisted edu was ranked by the backend builder before storage;
          // re-derive rank from stored order deterministically.
          edu: {
            actionItems: (parsed.edu.actionItems ?? []).map((item, index) => ({
              ...item,
              priorityRank: index + 1,
            })),
            suggestedRewrite: parsed.edu.suggestedRewrite ?? null,
            ...(parsed.edu.dimensionTips
              ? { dimensionTips: parsed.edu.dimensionTips }
              : {}),
            ...(parsed.edu.improvementTips
              ? { improvementTips: parsed.edu.improvementTips }
              : {}),
          },
        }
      : {}),
  };
}

export function normalizeTelefunAssessmentWithHold(value: unknown, sessionMetrics: unknown): VoiceQualityAssessment | null {
  const assessment = parseVoiceQualityAssessment(value);
  if (!assessment) return null;
  const metrics = object(sessionMetrics);
  const hold = evaluateTelefunHoldAssessment(normalizeTelefunHoldMetrics(metrics.hold));
  return parseVoiceQualityAssessment({ ...assessment, holdManagement: hold });
}

function status(value: unknown): ReviewStatus {
  return value === "pending" || value === "processing" || value === "completed" || value === "failed"
    ? value
    : "not_started";
}

function batches(values: string[]): string[][] {
  const result: string[][] = [];
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    result.push(values.slice(index, index + BATCH_SIZE));
  }
  return result;
}

function sourceError(table: string, error: { message?: string }): Error {
  return new Error(`Monitoring source ${table} failed: ${error.message || "database error"}`);
}

async function readComplete(
  client: { from(table: string): Query },
  table: string,
  columns: string,
  filter?: (query: Query) => Query,
): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  const orderColumn = table === "ketik_history" ? "date" : table === "pdkt_history" ? "timestamp" : "created_at";

  for (let page = 0; ; page += 1) {
    let query = client.from(table).select(columns);
    query = filter ? filter(query) : query;
    const result = await query.order(orderColumn, { ascending: false })
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (result.error) throw sourceError(table, result.error);
    const pageRows = Array.isArray(result.data) ? result.data as SourceRow[] : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return rows;
  }
}

async function readProfiles(client: { from(table: string): Query }, userIds: string[]): Promise<Map<string, SourceRow>> {
  const profiles = new Map<string, SourceRow>();
  for (const ids of batches(userIds)) {
    const result = await client.from("profiles").select("id, email, role").in("id", ids);
    if (result.error) throw sourceError("profiles", result.error);
    for (const profile of (result.data || []) as SourceRow[]) {
      if (profile.id) profiles.set(profile.id, profile);
    }
  }
  return profiles;
}

async function readCoaching(client: { from(table: string): Query }, sessionIds: string[]): Promise<Map<string, SourceRow>> {
  const summaries = new Map<string, SourceRow>();
  for (const ids of batches(sessionIds)) {
    const result = await client.from("telefun_coaching_summary")
      .select("id, session_id, recommendations, generated_at").in("session_id", ids);
    if (result.error) throw sourceError("telefun_coaching_summary", result.error);
    const candidates = ((result.data || []) as SourceRow[]).filter((summary) => string(summary.session_id));
    candidates.sort((left, right) => {
      const generated = string(right.generated_at).localeCompare(string(left.generated_at));
      return generated || string(right.id).localeCompare(string(left.id));
    });
    for (const summary of candidates) {
      const sessionId = string(summary.session_id);
      if (sessionId && !summaries.has(sessionId)) summaries.set(sessionId, summary);
    }
  }
  return summaries;
}

function emailValue(email: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const value = nullableString(email[key]);
    if (value) return value;
  }
  return null;
}

export function normalizePdktMetadata(configValue: unknown, emails: EmailMessage[]): ConsumerMetadata {
  const config = object(configValue);
  const identity = object(config.identity);
  const consumerType = object(config.consumerType);
  const recipientContext = object(config.recipientContext);
  const firstEmail = object(emails.find((email) => object(email).type === "received") || emails[0]);
  const recipient = nullableString(recipientContext.primaryRecipientAddress)
    || emailValue(firstEmail, ["to", "recipient"]);
  const contact = emailValue(firstEmail, ["from", "sender", "senderEmail"])
    || nullableString(identity.email);
  return {
    consumer_name: nullableString(identity.name) || nullableString(identity.bodyName),
    consumer_city: nullableString(identity.city),
    consumer_type: nullableString(consumerType.name || consumerType.id),
    recipient,
    contact,
  };
}

function userFields(row: SourceRow, profiles: Map<string, SourceRow>): Pick<UnifiedHistoryEntry, "user_email" | "user_role"> {
  const profile = row.user_id ? profiles.get(row.user_id) : undefined;
  return { user_email: nullableString(profile?.email) || undefined, user_role: nullableString(profile?.role) || undefined };
}

function telefunAssessment(value: unknown, sessionMetrics: unknown): MonitoringTelefunAssessment | undefined {
  const assessment = normalizeTelefunAssessmentWithHold(value, sessionMetrics);
  if (!assessment) return undefined;
  return {
    ...assessment,
    overall_score: assessment.overallScore,
    speaking_rate_wpm: assessment.speakingRate.wordsPerMinute,
    intonation_score: assessment.intonation.score,
    articulation_score: assessment.articulation.score,
    filler_words_count: assessment.fillerWords.count,
    emotional_tone: assessment.emotionalTone.dominant,
    highlights: assessment.highlights,
  } satisfies MonitoringTelefunAssessment;
}

export async function getMonitoringHistory(): Promise<UnifiedHistoryEntry[]> {
  const admin = createAdminClient() as unknown as { from(table: string): Query };
  const [ketikRows, pdktRows, telefunRows, legacyRows] = await Promise.all([
    readComplete(admin, "ketik_history", "id, user_id, date, scenario_title, consumer_name, consumer_phone, consumer_city, messages, simulation_duration, final_score, empathy_score, probing_score, resolution_score, typo_score, compliance_score, review_status"),
    readComplete(admin, "pdkt_history", "id, user_id, timestamp, config, emails, evaluation, evaluation_status, evaluation_error, time_taken, created_at"),
    readComplete(admin, "telefun_history", "id, user_id, created_at, scenario_title, consumer_name, consumer_phone, consumer_city, consumer_gender, duration_seconds, recording_path, score, messages, voice_assessment, session_metrics, ai_summary, strengths, weaknesses, coaching_focus, persona_config"),
    readComplete(admin, "results", "id, user_id, module, score, details, history, created_at", (query) => query.eq("module", "telefun")),
  ]);

  const userIds = [...new Set([...ketikRows, ...pdktRows, ...telefunRows, ...legacyRows]
    .map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
  const profiles = await readProfiles(admin, userIds);
  const coaching = await readCoaching(admin, telefunRows.map((row) => row.id).filter((id): id is string => Boolean(id)));
  const entries: UnifiedHistoryEntry[] = [];

  for (const row of ketikRows) {
    const messages = normalizeKetikMessages(row.messages);
    entries.push({
      id: string(row.id), user_id: string(row.user_id), module: "ketik",
      scenario_title: string(row.scenario_title, "Simulasi Chat"), created_at: string(row.date),
      duration_seconds: number(row.simulation_duration), score: typeof row.final_score === "number" ? row.final_score : null,
      history: messages, ...userFields(row, profiles), consumer_name: nullableString(row.consumer_name),
      consumer_phone: nullableString(row.consumer_phone), consumer_city: nullableString(row.consumer_city),
      review_status: status(row.review_status), scores: {
        final: typeof row.final_score === "number" ? row.final_score : undefined,
        empathy: typeof row.empathy_score === "number" ? row.empathy_score : undefined,
        probing: typeof row.probing_score === "number" ? row.probing_score : undefined,
        resolution: typeof row.resolution_score === "number" ? row.resolution_score : undefined,
        typo: typeof row.typo_score === "number" ? row.typo_score : undefined,
        compliance: typeof row.compliance_score === "number" ? row.compliance_score : undefined,
      },
      ketik_session: { consumer_name: nullableString(row.consumer_name), consumer_phone: nullableString(row.consumer_phone), consumer_city: nullableString(row.consumer_city), messages, simulation_duration: typeof row.simulation_duration === "number" ? row.simulation_duration : null },
    });
  }

  for (const row of pdktRows) {
    const config = normalizePdktConfig(row.config);
    const emails = normalizePdktEmails(row.emails);
    const evaluation = normalizePdktEvaluation(row.evaluation);
    const metadata = normalizePdktMetadata(row.config, emails);
    const summary = evaluation ? {
      ...evaluation,
      typos_count: array(evaluation.typos).length,
      clarity_issues_count: array(evaluation.clarityIssues).length,
      content_gaps_count: array(evaluation.contentGaps).length,
    } : undefined;
    entries.push({
      id: string(row.id), user_id: string(row.user_id), module: "pdkt",
      scenario_title: string(object(array(config?.scenarios)[0]).title, "Simulasi Email"),
      created_at: string(row.timestamp || row.created_at), duration_seconds: number(row.time_taken),
      score: typeof evaluation?.score === "number" ? evaluation.score : null,
      history: emails, ...userFields(row, profiles), ...metadata,
      review_status: status(row.evaluation_status), pdkt_evaluation: summary,
      pdkt_session: {
        consumer_name: metadata.consumer_name ?? null,
        consumer_phone: null,
        consumer_city: metadata.consumer_city ?? null,
        consumer_gender: null,
        consumer_type: metadata.consumer_type ?? null,
        recipient: metadata.recipient ?? null,
        contact: metadata.contact ?? null,
        config,
        emails,
        evaluation,
        evaluation_error: nullableString(row.evaluation_error),
        evaluation_status: status(row.evaluation_status),
        time_taken: typeof row.time_taken === "number" ? row.time_taken : null,
      },
    });
  }

  const canonicalIds = new Set<string>();
  for (const row of telefunRows) {
    const id = string(row.id);
    canonicalIds.add(id);
    const assessment = telefunAssessment(row.voice_assessment, row.session_metrics);
    const metadata: ConsumerMetadata = {
      consumer_name: nullableString(row.consumer_name),
      consumer_phone: nullableString(row.consumer_phone),
      consumer_city: nullableString(row.consumer_city),
      consumer_gender: nullableString(row.consumer_gender),
      consumer_type: nullableString(object(row.persona_config).consumerType),
    };
    const score = assessment?.overallScore ?? (typeof row.score === "number" ? row.score : null);
    const summary = coaching.get(id);
    entries.push({
      id, user_id: string(row.user_id), module: "telefun", scenario_title: string(row.scenario_title, "Simulasi Telepon"),
      created_at: string(row.created_at), duration_seconds: number(row.duration_seconds), score,
      history: parseTelefunTranscript(row.messages).length
        ? parseTelefunTranscript(row.messages)
        : safeRecordingPath(row.recording_path), ...userFields(row, profiles), ...metadata,
      review_status: score !== null ? "completed" : "not_started", telefun_assessment: assessment || undefined,
      telefun_coaching: { recommendations: normalizeTelefunCoachingRecommendations(summary?.recommendations), generated_at: summary ? nullableString(summary.generated_at) : null },
    });
  }

  for (const row of legacyRows) {
    const id = string(row.id);
    if (canonicalIds.has(id)) continue;
    const details = object(row.details);
    entries.push({
      id, user_id: string(row.user_id), module: "telefun", scenario_title: string(details.scenario || details.scenario_title, "Simulasi Telepon"),
      created_at: string(row.created_at), duration_seconds: number(details.duration), score: typeof row.score === "number" ? row.score : null,
      history: safeRecordingPath(details.recordingUrl) || parseTelefunTranscript(row.history), ...userFields(row, profiles), review_status: typeof row.score === "number" ? "completed" : "not_started", telefun_legacy: true,
    });
  }

  return entries.sort((left, right) => {
    const created = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    return created || left.module.localeCompare(right.module) || left.id.localeCompare(right.id);
  });
}
