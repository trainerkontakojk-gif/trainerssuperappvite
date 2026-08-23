import type { Page } from "@playwright/test";

/**
 * Mock Supabase auth untuk Playwright — staging-safe.
 * Pola diambil dari sidak-agent-html-export-parity.spec.ts (handoff.md:422)
 * Jangan persist magic link / OTP / token ke repo, cukup mock di memory.
 */
const SUPABASE_URL = "https://ruosnjmtywcrghjgqugz.supabase.co";
const SUPABASE_STORAGE_KEY = "sb-ruosnjmtywcrghjgqugz-auth-token";

export type MockAuthOptions = {
  email?: string;
  role?: string;
  fullName?: string;
};

export function buildMockAuth(opts: MockAuthOptions = {}) {
  const email = opts.email ?? "trainer.visual@trainers.local";
  const role = opts.role ?? "trainer";
  const fullName = opts.fullName ?? "Trainer Visual";

  const authUser = {
    id: "user-1",
    aud: "authenticated",
    role: "authenticated",
    email,
    created_at: "2026-07-28T08:00:00.000Z",
    app_metadata: {},
    user_metadata: {},
  };

  const authSession = {
    access_token: "live-test-token",
    refresh_token: "refresh-test-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUser,
  };

  const authProfile = {
    id: authUser.id,
    email: authUser.email,
    full_name: fullName,
    role,
    status: "active",
    is_deleted: false,
  };

  return { authUser, authSession, authProfile, storageKey: SUPABASE_STORAGE_KEY, supabaseUrl: SUPABASE_URL };
}

function toJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  };
}

/**
 * Pasang mock auth ke page — panggil SEBELUM page.goto()
 * Contoh:
 *   await mockSupabaseAuth(page);
 *   await page.goto("/dashboard");
 */
export async function mockSupabaseAuth(page: Page, opts: MockAuthOptions = {}) {
  const { authUser, authSession, authProfile, storageKey } = buildMockAuth(opts);

  await page.addInitScript(
    ({ session, profile, storageKey }) => {
      localStorage.setItem("auth_token", session.access_token);
      localStorage.setItem("auth_profile", JSON.stringify(profile));
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { session: authSession, profile: authProfile, storageKey },
  );

  await page.route("**/auth/v1/user*", async (route) => {
    await route.fulfill(toJson({ user: authUser }));
  });

  await page.route("**/rest/v1/profiles*", async (route) => {
    await route.fulfill(
      toJson([authProfile], 200, {
        "content-range": "0-0/1",
      }),
    );
  });

  return { authUser, authSession, authProfile };
}

/**
 * Helper untuk override storage key jika project pakai custom Supabase URL
 * (biasanya tidak perlu, default sudah benar)
 */
export { SUPABASE_STORAGE_KEY };
