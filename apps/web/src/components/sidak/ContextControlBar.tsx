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
  role: string;
  teams: { id: string; name: string }[];
  selectedTeam: string;
  onTeamChange: (team: string) => void;
  agentsInTeam: { id: string; nama: string }[];
  selectedAgentId: string;
  onAgentChange: (id: string) => void;
  loadingAgents?: boolean;
}

const triggerClassName =
  "min-h-11 !h-auto w-full min-w-0 whitespace-normal rounded-xl border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40";

interface ContextSelectProps {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  onValueChange: (value: string | null) => void;
  items: Array<{ value: string; label: string }>;
  disabled?: boolean;
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
  children,
}: ContextSelectProps) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-1.5 text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <Select items={items} value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className={triggerClassName}>
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
  role,
  teams,
  selectedTeam,
  onTeamChange,
  agentsInTeam,
  selectedAgentId,
  onAgentChange,
  loadingAgents,
}: Props) {
  const isStaff = role === "trainer" || role === "admin" || role === "leader";
  const showAuditControls = activeTab !== "simulations";
  const showTrendRange = activeTab === "trend";

  return (
    <div className="relative z-40 border-y border-border bg-background py-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-end">
        {showAuditControls ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)]">
            <ContextSelect
              id="sidak-context-year"
              label="Tahun audit"
              value={String(selectedYear)}
              placeholder="Pilih tahun"
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

            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">
                Layanan audit
              </legend>
              <div role="group" aria-label="Pilihan layanan audit">
                <Select
                  items={availableServices.map((service) => ({
                    value: service,
                    label: SERVICE_LABELS[service] || service,
                  }))}
                  value={selectedService}
                  onValueChange={(value) => {
                    if (value !== null) onServiceChange(value);
                  }}
                >
                  <SelectTrigger
                    aria-label="Pilihan layanan audit"
                    className={triggerClassName}
                  >
                    <SelectValue placeholder="Pilih layanan" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {availableServices.map((service) => (
                        <SelectItem key={service} value={service}>
                          {SERVICE_LABELS[service] || service}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>
          </div>
        ) : null}

        {showTrendRange ? (
          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">
              Rentang bulan tren
            </legend>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <ContextSelect
                id="sidak-trend-start"
                label="Bulan awal tren"
                value={String(trendStartMonth)}
                placeholder="Mulai"
                items={MONTHS.map((month, index) => ({
                  value: String(index + 1),
                  label: month,
                }))}
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
              <span className="pt-5 text-sm font-semibold text-muted-foreground" aria-hidden="true">
                sampai
              </span>
              <ContextSelect
                id="sidak-trend-end"
                label="Bulan akhir tren"
                value={String(trendEndMonth)}
                placeholder="Sampai"
                items={MONTHS.map((month, index) => ({
                  value: String(index + 1),
                  label: month,
                }))}
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
            </div>
          </fieldset>
        ) : null}

        {isStaff ? (
          <fieldset
            className={[
              "grid min-w-0 gap-3",
              showAuditControls
                ? "sm:grid-cols-2"
                : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
            ].join(" ")}
          >
            <legend className="mb-1.5 text-xs font-semibold text-muted-foreground sm:col-span-2">
              Pindah profil
            </legend>
            <ContextSelect
              id="sidak-context-team"
              label="Folder agen"
              value={selectedTeam || null}
              placeholder="Pilih folder…"
              items={teams.map((team) => ({ value: team.name, label: team.name }))}
              onValueChange={(value) => onTeamChange(value ?? "")}
            >
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.name}>
                  {team.name}
                </SelectItem>
              ))}
            </ContextSelect>
            <ContextSelect
              id="sidak-context-agent"
              label="Agen"
              value={selectedAgentId || null}
              placeholder={loadingAgents ? "Memuat…" : "Pilih agen…"}
              items={agentsInTeam.map((agent) => ({ value: agent.id, label: agent.nama }))}
              disabled={loadingAgents}
              onValueChange={(value) => {
                if (value !== null) onAgentChange(value);
              }}
            >
              {agentsInTeam.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.nama}
                </SelectItem>
              ))}
            </ContextSelect>
          </fieldset>
        ) : null}
      </div>
    </div>
  );
}
