import { Shield, Clock, XCircle, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useAccessStatus } from "../hooks/useAccessStatus";

interface LeaderAccessGateProps {
  module: "ktp" | "sidak";
  moduleLabel: string;
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
    badgeBg: string;
    badgeText: string;
    showSubmit: boolean;
    submitLabel: string;
  }
> = {
  none: {
    icon: Shield,
    label: "Akses Belum Tersedia",
    message: (label: string) =>
      `Anda belum memiliki akses ke modul ${label}. Ajukan permohonan akses untuk melanjutkan.`,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    badgeBg: "bg-muted",
    badgeText: "text-muted-foreground",
    showSubmit: true,
    submitLabel: "Ajukan Akses",
  },
  pending: {
    icon: Clock,
    label: "Menunggu Persetujuan",
    message: (label: string) =>
      `Permohonan akses Anda ke modul ${label} sedang ditinjau oleh admin. Proses ini biasanya memakan waktu 1x24 jam.`,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-600 dark:text-amber-400",
    showSubmit: false,
    submitLabel: "",
  },
  rejected: {
    icon: XCircle,
    label: "Akses Ditolak",
    message: (label: string) =>
      `Permohonan akses Anda ke modul ${label} telah ditolak. Anda dapat mengajukan permohonan baru atau menghubungi admin untuk informasi lebih lanjut.`,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-600 dark:text-red-400",
    badgeBg: "bg-red-500/10",
    badgeText: "text-red-600 dark:text-red-400",
    showSubmit: true,
    submitLabel: "Ajukan Akses Lagi",
  },
  revoked: {
    icon: AlertCircle,
    label: "Akses Dicabut",
    message: (label: string) =>
      `Akses Anda ke modul ${label} telah dicabut oleh admin. Anda dapat mengajukan permohonan akses kembali.`,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-600 dark:text-orange-400",
    badgeBg: "bg-orange-500/10",
    badgeText: "text-orange-600 dark:text-orange-400",
    showSubmit: true,
    submitLabel: "Ajukan Akses Lagi",
  },
  approved: {
    icon: CheckCircle,
    label: "Akses Disetujui",
    message: () => "",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    showSubmit: false,
    submitLabel: "",
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
        <p className="text-muted-foreground text-sm">
          Anda tidak memiliki akses ke modul ini
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
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
          <h1 className="text-2xl font-bold text-foreground">
            {moduleLabel}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Akses berbasis izin
          </p>
        </div>

        <div className="bg-card rounded-[2.5rem] border border-border/50 p-8 sm:p-10 shadow-xl text-center">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${cfg.iconBg} ${cfg.iconColor}`}
          >
            <cfg.icon className="h-10 w-10" />
          </div>

          <div
            className={`mx-auto mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.badgeText} opacity-60`} />
            {cfg.label}
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {cfg.message(moduleLabel)}
          </p>

          {cfg.showSubmit && (
            <button
              onClick={submitRequest}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
            >
              {cfg.submitLabel}
            </button>
          )}

          {status === "pending" && (
            <div className="mt-6 rounded-xl bg-amber-500/5 border border-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200/70">
              Estimasi normal sekitar 1x24 jam. Jika akses dibutuhkan segera,
              hubungi trainer atau admin Anda.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-destructive/5 border border-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
