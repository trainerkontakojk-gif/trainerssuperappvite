import { z } from "zod";

/**
 * Gemini Live transcription hints for both lanes. Calls are Indonesian with
 * English service terms; without hints Gemini auto-detects per chunk and can
 * render informal Indonesian as another language. Native audio models reject
 * `speechConfig.languageCode`, so the hint lives on transcription only.
 */
export const TELEFUN_TRANSCRIPTION_CONFIG = {
  languageCodes: ["id-ID", "en-US"],
  customVocabulary: [
    "OJK",
    "SLIK",
    "pinjol",
    "157",
    "BI checking",
    "debt collector",
  ],
} as const;

export const telefunTranscriptSpeakerSchema = z.enum([
  "agent",
  "consumer",
]);

export const telefunTranscriptEntrySchema = z.object({
  speaker: telefunTranscriptSpeakerSchema,
  text: z.string().trim().min(1),
  startMs: z.number().finite().nonnegative(),
});

export const telefunTranscriptSchema = z.array(
  telefunTranscriptEntrySchema,
);

export type TelefunTranscriptSpeaker = z.infer<
  typeof telefunTranscriptSpeakerSchema
>;
export type TelefunTranscriptEntry = z.infer<
  typeof telefunTranscriptEntrySchema
>;

export function parseTelefunTranscript(
  input: unknown,
): TelefunTranscriptEntry[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    const parsed = telefunTranscriptEntrySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
