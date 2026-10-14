import {
  PDKT_PROMPT_INPUT_LIMITS,
  PdktSessionConfig,
  EmailMessage,
  PdktEvaluationResult,
  PdktRecipientContext,
  PdktEvaluationScoreBreakdown,
  PdktDimensionKey,
  PdktActionItemAI,
  PdktEvaluationEdu,
  PdktExpectedAnswerAlignment,
  PdktReplyAnnotation,
  PdktConsumerPoint,
  PDKT_DIMENSION_KEYS,
  PDKT_REPLY_ANNOTATION_LIMITS,
} from "@trainers/types";
import { UsageContext } from "../../lib/ai-usage";
import { createAdminClient } from "../../lib/supabase";
import { parseJsonFromModelText } from "../../lib/ai-json";
import { DEFAULT_AI_MODEL_ID } from "../../lib/ai-models";
import { sanitizeAiResponse } from "../../lib/ai-sanitize";
import { callAI, isTransientAiError } from "./shared-utils";
import {
  readPdktReplyAnnotations,
  readPdktConsumerPoints,
  locateQuote,
} from "./reply-annotations";
import { humanizePdktValue } from "./humane-text";
import {
  buildPdktRecipientConflictHints,
  getExpectedReplyParty,
} from "./evaluation-context";
import { buildPdktEvaluationPrompt } from "./evaluation-prompt";

export { buildPdktEvaluationPrompt } from "./evaluation-prompt";

function calculateScoreFromBreakdown(
  breakdown: PdktEvaluationScoreBreakdown,
): number {
  return Math.round(
    (breakdown.recipientDirectionScore +
      breakdown.normativeResponseScore +
      breakdown.clarityScore +
      breakdown.typoScore +
      breakdown.templateComplianceScore) /
      5,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoundedStringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > PDKT_PROMPT_INPUT_LIMITS.issueCount) return null;

  const result: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length > PDKT_PROMPT_INPUT_LIMITS.issueText
    ) {
      return null;
    }
    result.push(item);
  }
  return result;
}

function readScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= 0 && value <= 100 ? value : null;
}

function readScoreBreakdown(
  value: unknown,
): PdktEvaluationScoreBreakdown | null {
  if (!isPlainObject(value)) return null;

  const recipientDirectionScore = readScore(value.recipientDirectionScore);
  const normativeResponseScore = readScore(value.normativeResponseScore);
  const clarityScore = readScore(value.clarityScore);
  const typoScore = readScore(value.typoScore);
  const templateComplianceScore = readScore(value.templateComplianceScore);

  if (
    recipientDirectionScore === null ||
    normativeResponseScore === null ||
    clarityScore === null ||
    typoScore === null ||
    templateComplianceScore === null
  ) {
    return null;
  }

  return {
    recipientDirectionScore,
    normativeResponseScore,
    clarityScore,
    typoScore,
    templateComplianceScore,
  };
}

function readFeedback(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > PDKT_PROMPT_INPUT_LIMITS.feedback
  ) {
    return null;
  }
  return value;
}

function redactExpectedAnswerText(
  value: string,
  expectedAnswer: string,
): string {
  const reference = expectedAnswer.trim();
  if (!reference) return value;

  const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordCharacter = "\\p{L}\\p{N}_";
  const startsWithWordCharacter = new RegExp(`^[${wordCharacter}]`, "u").test(
    reference,
  );
  const endsWithWordCharacter = new RegExp(`[${wordCharacter}]$`, "u").test(
    reference,
  );
  const precedingBoundary = startsWithWordCharacter
    ? `(^|[^${wordCharacter}])`
    : "";
  const followingBoundary = endsWithWordCharacter
    ? `(?=$|[^${wordCharacter}])`
    : "";
  const referencePattern = new RegExp(
    `${precedingBoundary}${escapedReference}${followingBoundary}`,
    "giu",
  );
  const replacement = startsWithWordCharacter
    ? "$1inti jawaban yang diharapkan"
    : "inti jawaban yang diharapkan";

  return value.replace(referencePattern, replacement);
}

