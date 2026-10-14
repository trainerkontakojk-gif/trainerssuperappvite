import { useAuthStore } from "../store/authStore";
import { isCapabilityAllowed } from "../lib/app-config";
import { AgentHome } from "./dashboard/home/AgentHome";
import { StaffHome } from "./dashboard/home/StaffHome";

/** Beranda (`/dashboard`): tampilan staff atau agent sesuai capability. */
export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role;
  const displayName = profile?.full_name || "Pengguna";

  // Staff = peran yang membaca data SIDAK; selain itu tampilan latihan.
  if (!isCapabilityAllowed(role, "sidak.read")) {
    return <AgentHome role={role} displayName={displayName} />;
  }
  return <StaffHome role={role} displayName={displayName} />;
}
