import {
  PdktSessionConfig,
  EmailMessage,
  PdktEvaluationResult,
} from "@trainers/types";
import { UsageContext } from "../../lib/ai-usage";
import { createAdminClient } from "../../lib/supabase";
import { parseJsonFromModelText } from "../../lib/ai-json";
import { callAI, isTransientAiError } from "./shared-utils";

// ── Prompt Builder ────────────────────────────────────────────────────

/**
 * Build evaluation prompt from single inbound email + single agent reply.
 *
 * @param input.inboundEmailBody - The consumer's inbound email body.
 * @param input.agentReplyBody - The agent's reply body (target of evaluation).
 * @param input.scenarioTitle - Optional scenario title.
 * @param input.scenarioCategory - Optional scenario category.
 */
export function buildPdktEvaluationPrompt(input: {
  inboundEmailBody: string;
  agentReplyBody: string;
  scenarioTitle?: string;
  scenarioCategory?: string;
}): { systemInstruction: string; prompt: string } {
  const systemInstruction = [
    "Anda adalah supervisor QA untuk pelatihan agent kontak OJK 157.",
    "Trainee yang dinilai adalah agent contact center OJK 157, bukan pegawai perusahaan terlapor.",
    "Jangan menyebut trainee sebagai agent asuransi, agent bank, agent leasing, atau agent perusahaan jasa keuangan lain.",
    "Berikan evaluasi objektif dalam JSON berbahasa Indonesia.",
  ].join(" ");

  const prompt = `
    KONTEKS PELATIHAN:
    - Kanal: Email/contact center OJK 157.
    - Peran trainee: agent kontak OJK 157 yang menerima pengaduan konsumen sektor jasa keuangan.
    - Skenario: ${input.scenarioCategory || "Umum"} - ${input.scenarioTitle || "Tidak disebutkan"}.
    - Catatan penting: perusahaan terlapor dapat berupa bank/asuransi/leasing/pinjol, tetapi agent yang dinilai tetap agent OJK 157.

    EMAIL KONSUMEN:
    "${input.inboundEmailBody}"

    BALASAN AGENT OJK 157:
    "${input.agentReplyBody}"

    TUGAS:
    Nilai balasan agent OJK 157 di atas terhadap email konsumen yang diterima.

    KRITERIA PENILAIAN (Skor Awal 100):
    1. TYPO: Salah ketik, ejaan, atau format.
    2. CLARITY: Apakah mudah dimengerti? Struktur logis?
    3. RELEVANSI: Apakah menjawab masalah inti dan mengarahkan konsumen dengan tepat sebagai OJK 157?

    OUTPUT JSON:
    { "score": number, "typos": string[], "clarityIssues": string[], "contentGaps": string[], "feedback": string }
  `;

  return { systemInstruction, prompt };
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
  error?: string;
}> {
  const modelId = config.selectedModel || "gemini-3.1-flash-lite";

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

  const scenario = config.scenarios?.[0];
  const { systemInstruction, prompt: evaluationPrompt } =
    buildPdktEvaluationPrompt({
      inboundEmailBody,
      agentReplyBody,
      scenarioTitle: scenario?.title,
      scenarioCategory: scenario?.category,
    });

  // Log context for observability (no body content logged)
  console.debug(
    `[PDKT Evaluation] Single inbound → single reply (${inboundEmailBody.length}/${agentReplyBody.length} chars)`,
  );

  let lastError: unknown;
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
      const result = parseJsonFromModelText(evalText);

      return {
        success: true,
        score: result.score ?? 0,
        typos: result.typos || [],
        clarityIssues: result.clarityIssues || [],
        contentGaps: result.contentGaps || [],
        feedback: result.feedback || "Tidak ada masukan.",
      };
    } catch (error: unknown) {
      lastError = error;
      if (!isTransientAiError(error) || attempt === retryDelaysMs.length) break;

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt]),
      );
    }
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

  if (history.evaluation_status === "completed" && history.evaluation) {
    return history.evaluation as PdktEvaluationResult;
  }

  const nowIso = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from("pdkt_history")
    .update({
      evaluation_status: "processing",
      evaluation_started_at: nowIso,
      evaluation_error: null,
    })
    .eq("id", historyId)
    .or(
      `evaluation_started_at.is.null,evaluation_started_at.lt.${staleThreshold}`,
    )
    .neq("evaluation_status", "completed")
    .select("id");

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
          err instanceof Error ? err.message : typeof err === "string" ? err : String(err),
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq("id", historyId)
      .eq("evaluation_started_at", nowIso);

    throw err;
  }
}
