import { Filter, Layers, Users, Calendar, ChevronRight } from "lucide-react";
import { MonthRangePicker } from "../ui/MonthRangePicker";

const SERVICE_LABELS: Record<string, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

interface Props {
  selectedService: string;
  onServiceChange: (v: string) => void;
  selectedFolder: string;
  onFolderChange: (v: string) => void;
  selectedYear: number;
  onYearChange: (v: number) => void;
  startMonth: number | null;
  endMonth: number | null;
  onMonthRangeChange: (start: number | null, end: number | null) => void;
  folders: { id: string; nama: string }[];
  availableYears: number[];
  leaderLockedService?: string | null;
  availableServices?: string[];
}

export default function DashboardFilters({
  selectedService,
  onServiceChange,
  selectedFolder,
  onFolderChange,
  selectedYear,
  onYearChange,
  startMonth,
  endMonth,
  onMonthRangeChange,
  folders,
  availableYears,
  leaderLockedService,
  availableServices,
}: Props) {
  const serviceOptions = availableServices?.length
    ? availableServices
    : Object.entries(SERVICE_LABELS).map(([k]) => k);

  const serviceLabels: Record<string, string> = availableServices?.length
    ? Object.fromEntries(
        availableServices.map((svc) => [
          svc,
          SERVICE_LABELS[svc] || svc,
        ]),
      )
    : SERVICE_LABELS;

  return (
    <div className="flex flex-col gap-3 rounded-[2rem] border border-border/70 bg-card px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:gap-4">
      <div className="flex shrink-0 items-center gap-3 px-2 py-1">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/60">
          <Filter className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.32em] text-muted-foreground">
            Konfigurasi
          </span>
          <span className="text-sm font-black tracking-tight text-foreground">
            Filter Data
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center xl:flex-[1.9]">
          {/* Service Type */}
          <div className="relative group/select min-w-[130px] flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within/select:text-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <select
              value={leaderLockedService ? leaderLockedService : selectedService}
              onChange={(e) => onServiceChange(e.target.value)}
              disabled={!!leaderLockedService}
              className={`h-11 w-full appearance-none rounded-[1.2rem] border border-border/70 bg-background px-4 pl-11 pr-10 text-[13px] font-medium text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 ${leaderLockedService ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {leaderLockedService ? (
                <option value={leaderLockedService}>
                  {serviceLabels[leaderLockedService] || leaderLockedService}
                </option>
              ) : (
                serviceOptions.map((svc) => (
                  <option key={svc} value={svc}>
                    {serviceLabels[svc] || svc}
                  </option>
                ))
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
              <ChevronRight className="h-4 w-4 rotate-90" />
            </div>
          </div>

          {/* Team/Folder */}
          <div className="relative group/select min-w-[150px] flex-[1.2]">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within/select:text-foreground">
              <Users className="h-4 w-4" />
            </div>
            <select
              value={selectedFolder}
              onChange={(e) => onFolderChange(e.target.value)}
              className="h-11 w-full appearance-none rounded-[1.2rem] border border-border/70 bg-background px-4 pl-11 pr-10 text-[13px] font-medium text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            >
              <option value="ALL">Semua Tim</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nama}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
              <ChevronRight className="h-4 w-4 rotate-90" />
            </div>
          </div>

          {/* Year */}
          <div className="relative group/select min-w-[120px] flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground transition-colors group-focus-within/select:text-foreground">
              <Calendar className="h-4 w-4" />
            </div>
            <select
              value={selectedYear}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="h-11 w-full appearance-none rounded-[1.2rem] border border-border/70 bg-background px-4 pl-11 pr-10 text-[13px] font-medium text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
              <ChevronRight className="h-4 w-4 rotate-90" />
            </div>
          </div>
        </div>

        {/* Month Range */}
        <div className="min-w-[340px] flex-[1.55]">
          <MonthRangePicker
            selectedYear={selectedYear}
            startMonth={startMonth}
            endMonth={endMonth}
            onRangeChange={onMonthRangeChange}
            variant="toolbar"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