function redactExpectedAnswerFromValue<T>(value: T, expectedAnswer: string): T {
  if (typeof value === "string") {
    return redactExpectedAnswerText(value, expectedAnswer) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      redactExpectedAnswerFromValue(item, expectedAnswer),
    ) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ["category", "dimension", "status", "kind"].includes(key)
          ? item
          : redactExpectedAnswerFromValue(item, expectedAnswer),
      ]),
    ) as T;
  }
  return value;
}

function readExpectedAnswerAlignment(
  value: unknown,
  expectedAnswer: string,
): PdktExpectedAnswerAlignment | null {
  if (!isPlainObject(value)) return null;

  const category = value.category;
  if (
    category !== "Sesuai" &&
    category !== "Hampir sesuai" &&
    category !== "Berbeda sama sekali"
  ) {
    return null;
  }
  const reason = readBounded(value.reason, PDKT_PROMPT_INPUT_LIMITS.issueText);
  if (!reason) return null;
  const reasonWithoutReference = redactExpectedAnswerText(
    reason,
    expectedAnswer,
  );
  const sanitizedReason = sanitizeAiResponse(reasonWithoutReference)
    .slice(0, PDKT_PROMPT_INPUT_LIMITS.issueText)
    .trim();
  if (!sanitizedReason) return null;

  return { category, reason: sanitizedReason };
}

function normalizePdktEvaluationResponse(
  raw: unknown,
  expectedAnswer = "",
  agentReplyBody = "",
  inboundEmailBody = "",
): {
  score: number;
  scoreBreakdown?: PdktEvaluationScoreBreakdown;
  typos: string[];
  clarityIssues: string[];
  contentGaps: string[];
  feedback: string;
  expectedAnswerAlignment?: PdktExpectedAnswerAlignment;
  annotations: PdktReplyAnnotation[];
  consumerPoints: PdktConsumerPoint[];
} | null {
  if (!isPlainObject(raw)) return null;

  const feedback = readFeedback(raw.feedback);
  if (feedback === null) return null;

  const typos = readBoundedStringArray(raw.typos);
  const clarityIssues = readBoundedStringArray(raw.clarityIssues);
  const contentGaps = readBoundedStringArray(raw.contentGaps);
  if (typos === null || clarityIssues === null || contentGaps === null) {
    return null;
  }

  const hasExpectedAnswer = Boolean(expectedAnswer.trim());
  const expectedAnswerAlignment = hasExpectedAnswer
    ? readExpectedAnswerAlignment(raw.expectedAnswerAlignment, expectedAnswer)
    : undefined;
  if (hasExpectedAnswer && !expectedAnswerAlignment) return null;

  // `annotations` wajib ada (boleh kosong): tanpanya balasan tidak bisa
  // ditandai, jadi respons diperlakukan tidak valid dan dicoba ulang.
  if (!Array.isArray(raw.annotations)) return null;
  const annotations = readPdktReplyAnnotations(raw.annotations, agentReplyBody);
  const consumerPoints = readPdktConsumerPoints(
    raw.consumerPoints,
    inboundEmailBody,
    agentReplyBody,
  );

  const scoreBreakdown = readScoreBreakdown(raw.scoreBreakdown);
  if (scoreBreakdown) {
    return {
      score: calculateScoreFromBreakdown(scoreBreakdown),
      scoreBreakdown,
      typos,
      clarityIssues,
      contentGaps,
      feedback,
      ...(expectedAnswerAlignment ? { expectedAnswerAlignment } : {}),
      annotations,
      consumerPoints,
    };
  }

  const score = readScore(raw.score);
  if (score === null) return null;

  return {
    score,
    typos,
    clarityIssues,
    contentGaps,
    feedback,
    ...(expectedAnswerAlignment ? { expectedAnswerAlignment } : {}),
    annotations,
    consumerPoints,
  };
}

