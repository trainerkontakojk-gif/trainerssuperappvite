import {
  MessageCircle,
  Mail,
  Phone,
} from "lucide-react";

export type ReviewStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type UnifiedHistoryEntry = {
  id: string;
  user_id: string;
  module: "ketik" | "pdkt" | "telefun";
  scenario_title: string;
  created_at: string;
  duration_seconds: number;
  score: number | null;
  history: unknown;
  user_email?: string;
  user_role?: string;
  review_status: ReviewStatus;
  scores?: {
    final?: number;
    empathy?: number;
    probing?: number;
    typo?: number;
    compliance?: number;
  };
  pdkt_evaluation?: {
    score: number;
    feedback: string;
    typos_count: number;
    clarity_issues_count: number;
    content_gaps_count: number;
  };
  telefun_assessment?: {
    overall_score: number;
    speaking_rate_wpm: number;
    intonation_score: number;
    articulation_score: number;
    filler_words_count: number;
    emotional_tone: string;
    strengths: string[];
    highlights: string[];
  };
};

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

export function getScoreColor(score: number | null, scale: number = 100): string {
  if (score === null) return "text-muted-foreground";
  // Normalize to percentage for consistent color coding
  const pct = scale === 10 ? score * 10 : score;
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 60) return "text-amber-500";
  return "text-red-500";
}

export function getScoreGrade(score: number) {
  if (score >= 90)
    return {
      label: "Sangat Baik",
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/25",
      bar: "bg-emerald-500",
    };
  if (score >= 75)
    return {
      label: "Baik",
      color: "text-sky-600",
      bg: "bg-sky-500/10",
      border: "border-sky-500/25",
      bar: "bg-sky-500",
    };
  if (score >= 60)
    return {
      label: "Cukup",
      color: "text-amber-600",
      bg: "bg-amber-500/10",
      border: "border-amber-500/25",
      bar: "bg-amber-500",
    };
  return {
    label: "Perlu Coaching",
    color: "text-rose-600",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    bar: "bg-rose-500",
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
