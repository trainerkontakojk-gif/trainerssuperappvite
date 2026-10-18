import { isAccountExpired, normalizeRole } from "@trainers/types";
import type { StatusTone } from "./components/management/StatusDot";

export type NormalizedStatus = "pending" | "active" | "inactive";
/** What the pages show: an active account past its masa aktif is "expired". */
export type DisplayStatus = NormalizedStatus | "expired";

export const STATUS_PRESENTATION: Record<
  DisplayStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Menunggu", tone: "warning" },
  active: { label: "Aktif", tone: "success" },
  inactive: { label: "Nonaktif", tone: "muted" },
  expired: { label: "Masa aktif habis", tone: "warning" },
};

export function displayStatus(account: {
  status?: string | null;
  active_until?: string | null;
}): DisplayStatus {
  const status = normalizeStatus(account.status);
  return status === "active" && isAccountExpired(account.active_until)
    ? "expired"
    : status;
}

export function roleLabel(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "-";
}

export function normalizeStatus(status?: string | null): NormalizedStatus {
  const value = status?.toLowerCase().trim() ?? "";
  if (value === "approved" || value === "active") return "active";
  if (value === "rejected" || value === "inactive") return "inactive";
  return "pending";
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