function applyRecipientConflictFailsafe(input: {
  score: number;
  scoreBreakdown?: PdktEvaluationScoreBreakdown;
  conflictHints: string[];
}): {
  score: number;
  scoreBreakdown?: PdktEvaluationScoreBreakdown;
  capApplied: boolean;
} {
  if (input.conflictHints.length === 0) {
    return {
      score: input.score,
      scoreBreakdown: input.scoreBreakdown,
      capApplied: false,
    };
  }

  const cappedScore = Math.min(input.score, 75);
  const adjustedScoreBreakdown = input.scoreBreakdown
    ? {
        ...input.scoreBreakdown,
        recipientDirectionScore: Math.min(
          input.scoreBreakdown.recipientDirectionScore,
          60,
        ),
      }
    : undefined;

  return {
    score: cappedScore,
    scoreBreakdown: adjustedScoreBreakdown,
    capApplied:
      cappedScore !== input.score ||
      (adjustedScoreBreakdown !== undefined &&
        adjustedScoreBreakdown.recipientDirectionScore !==
          input.scoreBreakdown?.recipientDirectionScore),
  };
}

class InvalidPdktEvaluationResponseError extends Error {
  constructor() {
    super("Respons evaluasi AI tidak sesuai format yang diharapkan.");
    this.name = "InvalidPdktEvaluationResponseError";
  }
}

// ── Evaluasi Edukatif: deterministic edu builder ─────────────────

const PDKT_DIMENSION_ORDER = PDKT_DIMENSION_KEYS;

const PDKT_DIMENSION_SCORE_KEY: Record<
  PdktDimensionKey,
  keyof PdktEvaluationScoreBreakdown
> = {
  recipientDirection: "recipientDirectionScore",
  normative: "normativeResponseScore",
  clarity: "clarityScore",
  typo: "typoScore",
  template: "templateComplianceScore",
};

const PDKT_EDU_FALLBACK_TIPS: Record<
  PdktDimensionKey,
  { critical: string; medium: string }
> = {
  recipientDirection: {
    critical:
      "Perbaiki arah penerima: sapaan dan penutup harus ditujukan ke perusahaan terlapor, bukan OJK.",
    medium:
      "Pastikan sapaan pembuka dan penutup tetap mengarah pada perusahaan terlapor.",
  },
  normative: {
    critical:
      "Lengkapi narasi OJK yang benar: ucapan terima kasih, arahan kanal pelaporan, dan tindak lanjut sesuai prosedur.",
    medium: "Perkuat narasi respons OJK sesuai prosedur pengaduan.",
  },
  clarity: {
    critical:
      "Susun ulang balasan dengan struktur jelas: sapaan, konfirmasi masalah, langkah tindak lanjut, penutup.",
    medium: "Rapikan struktur kalimat agar lebih mudah dipahami konsumen.",
  },
  typo: {
    critical:
      "Periksa ejaan dan format sebelum mengirim; gunakan template resmi untuk istilah produk.",
    medium: "Kurangi salah ketik dengan membaca ulang pesan sebelum kirim.",
  },
  template: {
    critical:
      "Ikuti struktur template resmi surat balasan OJK 157 secara lengkap.",
    medium: "Tambahkan elemen template yang belum lengkap (nomor tiket/kanal).",
  },
};

function readEduString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readBounded(value: unknown, max: number): string | null {
  const text = readEduString(value);
  return text !== null && text.length <= max ? text : null;
}

/** Deterministic recipientDirection tip when the conflict failsafe applies. */
function buildConflictRecipientTip(
  recipientContext?: PdktRecipientContext,
): string {
  if (getExpectedReplyParty(recipientContext) === "ojk") {
    return "Sapaan/penutup Anda bergeser ke perusahaan. Konsumen meminta jawaban dari OJK: sapa konsumen sebagai Kontak OJK 157 dan tanggapi permintaannya sesuai kasus.";
  }
  return 'Sapaan/penutup Anda bergeser ke OJK. Ubah menjadi: "Yth. PT [Nama Perusahaan Terlapor] — tim Pengaduan Konsumen" lalu cukup CC kanal kontak OJK 157.';
}

