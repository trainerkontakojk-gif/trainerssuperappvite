import {
  PdktSessionConfig,
  EmailMessage,
  PdktEvaluationResult,
} from "@trainers/types";
import { UsageContext } from "../../lib/ai-usage";
import { createAdminClient } from "../../lib/supabase";
import { parseJsonFromModelText } from "../../lib/ai-json";
import { callAI, isTransientAiError } from "./shared-utils";

/**
 * AI-powered agent response evaluation.
 * Returns score, feedback, and granular issues (typos, clarity, content gaps).
 */
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

  const lastAgentReply = [...emails].reverse().find((e) => e.isAgent);
  const firstInbound = emails.find((e) => !e.isAgent);

  if (!lastAgentReply || !firstInbound) {
    return { success: false, error: "Missing email context for evaluation." };
  }

  const evaluationPrompt = `
    Anda adalah SUPERVISOR QA OJK.
    
    KELUHAN KONSUMEN:
    "${firstInbound.body}"
    
    JAWABAN AGEN:
    "${lastAgentReply.body}"
    
    TUGAS: Nilai jawaban agen (Skor Awal 100).
    1. TYPO: Salah ketik.
    2. CLARITY: Apakah mudah dimengerti? Struktur logis?
    3. RELEVANSI: Apakah menjawab masalah inti?
    
    OUTPUT JSON:
    { "score": number, "typos": string[], "clarityIssues": string[], "contentGaps": string[], "feedback": string }
  `;

  let lastError: unknown;
  const retryDelaysMs = [250, 500];

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      const response = await callAI({
        model: modelId,
        prompt: evaluationPrompt,
        systemInstruction:
          "Anda adalah supervisor QA yang memberikan penilaian objektif dalam format JSON.",
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
    .eq("user_id", userId)
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
    .eq("user_id", userId)
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
      .eq("user_id", userId)
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
