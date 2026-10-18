import { normalizeRole } from "@trainers/types";
import type { StatusTone } from "./components/management/StatusDot";

export type NormalizedStatus = "pending" | "active" | "inactive";

export const STATUS_PRESENTATION: Record<
  NormalizedStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Menunggu", tone: "warning" },
  active: { label: "Aktif", tone: "success" },
  inactive: { label: "Nonaktif", tone: "muted" },
};

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