export function buildPdktEdu(
  rawEdu: unknown,
  scoreBreakdown: PdktEvaluationScoreBreakdown,
  conflictDetected: boolean,
  recipientContext?: PdktRecipientContext,
  agentReplyBody = "",
): PdktEvaluationEdu {
  const raw = isPlainObject(rawEdu) ? rawEdu : {};

  // Normalisasi skor dimensi: nilai tak valid (missing/NaN/legacy kosong)
  // diperlakukan sebagai 100 (bukan low-dim) supaya tidak memicu item
  // maupun perbandingan NaN saat sort. Guard legacy scoreBreakdown.
  const scoreOf = (key: PdktDimensionKey): number => {
    const score = scoreBreakdown?.[PDKT_DIMENSION_SCORE_KEY[key]];
    return typeof score === "number" && Number.isFinite(score) ? score : 100;
  };

  // ── dimensionTips (AI narration + deterministic conflict tip) ──
  const dimensionTips: Partial<Record<PdktDimensionKey, string>> = {};
  if (isPlainObject(raw.dimensionTips)) {
    for (const key of PDKT_DIMENSION_ORDER) {
      const tip = readBounded(
        (raw.dimensionTips as Record<string, unknown>)[key],
        PDKT_PROMPT_INPUT_LIMITS.issueText,
      );
      if (tip) dimensionTips[key] = sanitizeAiResponse(tip);
    }
  }
  if (conflictDetected && !dimensionTips.recipientDirection) {
    dimensionTips.recipientDirection = buildConflictRecipientTip(recipientContext);
  }

  // ── improvementTips (non-authoritative passthrough) ──
  let improvementTips: string[] | undefined;
  if (Array.isArray(raw.improvementTips)) {
    improvementTips = raw.improvementTips
      .map((tip) => readBounded(tip, PDKT_PROMPT_INPUT_LIMITS.issueText))
      .filter((tip): tip is string => tip !== null)
      .slice(0, 5)
      .map(sanitizeAiResponse);
    if (improvementTips.length === 0) improvementTips = undefined;
  }

  // ── actionItems: AI items first, then rule-based fallback per low dim ──
  const aiItems: PdktActionItemAI[] = [];
  if (Array.isArray(raw.actionItems)) {
    for (const item of raw.actionItems.slice(0, 5)) {
      if (!isPlainObject(item)) continue;
      const dimension = PDKT_DIMENSION_ORDER.find((k) => k === item.dimension);
      const text = readBounded(item.text, PDKT_PROMPT_INPUT_LIMITS.issueText);
      if (!dimension || !text) continue;
      const example = readBounded(
        item.example,
        PDKT_PROMPT_INPUT_LIMITS.issueText,
      );
      if (aiItems.some((existing) => existing.dimension === dimension))
        continue;
      // Kutipan hanya disimpan bila benar ada di balasan, agar UI bisa
      // menunjuk kalimatnya.
      const quote = readBounded(item.quote, PDKT_REPLY_ANNOTATION_LIMITS.quote);
      aiItems.push({
        dimension,
        text: sanitizeAiResponse(text),
        ...(example ? { example: sanitizeAiResponse(example) } : {}),
        ...(quote && locateQuote(agentReplyBody, quote) ? { quote } : {}),
      });
    }
  }

  for (const key of PDKT_DIMENSION_ORDER) {
    if (aiItems.some((item) => item.dimension === key)) continue;
    const score = scoreOf(key);
    if (score >= 75) continue;
    const band = score < 60 ? "critical" : "medium";
    aiItems.push({
      dimension: key,
      text: PDKT_EDU_FALLBACK_TIPS[key][band],
    });
  }

  // Deterministic priorityRank: lowest post-failsafe dimension score first,
  // then fixed dimension order as tie-breaker. AI never supplies priority.
  const rankedItems = [...aiItems]
    .sort((a, b) => {
      const scoreDiff = scoreOf(a.dimension) - scoreOf(b.dimension);
      if (scoreDiff !== 0) return scoreDiff;
      return (
        PDKT_DIMENSION_ORDER.indexOf(a.dimension) -
        PDKT_DIMENSION_ORDER.indexOf(b.dimension)
      );
    })
    .map((item, index) => ({ ...item, priorityRank: index + 1 }));

  // ── suggestedRewrite passthrough (validated + sanitized) ──
  let suggestedRewrite: PdktEvaluationEdu["suggestedRewrite"] = null;
  if (isPlainObject(raw.suggestedRewrite)) {
    const body = readBounded(
      raw.suggestedRewrite.body,
      PDKT_PROMPT_INPUT_LIMITS.longText,
    );
    if (body) {
      const subject = readBounded(
        raw.suggestedRewrite.subject,
        PDKT_PROMPT_INPUT_LIMITS.shortText,
      );
      const highlights = Array.isArray(raw.suggestedRewrite.highlights)
        ? raw.suggestedRewrite.highlights
            .map((h) => readBounded(h, PDKT_PROMPT_INPUT_LIMITS.issueText))
            .filter((h): h is string => h !== null)
            .slice(0, 5)
        : undefined;
      suggestedRewrite = {
        body: sanitizeAiResponse(body),
        ...(subject ? { subject: sanitizeAiResponse(subject) } : {}),
        ...(highlights && highlights.length > 0
          ? { highlights: highlights.map(sanitizeAiResponse) }
          : {}),
      };
    }
  }

  return {
    actionItems: rankedItems,
    suggestedRewrite,
    ...(Object.keys(dimensionTips).length > 0 ? { dimensionTips } : {}),
    ...(improvementTips ? { improvementTips } : {}),
  };
}

