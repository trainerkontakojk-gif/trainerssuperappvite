import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const telefunEnvSchema = z
  .object({
    PORT: z.string().default("3002").transform(Number),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    OPENAI_API_KEY: optionalSecret,
    TELEFUN_OPENAI_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    TELEFUN_INTERNAL_TOKEN: optionalSecret,
    ALLOWED_ORIGINS: z.string().default("*"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .superRefine((value, context) => {
    if (value.TELEFUN_OPENAI_ENABLED && !value.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when TELEFUN_OPENAI_ENABLED=true",
      });
    }
    if (value.TELEFUN_OPENAI_ENABLED && !value.TELEFUN_INTERNAL_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TELEFUN_INTERNAL_TOKEN"],
        message:
          "TELEFUN_INTERNAL_TOKEN is required when TELEFUN_OPENAI_ENABLED=true",
      });
    }
  });

export type TelefunEnv = z.infer<typeof telefunEnvSchema>;

export function parseTelefunEnv(input: unknown) {
  return telefunEnvSchema.safeParse(input);
}
