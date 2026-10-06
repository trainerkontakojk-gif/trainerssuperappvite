import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";

interface SplitViewProps {
  list: ReactNode;
  /** `null` = belum ada yang dipilih; di layar lebar `empty` tampil di kanan. */
  detail: ReactNode | null;
  empty: ReactNode;
  onBack: () => void;
}

/**
 * Daftar + detail. Di layar lebar keduanya berdampingan; di ponsel tampil
 * bergantian dengan tombol kembali, supaya detail tidak terdorong ke bawah daftar.
 */
export function SplitView({ list, detail, empty, onBack }: SplitViewProps) {
  const hasDetail = detail !== null;
  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[320px_1fr]">
      <div
        className={cn(
          "min-w-0 flex-col border-border lg:flex lg:border-r",
          hasDetail ? "hidden" : "flex",
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          "min-w-0 flex-col lg:flex",
          hasDetail ? "flex" : "hidden",
        )}
      >
        {hasDetail ? (
          <>
            <div className="px-3 pt-3 lg:hidden">
              <Button variant="ghost" className="h-11" onClick={onBack}>
                <ChevronLeft aria-hidden="true" />
                Kembali ke daftar
              </Button>
            </div>
            {detail}
          </>
        ) : (
          empty
        )}
      </div>
    </div>
  );
}

/** Baris daftar bersama untuk sisi kiri `SplitView`. */
export function SplitViewItem({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected ? "bg-muted" : "hover:bg-muted/50",
        )}
      >
        {children}
      </button>
    </li>
  );
}
