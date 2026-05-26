import { useAuthStore } from "../store/authStore";
import { useAccessStatus } from "../hooks/useAccessStatus";

interface LeaderAccessGateProps {
  module: "ktp" | "sidak";
  moduleLabel: string;
  children: React.ReactNode;
}

const statusLabels: Record<string, string> = {
  none: "Anda belum mengajukan akses",
  pending: "Request Anda sedang dalam proses review",
  rejected: "Request akses Anda telah ditolak",
  revoked: "Akses Anda telah dicabut",
};

const statusBadgeColor: Record<string, string> = {
  none: "bg-gray-500/10 text-gray-400",
  pending: "bg-amber-500/10 text-amber-500",
  rejected: "bg-red-500/10 text-red-500",
  revoked: "bg-red-500/10 text-red-500",
  approved: "bg-emerald-500/10 text-emerald-500",
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

  if (isAdminOrTrainer) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-4 text-white/50">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-sm">Memuat status akses...</span>
        </div>
      </div>
    );
  }

  if (role === "agent") {
    return <>{children}</>;
  }

  if (role !== "leader") {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-white/40 text-sm">
          Anda tidak memiliki akses ke modul ini
        </p>
      </div>
    );
  }

  if (isApproved) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-6 p-8 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur max-w-md w-full text-center">
        <div
          className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadgeColor[status] || statusBadgeColor.none}`}
        >
          {statusLabels[status] || status}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white">
            Akses {moduleLabel}
          </h3>
          <p className="text-sm text-white/50 mt-2">
            {status === "none" &&
              `Anda memerlukan persetujuan admin untuk mengakses modul ${moduleLabel}. Ajukan request akses untuk melanjutkan.`}
            {status === "pending" &&
              `Request akses Anda ke modul ${moduleLabel} sedang ditinjau oleh admin. Silakan tunggu.`}
            {status === "rejected" &&
              `Request akses Anda ke modul ${moduleLabel} telah ditolak. Silakan hubungi admin atau ajukan request baru.`}
            {status === "revoked" &&
              `Akses Anda ke modul ${moduleLabel} telah dicabut. Anda dapat mengajukan akses kembali.`}
          </p>
        </div>

        {(status === "none" || status === "rejected" || status === "revoked") && (
          <button
            onClick={submitRequest}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors border border-white/10"
          >
            {status === "none" ? "Ajukan Akses" : "Ajukan Akses Lagi"}
          </button>
        )}

        {status === "pending" && (
          <button
            onClick={submitRequest}
            className="px-4 py-2 rounded-lg bg-white/5 text-white/30 text-sm font-medium cursor-not-allowed"
            disabled
          >
            Menunggu Approval
          </button>
        )}

        {error && (
          <p className="text-xs text-red-400/80">{error}</p>
        )}
      </div>
    </div>
  );
}
