/** Util murni untuk halaman Forecast SIDAK: format angka, label, query periode. */

import { SERVICE_LABELS } from "../lib/scoring";

export const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
export const MAX_VISIBLE_PARAMETER_SERIES = 2;

export function normalizeAvailableServices(
  services: string[] | undefined,
): string[] {
  const aliases: Record<string, string> = {
    chat: "chat",
    "digital chat": "chat",
    digital_chat: "chat",
  };
  const seen = new Set<string>();
  return (services ?? Object.keys(SERVICE_LABELS)).flatMap((raw) => {
    const key = raw.trim().toLowerCase();
    const service = aliases[key] ?? key;
    if (!service || seen.has(service)) return [];
    seen.add(service);
    return service;
  });
}

export function toPeriodQueryParts(params: {
  year: number;
  serviceType: string;
  folderId: string;
  startMonth: number | null;
  endMonth: number | null;
}) {
  const query = new URLSearchParams();
  query.set("year", String(params.year));
  query.set("service_type", params.serviceType);
  if (params.folderId !== "ALL") {
    query.set("folder_ids", params.folderId);
  }
  if (params.startMonth != null) {
    query.set("startMonth", String(params.startMonth));
  }
  if (params.endMonth != null) {
    query.set("endMonth", String(params.endMonth));
  }
  return query.toString();
}

export function formatNumber(value: number, digits = 1) {
  return Number(value)
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

export function formatSigned(value: number, digits = 1) {
  const normalized = Number.isFinite(value) ? value : 0;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${formatNumber(normalized, digits)}`;
}

export function safeLabel(label?: string | null) {
  return label && label.trim().length > 0 ? label : "N/A";
}

export function forecastMethodLabel(method?: string | null) {
  if (!method || method === "linear-regression") return "Regresi Linear";
  return safeLabel(method);
}

export function agentInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
