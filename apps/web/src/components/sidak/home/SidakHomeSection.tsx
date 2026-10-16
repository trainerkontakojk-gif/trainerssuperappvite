import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type SidakHomeLoadState = "loading" | "ready" | "error";

const headingClass =
  "font-display text-xl leading-7 font-bold tracking-tight text-foreground";

/** Bagian beranda SIDAK: `h2` + aksi kecil + isi. Region diberi nama dari `h2`. */
export function SidakHomeSection({
  id,
  title,
  meta,
  children,
  className = "",
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-3 ${className}`}
    >
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className={headingClass}>
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

/** Gagal memuat satu bagian; bagian lain tetap tampil. */
export function SidakHomeProblem({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-foreground"
    >
      {message}
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="min-h-[44px]"
      >
        Coba lagi
      </Button>
    </div>
  );
}

export function SidakHomeNote({ children }: { children: ReactNode }) {
  return <p className="px-5 py-4 text-sm text-fg2">{children}</p>;
}
