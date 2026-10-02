import type { Page } from "@playwright/test";

/**
 * Mock Supabase auth untuk Playwright — staging-safe.
 * Pola diambil dari sidak-agent-html-export-parity.spec.ts (handoff.md:422)
 * Jangan persist magic link / OTP / token ke repo, cukup mock di memory.
 *
 * ## KONTRAK (baca sebelum menambah spec baru)
 *
 * Helper ini **hanya** membuat aplikasi MENGANGGAP dirinya login. Ia tidak
 * menghasilkan token yang sah:
 *
 *   - `access_token` di sini adalah string tetap, bukan JWT Supabase;
 *   - yang dimock hanya `/auth/v1/user` dan `/rest/v1/profiles`, jadi penjaga
 *     route di frontend lolos;
 *   - `authMiddleware` di `apps/api` memvalidasi bearer token lewat
 *     `supabaseAdmin.auth.getUser(token)`, sehingga token ini dijawab
 *     `401 INVALID_TOKEN`. Dibuktikan dengan probe langsung:
 *     `curl -H "Authorization: Bearer live-test-token" /api/v1/profiler/years`
 *     → 401. Lihat `plans/markdown/e2e-mocked-auth-contract.md`.
 *
 * Jadi hanya ada dua pola yang SAH:
 *
 *   1. **Spec hermetic** — mock SEMUA `/api` yang dipakai halaman, mengikuti
 *      `helpers/sidakTemuanDatesHarness.ts` atau
 *      `helpers/sidakAgentReportFixture.ts` (fail-closed, plus
 *      `assertLocalDevOnlyTarget`). Ini default untuk mayoritas spec.
 *   2. **Spec backend nyata** — pakai `helpers/sidakRealBackend.ts`, yang membaca
 *      `apps/api/.env.integration` (WAJIB loopback) dan membuat JWT asli lewat
 *      `createUserWithJwt`. Jangan pakai helper ini untuk keperluan itu.
 *
 * Memakai `mockSupabaseAuth` lalu memanggil `/api` sungguhan adalah bug, bukan
 * "spec yang sedang gagal": kombinasi itu tidak akan pernah hijau.
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
 * Pasang sesi mock ke page — panggil SEBELUM page.goto().
 *
 * Hanya menyuntik localStorage dan mengembalikan payload-nya; TIDAK memasang
 * route. Dipakai `mockSupabaseAuth` dan oleh harness yang mengelola rutenya
 * sendiri di dalam satu guard fail-closed (mis. `helpers/hermeticShell.ts`),
 * supaya logika sesi tidak digandakan.
 */
export async function installMockAuthSession(
  page: Page,
  opts: MockAuthOptions = {},
) {
  const payload = buildMockAuth(opts);
  const { authSession, authProfile, storageKey } = payload;

  await page.addInitScript(
    ({ session, profile, storageKey }) => {
      localStorage.setItem("auth_token", session.access_token);
      localStorage.setItem("auth_profile", JSON.stringify(profile));
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { session: authSession, profile: authProfile, storageKey },
  );

  return payload;
}

/**
 * Pasang mock auth ke page — panggil SEBELUM page.goto()
 * Contoh:
 *   await mockSupabaseAuth(page);
 *   await page.goto("/dashboard");
 */
export async function mockSupabaseAuth(page: Page, opts: MockAuthOptions = {}) {
  const { authUser, authSession, authProfile } = await installMockAuthSession(
    page,
    opts,
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

  // supabase-js me-refresh token saat bootstrap. Tanpa mock ini, request itu
  // menembus ke endpoint auth asli, gagal, lalu klien melakukan SIGNED_OUT —
  // aplikasi redirect ke landing dan shell terautentikasi tidak pernah tampil.
  await page.route("**/auth/v1/token*", async (route) => {
    await route.fulfill(
      toJson({
        ...authSession,
        user: authUser,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
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
