import { Calendar, XCircle } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  className?: string;
  variant?: "standalone" | "compact" | "toolbar";
}

interface MonthSelectProps {
  id: string;
  label: string;
  value: number | null;
  placeholder: string;
  invalid: boolean;
  onChange: (value: number | null) => void;
  className?: string;
}

function MonthSelect({
  id,
  label,
  value,
  placeholder,
  invalid,
  onChange,
  className,
}: MonthSelectProps) {
  const items = [
    { value: null, label: placeholder },
    ...MONTHS.map((month, index) => ({
      value: String(index + 1),
      label: month,
    })),
  ];

  return (
    <Select
      items={items}
      value={value === null ? null : String(value)}
      onValueChange={(nextValue) => {
        onChange(nextValue === null ? null : Number(nextValue));
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-10 w-full min-w-0 rounded-lg border-border bg-background text-sm font-medium text-foreground",
          "hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
          invalid && "border-destructive/60",
          className,
        )}
      >
        <Calendar aria-hidden="true" className="text-muted-foreground" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          <SelectItem value={null}>{placeholder}</SelectItem>
          {MONTHS.map((month, index) => (
            <SelectItem key={month} value={String(index + 1)}>
              {month}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ResetRangeButton({
  onClick,
  showLabel = false,
}: {
  onClick: () => void;
  showLabel?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "lg" : "icon-lg"}
      className={cn("min-h-11 shrink-0", !showLabel && "min-w-11")}
      onClick={onClick}
      aria-label="Reset rentang bulan"
      title="Reset rentang bulan"
    >
      <XCircle data-icon="inline-start" aria-hidden="true" />
      {showLabel ? "Reset" : null}
    </Button>
  );
}

export function MonthRangePicker({
  selectedYear,
  startMonth,
  endMonth,
  onRangeChange,
  className = "",
  variant = "standalone",
}: MonthRangePickerProps) {
  const isInvalidRange =
    startMonth !== null && endMonth !== null && endMonth < startMonth;
  const hasRange = startMonth !== null || endMonth !== null;

  const handleReset = () => onRangeChange(null, null);

  const startSelect = (
    <MonthSelect
      id="month-range-start"
      label="Bulan awal"
      value={startMonth}
      placeholder={variant === "toolbar" ? "Awal" : "Bulan awal"}
      invalid={isInvalidRange}
      onChange={(value) => onRangeChange(value, endMonth)}
    />
  );
  const endSelect = (
    <MonthSelect
      id="month-range-end"
      label="Bulan akhir"
      value={endMonth}
      placeholder={variant === "toolbar" ? "Akhir" : "Bulan akhir"}
      invalid={isInvalidRange}
      onChange={(value) => onRangeChange(startMonth, value)}
    />
  );

  if (variant === "toolbar") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[8rem] flex-1">{startSelect}</div>
          <span className="shrink-0 px-1 text-xs font-medium text-muted-foreground">
            sampai
          </span>
          <div className="min-w-[8rem] flex-1">{endSelect}</div>
          {hasRange ? <ResetRangeButton onClick={handleReset} /> : null}
        </div>
        {isInvalidRange ? (
          <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-destructive">
            <XCircle aria-hidden="true" />
            Rentang bulan tidak valid
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <div className="min-w-[8rem] flex-1">{startSelect}</div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          sampai
        </span>
        <div className="min-w-[8rem] flex-1">{endSelect}</div>
        {hasRange ? <ResetRangeButton onClick={handleReset} /> : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/20 p-4">
        <div className="min-w-44 flex-1">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            Rentang bulan ({selectedYear})
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-[8rem] flex-1">{startSelect}</div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              sampai
            </span>
            <div className="min-w-[8rem] flex-1">{endSelect}</div>
          </div>
        </div>
        {hasRange ? <ResetRangeButton onClick={handleReset} showLabel /> : null}
        {isInvalidRange ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <XCircle aria-hidden="true" />
            Rentang bulan tidak valid
          </p>
        ) : null}
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        Rentang bulan dibatasi dalam tahun {selectedYear}. Ubah tahun di filter
        untuk tahun lain.
      </p>
    </div>
  );
}
