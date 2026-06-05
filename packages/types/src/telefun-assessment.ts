import { z } from "zod";
import type { TelefunCommunicationProfile } from "./telefun";
import { enrichAssessmentWithCommunicationProfile } from "./telefun-communication-profile";

const finiteNumber = z.number().finite();
const scoreSchema = finiteNumber.transform((value) =>
  Math.max(0, Math.min(10, value)),
);
const scoreResponseSchema = finiteNumber.min(0).max(10);

const boundedStringArraySchema = (max: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string")
            .slice(0, max)
        : [],
    z.array(z.string()).max(max),
  );

export const voiceAspectScoreSchema = z.object({
  score: scoreSchema,
  verdict: z.string(),
  feedback: z.string(),
});

export const telefunHoldAssessmentSchema = z.object({
  status: z.enum(["not_used", "within_limit", "exceeded"]),
  score: scoreSchema.nullable(),
  verdict: z.enum(["N/A", "Baik", "Kurang"]),
  feedback: z.string(),
  holdCount: finiteNumber.int().nonnegative(),
  totalDurationMs: finiteNumber.nonnegative(),
  longestDurationMs: finiteNumber.nonnegative(),
  exceededCount: finiteNumber.int().nonnegative(),
});

export const telefunVoiceMetricKeySchema = z.enum([
  "speakingRate",
  "intonation",
  "articulation",
  "fillers",
  "tone",
]);
export type TelefunVoiceMetricKey = z.infer<typeof telefunVoiceMetricKeySchema>;

export const telefunMetricStatusSchema = z.enum([
  "good",
  "needs_improvement",
  "poor",
]);
export type TelefunMetricStatus = z.infer<typeof telefunMetricStatusSchema>;

export const communicationMetricModeSchema = z.enum([
  "higher_better",
  "lower_better",
  "optimal_range",
]);
export type CommunicationMetricMode = z.infer<
  typeof communicationMetricModeSchema
>;

export const communicationMetricSchema = z.object({
  key: telefunVoiceMetricKeySchema,
  label: z.string(),
  value: finiteNumber,
  benchmarkValue: finiteNumber,
  score: scoreResponseSchema,
  displayScore: finiteNumber,
  targetScore: finiteNumber,
  targetDirection: z.enum([
    "match_target",
    "higher_quality",
    "lower_raw_is_better",
  ]),
  rawValue: z.union([z.number(), z.string()]).optional(),
  rawUnit: z.enum(["WPM", "filler_words", "dominant_tone"]).optional(),
  evaluationMode: communicationMetricModeSchema,
  idealMin: finiteNumber.optional(),
  idealMax: finiteNumber.optional(),
  goodMin: finiteNumber.optional(),
  goodMax: finiteNumber.optional(),
  verdict: z.string(),
  status: telefunMetricStatusSchema,
  feedback: z.string(),
  explanation: z.string(),
  improvementTip: z.string().optional(),
});

export const telefunCommunicationProfileSchema = z.object({
  metrics: z.array(communicationMetricSchema),
  overallSummary: z.string(),
  strengths: z.array(z.string()),
  improvementPriorities: z.array(z.string()),
});
export type TelefunCommunicationProfile = z.infer<
  typeof telefunCommunicationProfileSchema
>;

export const NOT_USED_HOLD_ASSESSMENT: TelefunHoldAssessment = {
  status: "not_used",
  score: null,
  verdict: "N/A",
  feedback: "User tidak menggunakan hold pada sesi ini.",
  holdCount: 0,
  totalDurationMs: 0,
  longestDurationMs: 0,
  exceededCount: 0,
};

export const voiceQualityAssessmentInputSchema = z.object({
  overallScore: scoreSchema,
  speakingRate: voiceAspectScoreSchema.extend({
    wordsPerMinute: finiteNumber.nonnegative(),
  }),
  intonation: voiceAspectScoreSchema,
  articulation: voiceAspectScoreSchema,
  fillerWords: voiceAspectScoreSchema.extend({
    count: finiteNumber.int().nonnegative(),
    examples: boundedStringArraySchema(10),
  }),
  emotionalTone: voiceAspectScoreSchema.extend({
    dominant: z.string(),
  }),
  transcript: z.string().default(""),
  highlights: boundedStringArraySchema(5).default([]),
  strengths: boundedStringArraySchema(5).default([]),
  holdManagement: telefunHoldAssessmentSchema
    .catch(NOT_USED_HOLD_ASSESSMENT)
    .default(NOT_USED_HOLD_ASSESSMENT),
  communicationProfile: z.unknown().optional(),
});

export const telefunScoreEnvelopeSchema = z.object({
  score: scoreResponseSchema,
  feedback: z.string(),
  assessment: z.unknown(),
});

export type VoiceAspectScore = z.infer<typeof voiceAspectScoreSchema>;
export type TelefunHoldAssessment = z.infer<typeof telefunHoldAssessmentSchema>;
export type VoiceQualityAssessment = z.output<
  typeof voiceQualityAssessmentInputSchema
>;
export type TelefunScoreResult = {
  score: number;
  feedback: string;
  assessment: VoiceQualityAssessment;
};

export function parseVoiceQualityAssessment(
  input: unknown,
): VoiceQualityAssessment | null {
  const parsed = voiceQualityAssessmentInputSchema.safeParse(input);
  if (!parsed.success) return null;

  return enrichAssessmentWithCommunicationProfile(
    parsed.data as VoiceQualityAssessment,
  );
}

export function parseTelefunScoreResult(
  input: unknown,
): TelefunScoreResult | null {
  const envelope = telefunScoreEnvelopeSchema.safeParse(input);
  if (!envelope.success) return null;

  const assessment = parseVoiceQualityAssessment(envelope.data.assessment);
  if (!assessment) return null;
  if (envelope.data.score !== assessment.overallScore) return null;

  return {
    score: envelope.data.score,
    feedback: envelope.data.feedback,
    assessment,
  };
}
