import {
  PRACTICE_MODULE_LABELS,
  type PracticeQuotaStatus,
} from "@trainers/types";

const UNITS = {
  ketik: "simulasi",
  pdkt: "email baru",
  telefun: "panggilan",
} as const;

/** One line under a module's start button: what is left today, or why not. */
export function QuotaLine({
  status,
  id,
}: {
  status: PracticeQuotaStatus | null;
  id?: string;
}) {
  // Unlimited accounts see nothing; neither does a failed lookup.
  if (!status || status.limit === null) return null;
  const label = PRACTICE_MODULE_LABELS[status.module];
  const text =
    status.limit === 0
      ? `${label} belum dibuka untuk akunmu. Trainer bisa membukanya dari halaman Pengguna.`
      : status.used >= status.limit
        ? `Jatah ${label} hari ini sudah habis (${status.limit} dari ${status.limit}). Bisa mulai lagi besok pukul 00.00 WIB.`
        : `Sisa hari ini ${status.limit - status.used} dari ${status.limit} ${UNITS[status.module]}. Dihitung lagi besok pukul 00.00 WIB.`;
  return (
    <p id={id} role="status" className="max-w-prose text-sm text-fg2">
      {text}
    </p>
  );
}
