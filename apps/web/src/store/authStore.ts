import { create } from "zustand";
import { normalizeRole, type UserProfile } from "@trainers/types";
import { Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => {
    const role = normalizeRole(profile?.role);
    set({ profile: profile && role ? { ...profile, role } : null });
  },
}));
