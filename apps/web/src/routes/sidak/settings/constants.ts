import type { Category, ServiceType } from "@trainers/types";

export const TEAMS: ServiceType[] = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"];

export const SERVICE_LABELS: Record<string, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

export const CAT_LABEL: Record<Category, string> = {
  non_critical: "Non-Critical Error",
  critical: "Critical Error",
  none: "Semua Parameter",
};

export const CAT_COLOR: Record<Category, string> = {
  non_critical: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
  none: "bg-muted text-muted-foreground border-border",
};

export const formatPeriodLabel = (month?: number, year?: number) => {
  if (!month || !year) return "-";
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${months[month - 1]} ${year}`;
};
