import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

// Retired admission values remain parseable for deployment compatibility, but
// their parsed values are deliberately inert. They cannot make a new OpenAI
// Realtime session available.
const retiredFlag = z
  .unknown()
  .optional()
  .transform(() => false);
const retiredList = z
  .unknown()
  .optional()
  .transform(() => [] as string[]);

export const telefunEnvSchema = z
  .object({
    PORT: z.string().default("3002").transform(Number),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    // Optional solely for historical WebRTC hangup cleanup. It never changes
    // readiness, provider selection, or admission.
    OPENAI_API_KEY: optionalSecret,
    TELEFUN_OPENAI_ENABLED: retiredFlag,
    TELEFUN_OPENAI_WEBRTC_POC_ENABLED: retiredFlag,
    TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS: retiredList,
    TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS: retiredList,
    TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(15_000),
    TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(10_000),
    TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY: optionalSecret,
    TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000),
    TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(10_000),
    TELEFUN_OPENAI_WEBRTC_MAX_USER_SESSIONS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(1),
    TELEFUN_OPENAI_WEBRTC_MAX_PROVIDER_SESSIONS: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(100),
    TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(10),
    TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    TELEFUN_INTERNAL_TOKEN: optionalSecret,
    ALLOWED_ORIGINS: z.string().default("*"),
    NODE_ENV: z
      .enum(["development", "staging", "production", "test"])
      .default("development"),
  })
  .superRefine((value, context) => {
    if (
      value.TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY &&
      value.TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY.length < 32
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY"],
        message:
          "TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY must contain at least 32 characters",
      });
    }
    if (value.NODE_ENV === "production") {
      const origins = value.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      if (origins.length === 0 || origins.includes("*")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ALLOWED_ORIGINS"],
          message:
            "ALLOWED_ORIGINS must be an exact production origin allowlist",
        });
      }
      for (const origin of origins) {
        try {
          const parsedOrigin = new URL(origin);
          if (
            parsedOrigin.protocol !== "https:" ||
            parsedOrigin.origin !== origin ||
            parsedOrigin.username ||
            parsedOrigin.password ||
            parsedOrigin.hostname.includes("*")
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["ALLOWED_ORIGINS"],
              message: "Production ALLOWED_ORIGINS must use HTTPS",
            });
            break;
          }
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["ALLOWED_ORIGINS"],
            message:
              "Production ALLOWED_ORIGINS must contain valid HTTPS origins",
          });
          break;
        }
      }
    }
  });

export type TelefunEnv = z.infer<typeof telefunEnvSchema>;

export function parseTelefunEnv(input: unknown) {
  return telefunEnvSchema.safeParse(input);
}
