import { z } from "zod";

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
