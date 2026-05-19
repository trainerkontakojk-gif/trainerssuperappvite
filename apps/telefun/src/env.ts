import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3002').transform(Number),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  GEMINI_API_KEY: z.string(),
  ALLOWED_ORIGINS: z.string().default('*'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ [Telefun] Invalid or missing environment variables:');
  const errors = parsed.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([field, messages]) => {
    console.error(`   - ${field}: ${messages?.join(', ')}`);
  });
  process.exit(1);
}

export const env = parsed.data;
