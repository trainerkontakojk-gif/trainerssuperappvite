import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const envFile = path.join(repoRoot, ".env.local");

try {
  process.loadEnvFile(envFile);
} catch (_e) {
  // Ignore if file doesn't exist
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTelefunOpenAiWebRtcAllowedUserIds(
  value: string | undefined,
): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => UUID_PATTERN.test(item));
}

export function isTelefunOpenAiWebRtcRuntimeEnabled(input: {
  enabled: boolean;
  nodeEnv: string;
}): boolean {
  return (
    input.enabled &&
    (input.nodeEnv === "development" || input.nodeEnv === "staging")
  );
}

export function isTelefunOpenAiWebRtcAllowed(input: {
  enabled: boolean;
  nodeEnv: string;
  allowedUserIds: readonly string[];
  userId: string;
}): boolean {
  return (
    isTelefunOpenAiWebRtcRuntimeEnabled(input) &&
    input.allowedUserIds.includes(input.userId)
  );
}

export function isTelefunOpenAiWebRtcEligible(userId: string): boolean {
  return isTelefunOpenAiWebRtcAllowed({
    enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
    nodeEnv: env.NODE_ENV,
    allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
    userId,
  });
}

const envSchema = z.object({
  PORT: z.string().default("3001").transform(Number),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ALLOWED_ORIGINS: z.string().optional(),
  TELEFUN_OPENAI_WEBRTC_POC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS: z
    .string()
    .default("")
    .transform(parseTelefunOpenAiWebRtcAllowedUserIds),
  TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(10),
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ [API] Invalid or missing environment variables:");
  const errors = parsed.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([field, messages]) => {
    console.error(`   - ${field}: ${messages?.join(", ")}`);
  });
  process.exit(1);
}

export const env = parsed.data;
