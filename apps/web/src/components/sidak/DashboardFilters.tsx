import { Filter, Layers, Users, Calendar, ChevronRight } from "lucide-react";
import { MonthRangePicker } from "../ui/MonthRangePicker";
import {
  buildSidakFolderSelectGroups,
  type NormalizedSidakFolderOption,
} from "../../lib/sidak-folder-options";

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
  folders: NormalizedSidakFolderOption[];
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
        availableServices.map((svc) => [svc, SERVICE_LABELS[svc] || svc]),
      )
    : SERVICE_LABELS;

  const { groupedFolders, standaloneFolders } =
    buildSidakFolderSelectGroups(folders);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-3 py-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="flex shrink-0 items-center gap-3 px-2 py-1">
        <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Konfigurasi
          </span>
          <span className="font-outfit text-sm font-bold tracking-tight text-foreground">
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
              className={`h-10 w-full appearance-none rounded-lg border border-border bg-background px-4 pl-11 pr-10 text-[13px] font-medium text-foreground transition-all focus:border-foreground focus:outline-none ${leaderLockedService ? "cursor-not-allowed opacity-70" : ""}`}
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
              className="h-10 w-full appearance-none rounded-lg border border-border bg-background px-4 pl-11 pr-10 text-[13px] font-medium text-foreground transition-all focus:border-foreground focus:outline-none"
            >
              <option value="ALL">Semua Tim</option>
              {standaloneFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.nama}
                </option>
              ))}
              {groupedFolders.map((group) => (
                <optgroup
                  key={group.parent.id}
                  label={`${group.parent.nama} (gabungan + batch)`}
                >
                  <option value={group.parent.id}>
                    {group.parent.nama} — Semua batch
                  </option>
                  {group.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      ↳ {child.nama}
                    </option>
                  ))}
                </optgroup>
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
              className="h-10 w-full appearance-none rounded-lg border border-border bg-background px-4 pl-11 pr-10 text-[13px] font-medium text-foreground transition-all focus:border-foreground focus:outline-none"
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
