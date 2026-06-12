import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─────────────────────────────────────────────────────────────
// Integration Test Client Helper
// Provides service-role and authenticated Supabase clients
// for local DB integration tests.
// ─────────────────────────────────────────────────────────────

interface IntegrationEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
}

function loadEnv(): IntegrationEnv {
  const envPath = resolve(process.cwd(), ".env.integration");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    return {
      url: vars.SUPABASE_URL,
      anonKey: vars.SUPABASE_ANON_KEY,
      serviceRoleKey: vars.SUPABASE_SERVICE_ROLE_KEY,
      dbUrl: vars.SUPABASE_DB_URL,
    };
  }

  return {
    url: process.env.SUPABASE_URL || "",
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "",
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      "",
    dbUrl: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "",
  };
}

const env = loadEnv();
const missingEnv = Object.entries(env)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnv.length > 0) {
  throw new Error(
    `Missing integration environment values: ${missingEnv.join(", ")}. ` +
      "Run bash scripts/integration/supabase-bootstrap.sh first.",
  );
}

/** Service-role client — bypasses RLS, for test setup/teardown */
export function serviceRoleClient(): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon client — unauthenticated, for testing RPC rejection */
export function anonClient(): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Creates a test user via the Auth Admin API and returns user credentials.
 * Also inserts a corresponding public.profiles row.
 */
export async function createTestUser(
  role: string = "agent",
): Promise<TestUser> {
  const suffix = Date.now() + Math.random().toString(36).slice(2, 6);
  const email = `test-${role}-${suffix}@integration.test`;
  const password = "test-pass-123";

  // Create via Auth Admin REST API
  const res = await fetch(`${env.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create auth user: ${res.status} ${body}`);
  }
  const userData = await res.json();
  const userId = userData.id;

  // Auth triggers may have created this row already.
  const sb = serviceRoleClient();
  const { error: profileErr } = await sb.from("profiles").upsert({
    id: userId,
    email,
    full_name: `Test ${role}`,
    role,
    status: "active",
    is_deleted: false,
  });
  if (profileErr) {
    await deleteAuthUser(userId);
    throw new Error(`Failed to create profile: ${profileErr.message}`);
  }

  return { id: userId, email, password };
}

/**
 * Creates an authenticated Supabase client by signing in.
 */
export async function authenticatedClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign-in failed for ${email}: ${res.status} ${body}`);
  }
  const session = await res.json();

  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  });
  return client;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const response = await fetch(`${env.url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Failed to delete auth user ${userId}: ${response.status} ${await response.text()}`,
    );
  }
}

export function getEnv() {
  return env;
}
