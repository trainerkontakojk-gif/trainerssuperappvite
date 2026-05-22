import { z } from "zod";

try {
  process.loadEnvFile("../../.env.local");
} catch (_e) {
  // Ignore if file doesn't exist
}

const envSchema = z.object({
  PORT: z.string().default("3001").transform(Number),
  VITE_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  ALLOWED_ORIGINS: z.string().optional(),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
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
