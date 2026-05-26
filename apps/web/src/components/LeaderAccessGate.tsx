import { Shield, Clock, XCircle, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useAccessStatus } from "../hooks/useAccessStatus";

interface LeaderAccessGateProps {
  module: "ktp" | "sidak";
  moduleLabel: string;
  moduleColor?: string;
  children: React.ReactNode;
}

const statusConfig: Record<
  string,
  {
    icon: typeof Shield;
    label: string;
    message: (label: string) => string;
    iconBg: string;
    iconColor: string;
    badgeColor: string;
    showSubmit: boolean;
    submitLabel: string;
    isDisabled: boolean;
  }
> = {
  none: {
    icon: Shield,
    label: "Akses Belum Tersedia",
    message: (label: string) =>
      `Anda belum memiliki akses ke modul ${label}. Ajukan permohonan akses untuk melanjutkan.`,
    iconBg: "bg-slate-500/10",
    iconColor: "text-slate-400",
    badgeColor: "bg-slate-500/10 text-slate-400",
    showSubmit: true,
    submitLabel: "Ajukan Akses",
    isDisabled: false,
  },
  pending: {
    icon: Clock,
    label: "Menunggu Persetujuan",
    message: (label: string) =>
      `Permohonan akses Anda ke modul ${label} sedang ditinjau oleh admin. Proses ini biasanya memakan waktu 1x24 jam.`,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    badgeColor: "bg-amber-500/10 text-amber-400",
    showSubmit: false,
    submitLabel: "Menunggu Approval",
    isDisabled: true,
  },
  rejected: {
    icon: XCircle,
    label: "Akses Ditolak",
    message: (label: string) =>
      `Permohonan akses Anda ke modul ${label} telah ditolak. Anda dapat mengajukan permohonan baru atau menghubungi admin untuk informasi lebih lanjut.`,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-400",
    badgeColor: "bg-red-500/10 text-red-400",
    showSubmit: true,
    submitLabel: "Ajukan Akses Lagi",
    isDisabled: false,
  },
  revoked: {
    icon: AlertCircle,
    label: "Akses Dicabut",
    message: (label: string) =>
      `Akses Anda ke modul ${label} telah dicabut oleh admin. Anda dapat mengajukan permohonan akses kembali.`,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    badgeColor: "bg-orange-500/10 text-orange-400",
    showSubmit: true,
    submitLabel: "Ajukan Akses Lagi",
    isDisabled: false,
  },
  approved: {
    icon: CheckCircle,
    label: "Akses Disetujui",
    message: () => "",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    badgeColor: "bg-emerald-500/10 text-emerald-400",
    showSubmit: false,
    submitLabel: "",
    isDisabled: false,
  },
};

export default function LeaderAccessGate({
  module,
  moduleLabel,
  children,
}: LeaderAccessGateProps) {
  const { profile } = useAuthStore() as { profile?: { role?: string } | null };
  const role = profile?.role ?? "";
  const { status, loading, error, submitRequest } = useAccessStatus(module);

  const isAdminOrTrainer = role === "admin" || role === "trainer";
  const isApproved = status === "approved";

  if (isAdminOrTrainer) return <>{children}</>;
  if (role === "agent") return <>{children}</>;

  if (role !== "leader") {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh]">
        <p className="text-white/40 text-sm">
          Anda tidak memiliki akses ke modul ini
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-4 text-white/50">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-medium">Memuat status akses...</span>
        </div>
      </div>
    );
  }

  if (isApproved) return <>{children}</>;

  const cfg = statusConfig[status] || statusConfig.none;

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh] p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">
            {moduleLabel}
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Akses berbasis izin
          </p>
        </div>

        <div className="bg-card/40 rounded-[2.5rem] border border-border/50 p-8 sm:p-10 backdrop-blur-xl shadow-xl shadow-black/5 text-center">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${cfg.iconBg} ${cfg.iconColor}`}
          >
            <cfg.icon className="h-10 w-10" />
          </div>

          <div
            className={`mx-auto mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold ${cfg.badgeColor}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {cfg.label}
          </div>

          <p className="text-sm text-white/60 leading-relaxed max-w-sm mx-auto">
            {cfg.message(moduleLabel)}
          </p>

          {cfg.showSubmit && (
            <button
              onClick={submitRequest}
              disabled={cfg.isDisabled}
              className={`mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
                cfg.isDisabled
                  ? "bg-white/5 text-white/30 cursor-not-allowed"
                  : "bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20"
              }`}
            >
              {cfg.submitLabel}
            </button>
          )}

          {status === "pending" && (
            <div className="mt-6 rounded-xl bg-amber-500/5 border border-amber-500/10 p-4 text-sm text-amber-200/70">
              Estimasi normal sekitar 1x24 jam. Jika akses dibutuhkan segera,
              hubungi trainer atau admin Anda.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-500/5 border border-red-500/10 p-3 text-xs text-red-400/80">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
