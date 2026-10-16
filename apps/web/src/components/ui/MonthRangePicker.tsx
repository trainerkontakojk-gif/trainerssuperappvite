import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

interface MonthRangePickerProps {
  selectedYear: number;
  startMonth: number | null;
  endMonth: number | null;
  onRangeChange: (start: number | null, end: number | null) => void;
  id?: string;
  className?: string;
  /** Awalan nama aksesibel pemicu; bawaan "Rentang bulan". */
  ariaLabel?: string;
}

/** Teks rentang di pemicu: "Januari – Oktober", "Oktober", atau "Semua bulan". */
function formatMonthRange(start: number | null, end: number | null) {
  if ((start ?? 1) === 1 && (end ?? 12) === 12) return "Semua bulan";
  if (start === null) return `Sampai ${MONTHS[end! - 1]}`;
  if (end === null) return `Mulai ${MONTHS[start - 1]}`;
  if (start === end) return MONTHS[start - 1];
  return `${MONTHS[start - 1]} – ${MONTHS[end - 1]}`;
}

/**
 * Satu kontrol rentang bulan dalam tahun terpilih. Klik pertama memilih bulan
 * awal, klik kedua bulan akhir (urutan klik bebas), lalu popover tertutup.
 * Rentang baru dikirim sekali setelah klik kedua; menutup popover setelah satu
 * klik memilih bulan itu saja.
 */
export function MonthRangePicker({
  selectedYear,
  startMonth,
  endMonth,
  onRangeChange,
  id,
  className,
  ariaLabel = "Rentang bulan",
}: MonthRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const label = formatMonthRange(startMonth, endMonth);

  const close = (commitAnchor: boolean) => {
    if (commitAnchor && anchor !== null) onRangeChange(anchor, anchor);
    setAnchor(null);
    setOpen(false);
  };

  const pick = (month: number) => {
    if (anchor === null) {
      setAnchor(month);
      return;
    }
    onRangeChange(Math.min(anchor, month), Math.max(anchor, month));
    close(false);
  };

  const inRange = (month: number) => {
    if (anchor !== null) return month === anchor;
    if (startMonth === null && endMonth === null) return false;
    return month >= (startMonth ?? 1) && month <= (endMonth ?? 12);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close(true))}
    >
      <PopoverTrigger
        id={id}
        aria-label={`${ariaLabel}: ${label}`}
        render={
          <Button
            variant="outline"
            size="lg"
            className={cn(
              "min-h-[44px] w-full min-w-0 justify-between rounded-lg border-border px-3 text-sm font-medium text-foreground hover:bg-muted",
              className,
            )}
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown aria-hidden="true" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Pilih rentang bulan"
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
      >
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">
          {anchor === null
            ? `Pilih bulan awal (${selectedYear})`
            : `${MONTHS[anchor - 1]} sampai… pilih bulan akhir`}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((month, index) => {
            const value = index + 1;
            const active = inRange(value);
            return (
              <Button
                key={month}
                type="button"
                variant={active ? "default" : "ghost"}
                aria-pressed={active}
                onClick={() => pick(value)}
                className={cn("h-[44px] px-2", !active && "text-fg2")}
              >
                {month}
              </Button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onRangeChange(null, null);
              close(false);
            }}
            className="h-[44px] w-full"
          >
            Semua bulan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
