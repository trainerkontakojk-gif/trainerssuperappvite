import { checkDevDatabaseTarget } from "@trainers/types";
import { parseTelefunEnv } from "./env-schema.js";

try {
  process.loadEnvFile("../../.env.local");
} catch (_e) {
  // Ignore if file doesn't exist
}

const parsed = parseTelefunEnv(process.env);

if (!parsed.success) {
  console.error("❌ [Telefun] Invalid or missing environment variables:");
  const errors = parsed.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([field, messages]) => {
    console.error(`   - ${field}: ${messages?.join(", ")}`);
  });
  process.exit(1);
}

const guard = checkDevDatabaseTarget(
  "Telefun",
  parsed.data.SUPABASE_URL,
  process.env,
);
if (guard.kind === "refused") {
  console.error(guard.message);
  process.exit(1);
}
if (guard.kind === "allowed") console.warn(guard.message);

export const env = parsed.data;