export async function evaluateAgentResponse(
  config: PdktSessionConfig,
  emails: EmailMessage[],
  usageContext?: UsageContext,
  userId?: string,
): Promise<{
  success: boolean;
  score?: number;
  feedback?: string;
  typos?: string[];
  clarityIssues?: string[];
  contentGaps?: string[];
  scoreBreakdown?: PdktEvaluationScoreBreakdown;
  edu?: PdktEvaluationEdu;
  expectedAnswerAlignment?: PdktExpectedAnswerAlignment;
  annotations?: PdktReplyAnnotation[];
  consumerPoints?: PdktConsumerPoint[];
  error?: string;
}> {
  const modelId = config.selectedModel || DEFAULT_AI_MODEL_ID;

  const inboundEmails = emails.filter((email) => !email.isAgent);
  const agentReplies = emails.filter((email) => email.isAgent);

  if (
    emails.length !== 2 ||
    inboundEmails.length !== 1 ||
    agentReplies.length !== 1
  ) {
    return {
      success: false,
      error:
        "Invalid email context for evaluation. Need exactly one consumer email and one agent reply.",
    };
  }

  const inboundEmailBody = inboundEmails[0].body || "(kosong)";
  const agentReplyBody = agentReplies[0].body || "(kosong)";
  const recipientContext = config.recipientContext;
  const conflictAnalysis = buildPdktRecipientConflictHints({
    agentReplyBody,
    recipientContext,
  });
  const conflictHints = Array.from(
    new Set([
      ...(conflictAnalysis.conflictHints || []),
      ...(recipientContext ? [] : ["legacy fallback: mode reply_to_ojk"]),
    ]),
  );

  const scenario = config.scenarios?.[0];
  const expectedAnswer =
    typeof scenario?.expectedAnswer === "string"
      ? scenario.expectedAnswer.trim()
      : "";
  const { systemInstruction, prompt: evaluationPrompt } =
    buildPdktEvaluationPrompt({
      inboundEmailBody,
      agentReplyBody,
      scenarioTitle: scenario?.title,
      scenarioCategory: scenario?.category,
      ...(expectedAnswer ? { expectedAnswer } : {}),
      recipientContext,
      conflictHints,
    });

  // Log context for observability (no body content logged)
  console.debug(
    `[PDKT Evaluation] Single inbound → single reply (${inboundEmailBody.length}/${agentReplyBody.length} chars)`,
  );

  let lastError: unknown;
  let withoutConsumerPoints: Awaited<
    ReturnType<typeof evaluateAgentResponse>
  > | null = null;
  const retryDelaysMs = [250, 500];

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      const response = await callAI({
        model: modelId,
        prompt: evaluationPrompt,
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.2,
        usageContext: usageContext || {
          module: "pdkt",
          action: "evaluate_response",
        },
        userId,
      });

      if (!response.success)
        throw new Error(response.error || "Gagal mendapatkan respons AI.");

      const evalText = response.text || "{}";
      let rawResult: unknown;
      try {
        rawResult = parseJsonFromModelText(evalText);
      } catch {
        throw new InvalidPdktEvaluationResponseError();
      }

      const normalizedResult = normalizePdktEvaluationResponse(
        rawResult,
        expectedAnswer,
        agentReplyBody,
        inboundEmailBody,
      );
      if (!normalizedResult) {
        throw new InvalidPdktEvaluationResponseError();
      }

      const scored = applyRecipientConflictFailsafe({
        score: normalizedResult.score,
        scoreBreakdown: normalizedResult.scoreBreakdown,
        conflictHints: conflictAnalysis.conflictHints,
      });
      const feedback = scored.capApplied
        ? `${normalizedResult.feedback}\n\nCatatan sistem: skor dibatasi karena sapaan atau penutup balasan tidak sesuai dengan penerima email.`
        : normalizedResult.feedback;

      // Evaluasi Edukatif: deterministic edu layer built from the post-failsafe
      // breakdown; AI narration never influences score or priority.
      const edu = scored.scoreBreakdown
        ? buildPdktEdu(
            isPlainObject(rawResult)
              ? (rawResult as Record<string, unknown>).edu
              : undefined,
            scored.scoreBreakdown,
            conflictAnalysis.conflictHints.length > 0,
            recipientContext,
            agentReplyBody,
          )
        : undefined;

      const userFacingAssessment = humanizePdktValue(
        redactExpectedAnswerFromValue(
          {
            typos: normalizedResult.typos,
            clarityIssues: normalizedResult.clarityIssues,
            contentGaps: normalizedResult.contentGaps,
            feedback,
            ...(edu ? { edu } : {}),
            ...(normalizedResult.expectedAnswerAlignment
              ? {
                  expectedAnswerAlignment:
                    normalizedResult.expectedAnswerAlignment,
                }
              : {}),
            annotations: normalizedResult.annotations,
            consumerPoints: normalizedResult.consumerPoints,
          },
          expectedAnswer,
        ),
      );

      const evaluation = {
        success: true,
        score: scored.score,
        scoreBreakdown: scored.scoreBreakdown,
        ...userFacingAssessment,
      };
      // Email konsumen selalu memuat minimal satu permintaan; poin kosong
      // berarti jawaban AI tidak lengkap. Coba ulang dulu, dan simpan hasil
      // ini sebagai cadangan bila percobaan berikutnya gagal.
      if (normalizedResult.consumerPoints.length === 0) {
        withoutConsumerPoints = evaluation;
        if (attempt < retryDelaysMs.length)
          throw new InvalidPdktEvaluationResponseError();
        break;
      }
      return evaluation;
    } catch (error: unknown) {
      lastError = error;
      const isRetryableEvaluationError =
        error instanceof InvalidPdktEvaluationResponseError ||
        isTransientAiError(error);
      if (!isRetryableEvaluationError || attempt === retryDelaysMs.length)
        break;

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt]),
      );
    }
  }

  if (withoutConsumerPoints) {
    // UI menampilkan pemberitahuan dan tombol telaah ulang untuk hasil ini.
    console.warn(
      "[PDKT Evaluation] consumerPoints kosong setelah semua percobaan; telaah disimpan tanpa poin konsumen.",
    );
    return withoutConsumerPoints;
  }

  return {
    success: false,
    error:
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === "string"
          ? lastError
          : "Gagal mendapatkan respons AI.",
  };
}

