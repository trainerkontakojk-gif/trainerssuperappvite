import {
  parseVoiceQualityAssessment,
  type TelefunHistoryScoringView,
  type TelefunScoringStatus,
  type VoiceQualityAssessment,
} from "@trainers/types";
import { MAX_SCORING_ATTEMPTS } from "./telefun-scoring-errors";

export function buildTelefunFeedbackSummary(
  assessment: VoiceQualityAssessment,
): string {
  const voiceParts = [
    assessment.speakingRate.feedback,
    assessment.intonation.feedback,
    assessment.articulation.feedback,
    assessment.fillerWords.feedback,
    assessment.emotionalTone.feedback,
  ]
    .filter(Boolean)
    .slice(0, 3);
  const holdFeedback =
    assessment.holdManagement?.status &&
    assessment.holdManagement.status !== "not_used"
      ? assessment.holdManagement.feedback
      : null;
  return [...voiceParts, holdFeedback].filter(Boolean).join("\n\n");
}

const TELEFUN_SCORING_STATUSES: ReadonlyArray<TelefunScoringStatus> = [
  "pending",
  "processing",
  "completed",
  "failed",
];

export function buildTelefunHistoryScoringView(row: {
  scoring_status?: unknown;
  scoring_ready_at?: unknown;
  scoring_next_attempt_at?: unknown;
  scoring_attempt_count?: unknown;
  score?: unknown;
  feedback?: unknown;
  voice_assessment?: unknown;
}): TelefunHistoryScoringView {
  const scoringStatus = TELEFUN_SCORING_STATUSES.includes(
    row.scoring_status as TelefunScoringStatus,
  )
    ? (row.scoring_status as TelefunScoringStatus)
    : null;
  const scoringNextAttemptAt =
    typeof row.scoring_next_attempt_at === "string" &&
    row.scoring_next_attempt_at
      ? row.scoring_next_attempt_at
      : null;
  const scoringAttemptCount =
    typeof row.scoring_attempt_count === "number"
      ? row.scoring_attempt_count
      : 0;

  return {
    scoring_status: scoringStatus,
    scoring_ready_at:
      typeof row.scoring_ready_at === "string" && row.scoring_ready_at
        ? row.scoring_ready_at
        : null,
    scoring_next_attempt_at: scoringNextAttemptAt,
    scoring_retryable:
      scoringStatus === "failed" &&
      scoringAttemptCount < MAX_SCORING_ATTEMPTS &&
      scoringNextAttemptAt !== null,
    score: typeof row.score === "number" ? row.score : null,
    feedback:
      typeof row.feedback === "string" && row.feedback.trim()
        ? row.feedback
        : null,
    voice_assessment: row.voice_assessment ?? null,
  };
}

export function enrichTelefunHistoryFeedback<
  T extends {
    feedback?: unknown;
    status?: unknown;
    telefun_transport?: unknown;
    voice_assessment?: unknown;
  },
>(row: T): T {
  if (typeof row.feedback === "string" && row.feedback.trim()) return row;
  if (row.telefun_transport !== "openai-webrtc" || row.status !== "completed") {
    return row;
  }

  const assessment = parseVoiceQualityAssessment(row.voice_assessment);
  if (!assessment) return row;

  const feedback = buildTelefunFeedbackSummary(assessment);
  return feedback ? { ...row, feedback } : row;
}
