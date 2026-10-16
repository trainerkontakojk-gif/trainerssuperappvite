import type { ReactNode, Ref } from "react";
import type { ServiceType } from "@trainers/types";
import { SERVICE_LABELS } from "../../lib/scoring";
import { MONTH_SHORT } from "./heatmap-insights";

interface SidakPageHeaderProps {
  title: string;
  /** Label kecil di atas judul (mockup: "SIDAK", "SIDAK · Audit"); null = tanpa. */
  eyebrow?: string | null;
  /** Satu kalimat fungsi halaman. */
  description?: ReactNode;
  /** Baris cakupan, mis. `<SidakScopeLine …/>`. */
  scope?: ReactNode;
  /** Aksi di kanan; turun ke bawah judul di layar sempit. */
  actions?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

/**
 * Kepala halaman SIDAK: satu gaya `h1` untuk semua sub-halaman (docs/design.md
 * "Kepala halaman SIDAK"), deskripsi, baris cakupan, dan aksi.
 */
export function SidakPageHeader({
  title,
  eyebrow = "SIDAK",
  description,
  scope,
  actions,
  headingRef,
  className = "",
}: SidakPageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? (
          <p className="text-xs font-medium text-fg2">{eyebrow}</p>
        ) : null}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl leading-tight font-bold tracking-tight text-balance text-foreground focus:outline-none"
        >
          {title}
        </h1>
        {description ? (
          <p className="max-w-[72ch] text-sm leading-relaxed text-fg2">
            {description}
          </p>
        ) : null}
        {scope}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function formatSidakMonthRange(
  dari: number | null,
  sampai: number | null,
  tahun: number,
): string {
  if (!dari || !sampai) return String(tahun);
  if (dari === sampai) return `${MONTH_SHORT[dari - 1]} ${tahun}`;
  return `${MONTH_SHORT[dari - 1]}–${MONTH_SHORT[sampai - 1]} ${tahun}`;
}

interface SidakScopeLineProps {
  layanan?: ServiceType | string | null;
  /** Nama tim terpilih; null berarti semua tim. */
  timLabel?: string | null;
  tahun: number;
  dari?: number | null;
  sampai?: number | null;
  /** Kalimat tambahan, mis. filter yang tidak dipakai halaman ini. */
  note?: ReactNode;
}

/** Baris cakupan aktif: "Call · Semua tim · Jan–Okt 2026". */
export function SidakScopeLine({
  layanan,
  timLabel,
  tahun,
  dari = null,
  sampai = null,
  note,
}: SidakScopeLineProps) {
  const parts = [
    layanan
      ? (SERVICE_LABELS[layanan as ServiceType] ?? layanan)
      : "Semua layanan",
    ...(timLabel !== undefined ? [timLabel ?? "Semua tim"] : []),
    formatSidakMonthRange(dari, sampai, tahun),
  ];
  return (
    <p data-testid="sidak-scope-line" className="text-sm text-fg2">
      <span className="text-foreground">{parts.join(" · ")}</span>
      {note ? <span> · {note}</span> : null}
    </p>
  );
}
