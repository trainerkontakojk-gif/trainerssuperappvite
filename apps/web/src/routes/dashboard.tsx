import { useAuthStore } from "../store/authStore";
import { StaffHome } from "./dashboard/home/StaffHome";

/** Beranda (`/dashboard`), staff only; the route guard sends agents to SIDAK saya. */
export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  return (
    <StaffHome
      role={profile?.role}
      displayName={profile?.full_name || "Pengguna"}
    />
  );
}
