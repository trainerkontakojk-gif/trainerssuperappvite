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
  if (module === "telefun") return "Percakapan telepon interaktif dengan pelanggan";
  return "Simulasi interaktif";
}

export function getTelefunSubmetrics(score: number | null) {
  const s = score || 0;
  const kepatuhan = Math.round((s * 0.65) * 10) / 10;
  const empati = Math.round((s * 0.625) * 10) / 10;
  const kejelasan = Math.round((s * 0.9375) * 10) / 10;
  const solusi = Math.min(10, Math.round((s * 1.3125) * 10) / 10);
  return {
    kepatuhan: kepatuhan.toFixed(1),
    empati: empati.toFixed(1),
    kejelasan: kejelasan.toFixed(1),
    solusi: solusi.toFixed(1),
  };
}
