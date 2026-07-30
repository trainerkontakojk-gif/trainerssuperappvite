import { MessageCircle, Mail, Phone } from "lucide-react";
import type { MonitoringHistoryEntry } from "../../../lib/api/rpc-client";

export type ReviewStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type UnifiedHistoryEntry = MonitoringHistoryEntry;

export function formatIdr(value: number): string {
  return `Rp ${Math.round(value).toLocaleString()}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}d`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}d` : `${mins}m`;
}

export function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("id", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function getModuleIcon(module: string) {
  switch (module) {
    case "ketik":
      return <MessageCircle size={14} className="text-module-ketik" />;
    case "pdkt":
      return <Mail size={14} className="text-module-pdkt" />;
    case "telefun":
      return <Phone size={14} className="text-module-telefun" />;
    default:
      return null;
  }
}

export function getModuleBadgeClasses(module: string) {
  switch (module) {
    case "ketik":
      return "bg-module-ketik/10 text-module-ketik border border-module-ketik/20";
    case "pdkt":
      return "bg-module-pdkt/10 text-module-pdkt border border-module-pdkt/20";
    case "telefun":
      return "bg-module-telefun/10 text-module-telefun border border-module-telefun/20";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

export function getScoreColor(
  score: number | null,
  scale: number = 100,
): string {
  if (score === null) return "text-muted-foreground";
  // Normalize to percentage for consistent color coding
  const pct = scale === 10 ? score * 10 : score;
  if (pct >= 80) return "text-chart-green";
  if (pct >= 60) return "text-chart-amber";
  return "text-chart-red";
}

export function getScoreGrade(score: number) {
  if (score >= 90)
    return {
      label: "Sangat Baik",
      color: "text-chart-green",
      bg: "bg-chart-green/10",
      border: "border-chart-green/25",
      bar: "bg-chart-green",
    };
  if (score >= 75)
    return {
      label: "Baik",
      color: "text-chart-blue",
      bg: "bg-chart-blue/10",
      border: "border-chart-blue/25",
      bar: "bg-chart-blue",
    };
  if (score >= 60)
    return {
      label: "Cukup",
      color: "text-chart-amber",
      bg: "bg-chart-amber/10",
      border: "border-chart-amber/25",
      bar: "bg-chart-amber",
    };
  return {
    label: "Perlu Coaching",
    color: "text-chart-red",
    bg: "bg-chart-red/10",
    border: "border-chart-red/25",
    bar: "bg-chart-red",
  };
}

export function mapError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === "Unauthorized" || msg === "Invalid token") {
      return "Sesi Anda telah berakhir. Silakan login kembali.";
    }
    if (msg?.includes("tidak memiliki akses")) return msg;
    return msg === "API Error" ? "Gagal memuat data. Silakan coba lagi." : msg;
  }
  return "Terjadi kesalahan koneksi. Periksa jaringan Anda.";
}

export function getScenarioDescription(title: string, module: string): string {
  const t = title.toLowerCase();
  if (t.includes("tagihan")) return "Verifikasi dan negosiasi tagihan";
  if (t.includes("denda")) return "Penanganan keberatan denda";
  if (t.includes("pinjol")) return "Edukasi dan solusi aman";
  if (t.includes("penipuan")) return "Identifikasi dan pelaporan penipuan";
  if (module === "ketik") return "Simulasi chat interaktif dengan pelanggan";
  if (module === "pdkt") return "Korespondensi email dan penyelesaian masalah";
  if (module === "telefun")
    return "Percakapan telepon interaktif dengan pelanggan";
  return "Simulasi interaktif";
}