/** Telaah lengkap: menandai balasan dan memuat minimal satu poin konsumen. */
function isCompleteReview(evaluation: unknown): boolean {
  return (
    isPlainObject(evaluation) &&
    Array.isArray(evaluation.annotations) &&
    Array.isArray(evaluation.consumerPoints) &&
    evaluation.consumerPoints.length > 0
  );
}

/**
 * Background worker to process PDKT evaluations.
 * Implements a simple claiming mechanism (status='processing') to prevent duplicate work.
 */
export async function processPdktEvaluation(
  historyId: string,
  userId: string,
): Promise<PdktEvaluationResult> {
  const adminClient = createAdminClient();

  const { data: history, error: fetchError } = await adminClient
    .from("pdkt_history")
    .select("*")
    .eq("id", historyId)
    .single();

  if (fetchError || !history) {
    throw new Error("PDKT History not found");
  }

  // Telaah lama tanpa penanda kalimat atau tanpa poin konsumen boleh diulang;
  // telaah lengkap yang sudah selesai tetap dipakai.
  const reviewWithoutMarks =
    history.evaluation_status === "completed" &&
    !isCompleteReview(history.evaluation);
  if (history.evaluation_status === "completed" && !reviewWithoutMarks) {
    return history.evaluation as PdktEvaluationResult;
  }

  const nowIso = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const claim = adminClient
    .from("pdkt_history")
    .update({
      evaluation_status: "processing",
      evaluation_started_at: nowIso,
      evaluation_error: null,
    })
    .eq("id", historyId)
    .or(
      `evaluation_started_at.is.null,evaluation_started_at.lt.${staleThreshold}`,
    );
  const { data: claimed, error: claimError } = await (
    reviewWithoutMarks
      ? // Hanya klaim bila telaah belum berubah sejak dibaca di atas.
        history.evaluation_completed_at
        ? claim
            .eq("evaluation_status", "completed")
            .eq("evaluation_completed_at", history.evaluation_completed_at)
        : claim
            .eq("evaluation_status", "completed")
            .is("evaluation_completed_at", null)
      : claim.neq("evaluation_status", "completed")
  ).select("id");

  if (claimError) {
    throw new Error("Failed to claim evaluation");
  }

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from("pdkt_history")
      .select("evaluation_status, evaluation")
      .eq("id", historyId)
      .maybeSingle();

    if (current?.evaluation_status === "completed") {
      if (current.evaluation) return current.evaluation as PdktEvaluationResult;
      throw new Error("Evaluation marked completed but no results found");
    }

    throw new Error("Evaluation is already in progress");
  }

  try {
    const config = history.config;
    const emails = history.emails;

    const result = await evaluateAgentResponse(
      config,
      emails,
      { module: "pdkt", action: "async_evaluate_agent_response" },
      userId,
    );

    if (!result.success) {
      throw new Error(result.error || "Evaluation failed without message");
    }

    const evaluationData: PdktEvaluationResult = {
      score: result.score || 0,
      feedback: result.feedback || "",
      typos: result.typos || [],
      clarityIssues: result.clarityIssues || [],
      contentGaps: result.contentGaps || [],
      scoreBreakdown: result.scoreBreakdown,
      ...(result.edu ? { edu: result.edu } : {}),
      ...(result.expectedAnswerAlignment
        ? { expectedAnswerAlignment: result.expectedAnswerAlignment }
        : {}),
      annotations: result.annotations ?? [],
      consumerPoints: result.consumerPoints ?? [],
    };

    const { data: saved, error: updateEndError } = await adminClient
      .from("pdkt_history")
      .update({
        evaluation: evaluationData,
        evaluation_status: "completed",
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq("id", historyId)
      .eq("evaluation_started_at", nowIso)
      .select("id");

    if (updateEndError) {
      throw new Error("Failed to save evaluation results");
    }

    if (!saved || saved.length === 0) {
      console.warn(
        `[processPdktEvaluation] Lease lost before save for history: ${historyId}`,
      );
      return evaluationData;
    }

    return evaluationData;
  } catch (err: unknown) {
    console.error(`[PDKT] Error evaluating history ${historyId}:`, err);
    await adminClient
      .from("pdkt_history")
      .update({
        evaluation_status: "failed",
        evaluation_error:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : String(err),
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq("id", historyId)
      .eq("evaluation_started_at", nowIso);

    throw err;
  }
}
