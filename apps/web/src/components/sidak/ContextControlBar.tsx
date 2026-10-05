import { Calendar } from "lucide-react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SidakAgentDetailTab } from "./sidak-agent-detail-tabs.constants";

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

const SERVICE_LABELS: Record<string, string> = {
  all: "Semua",
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

interface Props {
  activeTab: SidakAgentDetailTab;
  selectedYear: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
  selectedService: string;
  availableServices: string[];
  onServiceChange: (service: string) => void;
  trendStartMonth: number;
  trendEndMonth: number;
  onTrendRangeChange: (start: number, end: number) => void;
}

const triggerClassName =
  "!h-10 w-full min-w-0 rounded-lg border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40";

const labelClassName = "mb-1.5 text-xs font-medium text-muted-foreground";

interface ContextSelectProps {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  onValueChange: (value: string | null) => void;
  items: Array<{ value: string; label: string }>;
  disabled?: boolean;
  /** Nama aksesibel pengganti label visual (dipertahankan untuk E2E). */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

function ContextSelect({
  id,
  label,
  value,
  placeholder,
  onValueChange,
  items,
  disabled,
  ariaLabel,
  className = "",
  children,
}: ContextSelectProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <Select
        items={items}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          className={triggerClassName}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>{children}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ContextControlBar({
  activeTab,
  selectedYear,
  availableYears,
  onYearChange,
  selectedService,
  availableServices,
  onServiceChange,
  trendStartMonth,
  trendEndMonth,
  onTrendRangeChange,
}: Props) {
  const showAuditControls = activeTab !== "simulations";
  const showTrendRange = activeTab === "trend";
  const monthItems = MONTHS.map((month, index) => ({
    value: String(index + 1),
    label: month,
  }));

  if (!showAuditControls) return null;

  return (
    <div className="relative z-40 flex min-w-0 flex-col gap-4 border-b border-border pb-4">
      {showAuditControls ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <ContextSelect
            id="sidak-context-year"
            label="Tahun audit"
            value={String(selectedYear)}
            placeholder="Pilih tahun"
            className="sm:w-28"
            items={availableYears.map((year) => ({
              value: String(year),
              label: String(year),
            }))}
            onValueChange={(value) => {
              if (value !== null) onYearChange(Number(value));
            }}
          >
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)}>
                <span className="inline-flex items-center gap-2">
                  <Calendar aria-hidden="true" />
                  {year}
                </span>
              </SelectItem>
            ))}
          </ContextSelect>

          <ContextSelect
            id="sidak-context-service"
            label="Layanan audit"
            ariaLabel="Pilihan layanan audit"
            value={selectedService}
            placeholder="Pilih layanan"
            className="sm:w-40"
            items={availableServices.map((service) => ({
              value: service,
              label: SERVICE_LABELS[service] || service,
            }))}
            onValueChange={(value) => {
              if (value !== null) onServiceChange(value);
            }}
          >
            {availableServices.map((service) => (
              <SelectItem key={service} value={service}>
                {SERVICE_LABELS[service] || service}
              </SelectItem>
            ))}
          </ContextSelect>

          {showTrendRange ? (
            <>
              <ContextSelect
                id="sidak-trend-start"
                label="Tren dari"
                ariaLabel="Bulan awal tren"
                value={String(trendStartMonth)}
                placeholder="Mulai"
                className="sm:w-36"
                items={monthItems}
                onValueChange={(value) => {
                  if (value !== null) {
                    onTrendRangeChange(Number(value), trendEndMonth);
                  }
                }}
              >
                {MONTHS.map((month, index) => (
                  <SelectItem
                    key={month}
                    value={String(index + 1)}
                    disabled={index + 1 > trendEndMonth}
                  >
                    {month}
                  </SelectItem>
                ))}
              </ContextSelect>
              <ContextSelect
                id="sidak-trend-end"
                label="Sampai"
                ariaLabel="Bulan akhir tren"
                value={String(trendEndMonth)}
                placeholder="Sampai"
                className="sm:w-36"
                items={monthItems}
                onValueChange={(value) => {
                  if (value !== null) {
                    onTrendRangeChange(trendStartMonth, Number(value));
                  }
                }}
              >
                {MONTHS.map((month, index) => (
                  <SelectItem
                    key={month}
                    value={String(index + 1)}
                    disabled={index + 1 < trendStartMonth}
                  >
                    {month}
                  </SelectItem>
                ))}
              </ContextSelect>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
