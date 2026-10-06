import { can } from "@trainers/types";
import { useAuthStore } from "../store/authStore";

/**
 * Mode akses Profiler untuk UI. Role diambil dari profil di auth store (sumber
 * yang sama dengan route guard dan `LeaderAccessGate`); otorisasi sebenarnya
 * tetap di backend.
 */
export function useProfilerAccess(): { isReadOnly: boolean; role: string } {
  const role = useAuthStore((state) => state.profile?.role);
  return { isReadOnly: !can(role, "profiler.write"), role: role ?? "" };
}
