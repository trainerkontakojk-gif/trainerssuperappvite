import { useAuthStore } from "../store/authStore";

const READ_ONLY_ROLES = ["leader", "qa"];

/**
 * Mode akses Profiler untuk UI. Role diambil dari profil di auth store (sumber
 * yang sama dengan route guard dan `LeaderAccessGate`); otorisasi sebenarnya
 * tetap di backend.
 */
export function useProfilerAccess(): { isReadOnly: boolean; role: string } {
  const role = useAuthStore((state) => state.profile?.role) || "trainer";
  return { isReadOnly: READ_ONLY_ROLES.includes(role), role };
}
