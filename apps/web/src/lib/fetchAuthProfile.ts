import { supabase } from "./supabase";
import { useAuthStore } from "../store/authStore";
import { normalizeProfileStatus } from "./profile";
import { normalizeRole, type UserProfile } from "@trainers/types";

export async function fetchAuthProfile(
  userId: string,
): Promise<UserProfile | null> {
  // "*" so a database without a newer column (is_deleted, active_until)
  // still loads the profile instead of failing the whole sign-in.
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<UserProfile>();
  let profile = data;

  const role = normalizeRole(profile?.role);
  if (profile && !role) profile = null;
  if (profile && role) {
    profile.role = role;
    profile.status = normalizeProfileStatus(
      profile.status,
    ) as UserProfile["status"];
    useAuthStore.getState().setProfile(profile);
    localStorage.setItem("auth_profile", JSON.stringify(profile));
  } else {
    useAuthStore.getState().setProfile(null);
    localStorage.removeItem("auth_profile");
  }

  return profile;
}
