import { supabase } from "../lib/supabase";
import { useAuthStore } from "./authStore";
import { fetchAuthProfile } from "../lib/fetchAuthProfile";
import { hasLogoutGuestLock, clearAuthLocalState } from "../lib/authLocalState";

export async function initAuth() {
  // Subscribe to authentication state changes
  // Callback MUST be synchronous to avoid deadlocks in Supabase client.
  // Profile hydration is deferred via queueMicrotask.
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) {
      if (hasLogoutGuestLock()) {
        clearAuthLocalState();
        useAuthStore.getState().setSession(null);
        useAuthStore.getState().setProfile(null);
        return;
      }
      localStorage.setItem("auth_token", session.access_token);
      useAuthStore.getState().setSession(session);
      queueMicrotask(() => {
        fetchAuthProfile(session.user.id).catch((err) =>
          console.warn("[authInit] Profile hydration error:", err),
        );
      });
    } else {
      clearAuthLocalState();
      useAuthStore.getState().setSession(null);
      useAuthStore.getState().setProfile(null);

      // If we are signed out and currently on a non-public route, redirect to landing
      const publicRoutes = [
        "/",
        "/auth/callback",
        "/waiting-approval",
        "/reset-password",
      ];
      if (!publicRoutes.includes(window.location.pathname)) {
        window.location.href = "/";
      }
    }
  });

  if (hasLogoutGuestLock()) {
    clearAuthLocalState();
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
    return;
  }

  const token = localStorage.getItem("auth_token");
  if (!token) return;

  const userResponse = await supabase.auth.getUser(token);
  const user = userResponse?.data?.user ?? null;
  const error = userResponse?.error ?? null;
  if (error || !user) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_profile");
    return;
  }

  const sessionResponse = await supabase.auth.getSession();
  const session = sessionResponse?.data?.session ?? null;
  if (session) {
    useAuthStore.getState().setSession(session);
  } else {
    useAuthStore.getState().setSession({ access_token: token, user } as any);
  }

  await fetchAuthProfile(user.id);
}
