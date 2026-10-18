import { useEffect, useState } from "react";
import { Calendar, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../../../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import type { HistorySearch, HistoryStatusSlug } from "../history-search";

const ALL = "semua";
const MODULE_OPTIONS = [
  { value: ALL, label: "Semua modul" },
  { value: "ketik", label: "KETIK" },
  { value: "pdkt", label: "PDKT" },
  { value: "telefun", label: "Telefun" },
];
const STATUS_OPTIONS: Array<{
  value: HistoryStatusSlug | typeof ALL;
  label: string;
}> = [
  { value: ALL, label: "Semua status" },
  { value: "selesai", label: "Selesai" },
  { value: "diproses", label: "Diproses" },
  { value: "gagal", label: "Gagal" },
  { value: "belum", label: "Belum dinilai" },
];

/** Hari ini di WIB sebagai YYYY-MM-DD. */
function todayWib(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function monthStart(date: string, monthOffset = 0): string {
  const [year, month] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return start.toISOString().slice(0, 10);
}

function monthEnd(date: string, monthOffset = 0): string {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month + monthOffset, 0))
    .toISOString()
    .slice(0, 10);
}

const PRESETS: Array<{ label: string; range: () => [string, string] }> = [
  { label: "Hari ini", range: () => [todayWib(), todayWib()] },
  { label: "7 hari", range: () => [todayWib(-6), todayWib()] },
  { label: "Bulan ini", range: () => [monthStart(todayWib()), todayWib()] },
  {
    label: "Bulan lalu",
    range: () => [monthStart(todayWib(), -1), monthEnd(todayWib(), -1)],
  },
];

function formatDay(date: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function formatDateRange(dari?: string, sampai?: string): string {
  if (!dari && !sampai) return "Semua tanggal";
  if (dari && sampai) {
    return dari === sampai
      ? formatDay(dari, true)
      : `${formatDay(dari, false)} – ${formatDay(sampai, true)}`;
  }
  return dari
    ? `Sejak ${formatDay(dari, true)}`
    : `Sampai ${formatDay(sampai!, true)}`;
}

function DateRangeFilter({
  dari,
  sampai,
  onApply,
}: {
  dari?: string;
  sampai?: string;
  onApply: (dari?: string, sampai?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(dari ?? "");
  const [to, setTo] = useState(sampai ?? "");

  useEffect(() => {
    if (!open) return;
    setFrom(dari ?? "");
    setTo(sampai ?? "");
  }, [open, dari, sampai]);

  const invalid = Boolean(from && to && from > to);
  const apply = (nextFrom: string, nextTo: string) => {
    onApply(nextFrom || undefined, nextTo || undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-between gap-2 bg-background font-normal md:w-56"
          />
        }
      >
        <span className="flex items-center gap-2">
          <Calendar
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          {formatDateRange(dari, sampai)}
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <PopoverTitle className="sr-only">Filter tanggal</PopoverTitle>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9"
              onClick={() => apply(...preset.range())}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="monitoring-history-from">Dari</Label>
          <Input
            id="monitoring-history-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="monitoring-history-to">Sampai</Label>
          <Input
            id="monitoring-history-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-11"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Tanggal dihitung dalam WIB.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => apply("", "")}
          >
            Hapus
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={invalid}
            onClick={() => apply(from, to)}
          >
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HistoryFilters({
  search,
  onChange,
}: {
  search: HistorySearch;
  onChange: (patch: Partial<HistorySearch>) => void;
}) {
  const [query, setQuery] = useState(search.q ?? "");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setQuery(search.q ?? "");
  }, [search.q]);

  // Pencarian dikirim ke server sesudah berhenti mengetik sebentar.
  useEffect(() => {
    const next = query.trim() || undefined;
    if (next === search.q) return;
    const timer = window.setTimeout(() => onChange({ q: next }), 300);
    return () => window.clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="flex gap-2 md:contents">
        <Button
          type="button"
          variant="outline"
          aria-expanded={showFilters}
          aria-controls="monitoring-history-filters"
          onClick={() => setShowFilters((open) => !open)}
          className="min-h-11 md:hidden"
        >
          <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          Filter
        </Button>
        <div className="relative flex-1 md:order-last md:ml-auto md:w-80 md:flex-none">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Cari riwayat"
            placeholder="Cari peserta, skenario, konsumen"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 bg-background pl-9"
          />
        </div>
      </div>
      <div
        id="monitoring-history-filters"
        className={`${showFilters ? "grid" : "hidden"} grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center`}
      >
        <Select
          items={MODULE_OPTIONS}
          value={search.modul ?? ALL}
          onValueChange={(value, details) => {
            if (value === null || details.reason === "none") return;
            onChange({
              modul:
                value === ALL ? undefined : (value as HistorySearch["modul"]),
            });
          }}
        >
          <SelectTrigger
            aria-label="Modul"
            className="min-h-11 w-full bg-background md:w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODULE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={STATUS_OPTIONS}
          value={search.status ?? ALL}
          onValueChange={(value, details) => {
            if (value === null || details.reason === "none") return;
            onChange({
              status: value === ALL ? undefined : (value as HistoryStatusSlug),
            });
          }}
        >
          <SelectTrigger
            aria-label="Status"
            className="min-h-11 w-full bg-background md:w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter
          dari={search.dari}
          sampai={search.sampai}
          onApply={(dari, sampai) => onChange({ dari, sampai })}
        />
      </div>
    </div>
  );
}
