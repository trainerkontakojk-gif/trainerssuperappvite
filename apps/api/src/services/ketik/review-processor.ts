import { Type } from "@google/genai";
import { createAdminClient } from "../../lib/supabase";
import { generateGeminiContent } from "../../lib/gemini";
import { generateOpenRouterContent } from "../../lib/openrouter";
import { sanitizeAiResponse } from "../../lib/ai-sanitize";
import { UsageContext } from "../../lib/ai-usage";
import { extractJsonObjectText } from "./shared-utils";

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    coachingFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
    scores: {
      type: Type.OBJECT,
      properties: {
        final: { type: Type.NUMBER },
        empathy: { type: Type.NUMBER },
        probing: { type: Type.NUMBER },
        typo: { type: Type.NUMBER },
        compliance: { type: Type.NUMBER },
      },
      required: ["final", "empathy", "probing", "typo", "compliance"],
    },
    typos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING },
          originalWord: { type: Type.STRING },
          correctedWord: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ["minor", "medium", "critical"],
          },
        },
        required: ["messageId", "originalWord", "correctedWord", "severity"],
      },
    },
  },
  required: [
    "summary",
    "strengths",
    "weaknesses",
    "coachingFocus",
    "scores",
    "typos",
  ],
};

async function generateKetikReviewAiResponse(options: {
  systemInstruction: string;
  contents: { role: string; parts: { text: string }[] }[];
  userId: string;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  const usageContext: UsageContext = { module: "ketik", action: "coaching_review" };

  // Try Gemini first
  try {
    const geminiResp = await generateGeminiContent({
      model: "gemini-3.1-flash-lite",
      systemInstruction: options.systemInstruction,
      contents: options.contents as any,
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
      usageContext,
      userId: options.userId,
      sanitizeOutput: false,
    });
    if (geminiResp.success && geminiResp.text) {
      return geminiResp;
    }
    console.warn("[KETIK Review] Gemini failed, falling back to OpenRouter:", geminiResp.error);
  } catch (err) {
    console.warn("[KETIK Review] Gemini exception, falling back to OpenRouter:", err);
  }

  // Fallback to OpenRouter
  try {
    const orResp = await generateOpenRouterContent({
      model: "openai/gpt-4o-mini",
      systemInstruction: options.systemInstruction,
      contents: options.contents,
      responseMimeType: "application/json",
      usageContext,
      userId: options.userId,
      sanitizeOutput: false,
    });
    return orResp;
  } catch (err) {
    console.error("[KETIK Review] OpenRouter fallback also failed:", err);
    return { success: false, error: "AI tidak tersedia dari provider manapun." };
  }
}

function sanitizeKetikReviewResult(result: any): void {
  if (!result || typeof result !== "object") return;
  if (typeof result.summary === "string") {
    result.summary = sanitizeAiResponse(result.summary);
  }
  if (Array.isArray(result.strengths)) {
    result.strengths = result.strengths.map((s: any) =>
      typeof s === "string" ? sanitizeAiResponse(s) : s,
    );
  }
  if (Array.isArray(result.weaknesses)) {
    result.weaknesses = result.weaknesses.map((w: any) =>
      typeof w === "string" ? sanitizeAiResponse(w) : w,
    );
  }
  if (Array.isArray(result.coachingFocus)) {
    result.coachingFocus = result.coachingFocus.map((c: any) =>
      typeof c === "string" ? sanitizeAiResponse(c) : c,
    );
  }
}

export async function processKetikReviewJob(
  sessionId: string,
  leaseOwner?: string,
): Promise<any> {
  const adminClient = createAdminClient();

  const { data: session, error: sessionError } = await adminClient
    .from("ketik_history")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Session not found");
  }

  const transcript = JSON.stringify(session.messages);

  const systemInstruction = `
  You are an expert Quality Assurance (QA) and Coaching AI for a customer service contact center.
  Review the customer service chat transcript between an Agent (user) and a Consumer (consumer).

  Evaluation Categories (Skala 0-100):
  - Communication (naturalness, empathy, readability, professionalism)
  - Probing (depth, relevance, chronology gathering)
  - Resolution (clarity, actionable response, completeness)
  - Compliance (no misinformation, no victim blaming, no rude wording)
  - Typo & Writing (typo frequency, readability)

  Rubrik Penilaian (0-100):
  - 90-100: Sangat Baik (Excellent)
  - 75-89: Baik (Good)
  - 60-74: Cukup (Fair)
  - <60: Perlu Coaching (Needs Coaching)

  Rules for Typo Detection:
  - Ignore common Indonesian slang/informal words like 'yg', 'sy', 'kak', 'ga', 'gak', 'ok', 'oke'.
  - Identify formal typos that affect professionalism or readability.
  - Severity: 'minor' (small typo), 'medium' (repeated or confusing), 'critical' (changes meaning or unprofessional).

  IMPORTANT: ALL textual response (summary, strengths, weaknesses, coachingFocus) MUST be in Indonesian.
  `;

  const aiResponse = await generateKetikReviewAiResponse({
    systemInstruction,
    contents: [
      { role: "user", parts: [{ text: `Transcript:\n${transcript}` }] },
    ],
    userId: session.user_id,
  });

  if (!aiResponse.success || !aiResponse.text) {
    throw new Error(aiResponse.error || "AI Response failed or empty");
  }

  let reviewResult: any;
  try {
    reviewResult = JSON.parse(extractJsonObjectText(aiResponse.text));

    const clamp = (val: any) => {
      const num = Number(val);
      if (isNaN(num)) return 0;
      return Math.max(0, Math.min(100, Math.round(num)));
    };

    reviewResult.scores = {
      empathy: clamp(reviewResult.scores?.empathy),
      probing: clamp(reviewResult.scores?.probing),
      typo: clamp(reviewResult.scores?.typo),
      compliance: clamp(reviewResult.scores?.compliance),
      final: clamp(reviewResult.scores?.final),
    };

    const calculatedFinal = Math.round(
      (reviewResult.scores.empathy +
        reviewResult.scores.probing +
        reviewResult.scores.typo +
        reviewResult.scores.compliance) /
        4,
    );

    if (
      reviewResult.scores.final === 0 ||
      Math.abs(reviewResult.scores.final - calculatedFinal) > 15
    ) {
      reviewResult.scores.final = calculatedFinal;
    }

    if (!reviewResult.summary)
      reviewResult.summary = "Ringkasan tidak tersedia.";
    if (
      !Array.isArray(reviewResult.strengths) ||
      reviewResult.strengths.length === 0
    )
      reviewResult.strengths = [
        "Pertahankan profesionalisme dalam berkomunikasi.",
      ];
    if (
      !Array.isArray(reviewResult.weaknesses) ||
      reviewResult.weaknesses.length === 0
    )
      reviewResult.weaknesses = ["Terus latih teknik probing dan empati."];
    if (
      !Array.isArray(reviewResult.coachingFocus) ||
      reviewResult.coachingFocus.length === 0
    )
      reviewResult.coachingFocus = ["Fokus pada detail kebutuhan konsumen."];

    if (
      !reviewResult ||
      typeof reviewResult !== "object" ||
      !reviewResult.scores ||
      typeof reviewResult.scores.final !== "number" ||
      typeof reviewResult.summary !== "string"
    ) {
      throw new Error("Invalid AI response shape after normalization");
    }

    sanitizeKetikReviewResult(reviewResult);
  } catch (error) {
    console.error(
      "[processKetikReviewJob] Failed to parse or normalize AI response:",
      error,
      aiResponse.text,
    );
    throw new Error("AI response JSON tidak valid atau format tidak sesuai.", {
      cause: error,
    });
  }

  if (leaseOwner) {
    const renewedLeaseExpiresAt = new Date(
      Date.now() + 5 * 60 * 1000,
    ).toISOString();
    const { data: leaseRows, error: leaseError } = await adminClient
      .from("ketik_review_jobs")
      .update({ lease_expires_at: renewedLeaseExpiresAt })
      .eq("session_id", sessionId)
      .eq("status", "processing")
      .eq("lease_owner", leaseOwner)
      .select("id");

    if (leaseError) throw leaseError;

    if (!leaseRows || leaseRows.length === 0) {
      console.warn(
        `[processKetikReviewJob] Lease lost before persistence for session: ${sessionId}`,
      );
      return { status: "processing" };
    }
  }

  await adminClient
    .from("ketik_session_reviews")
    .delete()
    .eq("session_id", sessionId);

  const { error: reviewInsertError } = await adminClient
    .from("ketik_session_reviews")
    .insert({
      session_id: sessionId,
      ai_summary: reviewResult.summary,
      strengths: reviewResult.strengths,
      weaknesses: reviewResult.weaknesses,
      coaching_focus: reviewResult.coachingFocus,
    });

  if (reviewInsertError) throw reviewInsertError;

  await adminClient
    .from("ketik_typo_findings")
    .delete()
    .eq("session_id", sessionId);

  if (reviewResult.typos && reviewResult.typos.length > 0) {
    const typoInserts = reviewResult.typos.map((t: any) => ({
      session_id: sessionId,
      message_id: t.messageId,
      original_word: t.originalWord,
      corrected_word: t.correctedWord,
      severity: t.severity,
    }));

    const { error: typoInsertError } = await adminClient
      .from("ketik_typo_findings")
      .insert(typoInserts);

    if (typoInsertError) throw typoInsertError;
  }

  const { error: updateError } = await adminClient
    .from("ketik_history")
    .update({
      final_score: reviewResult.scores.final,
      empathy_score: reviewResult.scores.empathy,
      probing_score: reviewResult.scores.probing,
      typo_score: reviewResult.scores.typo,
      compliance_score: reviewResult.scores.compliance,
      review_status: "completed",
    })
    .eq("id", sessionId);

  if (updateError) throw updateError;

  // Dual-update to results
  try {
    await adminClient
      .from("results")
      .update({
        score: reviewResult.scores.final,
        status: "completed",
      })
      .eq("session_id", sessionId)
      .eq("module", "ketik");
  } catch (e) {
    console.error(e);
  }

  let jobUpdateQuery = adminClient
    .from("ketik_review_jobs")
    .update({ status: "completed", lease_owner: null, lease_expires_at: null })
    .eq("session_id", sessionId)
    .eq("status", "processing");

  if (leaseOwner) {
    jobUpdateQuery = jobUpdateQuery.eq("lease_owner", leaseOwner);
  }

  const { error: jobUpdateError } = await jobUpdateQuery;
  if (jobUpdateError) throw jobUpdateError;

  return { status: "completed", scores: reviewResult.scores };
}
