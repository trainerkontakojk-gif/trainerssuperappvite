import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabaseAdmin = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

console.log(
  `[API] Supabase client initialized for project ${new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]}`,
);

export function createAdminClient() {
  return supabaseAdmin;
}

export function createUserClient(token: string) {
  return createClient(env.VITE_SUPABASE_URL, token, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
