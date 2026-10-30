import type {
  KetikSessionHistoryItem,
  KetikSessionReview,
} from "@trainers/types";
import { readAspectScores } from "./reviewDisplay";

export function scoreChange(
  score: number,
  previous: number | null,
): string | null {
  if (previous === null) return null;
  const delta = score - previous;
  if (delta > 0) return `naik ${delta} dari sesi sebelumnya`;
  if (delta < 0) return `turun ${-delta} dari sesi sebelumnya`;
  return "sama dengan sesi sebelumnya";
}

export function buildKetikReviewView(
  session: KetikSessionHistoryItem,
  review: KetikSessionReview,
  previousScore: number | null,
) {
  const finalScore = session.finalScore ?? 0;
  const change = scoreChange(finalScore, previousScore);
  const aspects = readAspectScores(session);
  const guidance = [...(review.education?.dimensionGuidance ?? [])].sort(
    (a, b) => a.priorityRank - b.priorityRank,
  );

  const enriched = review.education?.typosEnriched ?? [];
  // Telaah lama tidak punya field anotasi sama sekali.
  const points = review.education?.consumerPoints;
  const notes = review.education?.agentNotes;
  const caseCore = review.education?.caseCore;
  const fixes = (notes ?? [])
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.verdict === "fix");
  const good = (notes ?? [])
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.verdict === "good");
  const statusOrder = { unanswered: 0, partial: 1, answered: 2 };
  const orderedPoints = (points ?? [])
    .map((point, index) => ({ point, index }))
    .sort((a, b) => statusOrder[a.point.status] - statusOrder[b.point.status]);
  const nextSteps = [
    ...new Set(
      [...review.coachingFocus, ...(review.education?.overallNextSteps ?? [])]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  return {
    finalScore,
    change,
    aspects,
    guidance,
    enriched,
    points,
    notes,
    caseCore,
    fixes,
    good,
    orderedPoints,
    nextSteps,
  };
}
