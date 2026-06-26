import { supabase } from "./supabase";
import { clearAuthLocalState } from "./authLocalState";
import { useAuthStore } from "../store/authStore";

export async function signOutLocalSession({
  markLoggedOut = true,
  redirectTo = "/",
}: {
  markLoggedOut?: boolean;
  redirectTo?: string | null;
} = {}) {
  clearAuthLocalState({ markLoggedOut });
  useAuthStore.getState().setSession(null);
  useAuthStore.getState().setProfile(null);

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("[Auth] local signOut failed:", error);
  } finally {
    if (redirectTo) {
      window.location.href = redirectTo;
    }
  }
}
