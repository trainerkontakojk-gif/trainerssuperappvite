import type { ReactNode } from "react";

const TIME_ZONE = "Asia/Jakarta";
const DATE = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const HOUR = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

function greeting(now: Date) {
  const hour = Number(HOUR.format(now));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Judul Beranda: salam (WIB), tanggal, dan aksi utama sesuai peran. */
export function HomeHeader({
  displayName,
  meta,
  children,
}: {
  displayName: string;
  /** Keterangan tambahan setelah tanggal, mis. periode QA terakhir. */
  meta?: string | null;
  children?: ReactNode;
}) {
  const now = new Date();
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;

  return (
    <header className="home-head">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-fg text-balance">
          {greeting(now)}, {firstName}.
        </h1>
        <p className="mt-1.5 text-[13px] text-fg2">
          {DATE.format(now)}
          {meta ? ` · ${meta}` : ""}
        </p>
      </div>
      {children && <div className="home-actions">{children}</div>}
    </header>
  );
}
