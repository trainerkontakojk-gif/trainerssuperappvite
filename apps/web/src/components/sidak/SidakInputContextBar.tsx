import { useMemo, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { QAIndicator, QAPeriod } from "@trainers/types";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SidakInputAgent } from "../../lib/sidak-input-agents";
import { SERVICE_LABELS } from "../../lib/scoring";
import { periodLabel, SERVICE_TYPES } from "./sidak-input.constants";

type ServiceType = QAIndicator["service_type"];

interface Props {
  folders: { id: string; name: string }[];
  folder: string | null;
  onFolderChange: (folder: string) => void;

  agents: SidakInputAgent[];
  agent: SidakInputAgent | null;
  loadingAgents: boolean;
  onAgentChange: (agent: SidakInputAgent) => void;

  periods: QAPeriod[];
  periodId: string | null;
  onPeriodChange: (periodId: string) => void;

  service: ServiceType | "";
  onServiceChange: (service: ServiceType) => void;
  /** Tim Mix: layanan wajib dipilih sebelum temuan dimuat. */
  serviceRequired: boolean;
}

const triggerClassName =
  "!h-[44px] w-full min-w-0 rounded-lg border-border bg-background px-3 text-sm text-foreground hover:bg-muted/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40";

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("id-ID")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function agentMeta(agent: SidakInputAgent): string {
  return [agent.tim, agent.batch_name].filter(Boolean).join(" · ");
}

function Field({
  id,
  label,
  className = "",
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Label htmlFor={id} className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Bar konteks audit: Folder, Agen (cari), Periode, Layanan dalam satu fieldset.
 * Presentasional; state dan pemuatan data dimiliki halaman.
 */
export default function SidakInputContextBar({
  folders,
  folder,
  onFolderChange,
  agents,
  agent,
  loadingAgents,
  onAgentChange,
  periods,
  periodId,
  onPeriodChange,
  service,
  onServiceChange,
  serviceRequired,
}: Props) {
  const folderItems = useMemo(
    () => folders.map((f) => ({ value: f.name, label: f.name })),
    [folders],
  );
  const periodItems = useMemo(
    () => periods.map((p) => ({ value: p.id, label: periodLabel(p) })),
    [periods],
  );
  const serviceItems = useMemo(
    () => SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s] })),
    [],
  );
  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => a.nama.localeCompare(b.nama, "id-ID")),
    [agents],
  );

  const hasAgent = agent !== null;
  const agentEmptyText = loadingAgents
    ? "Memuat daftar agen…"
    : "Tidak ada agen yang cocok.";
  const serviceHintId = "sidak-input-service-hint";

  return (
    <fieldset className="min-w-0 space-y-3 border-0 p-0">
      <legend className="sr-only">Konteks audit</legend>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.7fr)]">
        <Field id="sidak-input-folder" label="Folder" className="col-span-2 lg:col-span-1">
          <Select
            items={folderItems}
            value={folder}
            onValueChange={(value) => {
              if (value !== null) onFolderChange(value);
            }}
          >
            <SelectTrigger
              id="sidak-input-folder"
              aria-label="Folder"
              className={triggerClassName}
            >
              <SelectValue placeholder="Pilih folder" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.name}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field id="sidak-input-agent" label="Agen" className="col-span-2 lg:col-span-1">
          <Combobox
            items={sortedAgents}
            value={agent}
            disabled={folder === null}
            autoHighlight
            isItemEqualToValue={(a: SidakInputAgent, b: SidakInputAgent) =>
              a.id === b.id
            }
            itemToStringLabel={(item: SidakInputAgent | null) => item?.nama ?? ""}
            itemToStringValue={(item: SidakInputAgent | null) => item?.id ?? ""}
            filter={(item: SidakInputAgent, query: string) =>
              normalize(
                `${item.nama} ${item.tim ?? ""} ${item.batch_name ?? ""}`,
              ).includes(normalize(query))
            }
            onValueChange={(item: SidakInputAgent | null) => {
              if (item) onAgentChange(item);
            }}
          >
            <ComboboxTrigger
              id="sidak-input-agent"
              aria-label="Agen"
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="!h-[44px] w-full justify-between px-3 font-normal"
                />
              }
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Search
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {agent ? (
                  <span className="truncate">
                    {agent.nama}
                    {agent.tim ? (
                      <span className="text-muted-foreground"> · {agent.tim}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="truncate text-muted-foreground">
                    Cari agen…
                  </span>
                )}
              </span>
            </ComboboxTrigger>
            <ComboboxContent
              align="start"
              className="group/combobox-content min-w-[min(22rem,calc(100vw-2rem))]"
            >
              <div className="border-b border-border p-1">
                <ComboboxInput
                  aria-label="Cari agen"
                  placeholder="Cari nama, tim, atau batch…"
                />
              </div>
              <ComboboxEmpty>{agentEmptyText}</ComboboxEmpty>
              <ComboboxList>
                {(item: SidakInputAgent) => (
                  <ComboboxItem key={item.id} value={item}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {item.nama}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {agentMeta(item) || "-"}
                      </span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>

        <Field id="sidak-input-period" label="Periode">
          <Select
            items={periodItems}
            value={periodId}
            disabled={!hasAgent}
            onValueChange={(value) => {
              if (value !== null) onPeriodChange(value);
            }}
          >
            <SelectTrigger
              id="sidak-input-period"
              aria-label="Periode"
              className={triggerClassName}
            >
              <SelectValue placeholder="Pilih periode" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {periodLabel(p)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field id="sidak-input-service" label="Layanan">
          <Select
            items={serviceItems}
            value={service === "" ? null : service}
            disabled={!hasAgent}
            onValueChange={(value) => {
              if (value !== null) onServiceChange(value as ServiceType);
            }}
          >
            <SelectTrigger
              id="sidak-input-service"
              aria-label="Layanan"
              aria-describedby={serviceRequired ? serviceHintId : undefined}
              aria-invalid={serviceRequired && service === "" ? true : undefined}
              className={triggerClassName}
            >
              <SelectValue placeholder="Pilih layanan" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SERVICE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {serviceRequired ? (
        <p id={serviceHintId} className="text-sm text-muted-foreground">
          Tim Mix menangani lebih dari satu layanan. Pilih layanan audit agar
          temuan tersimpan pada layanan yang benar.
        </p>
      ) : null}
    </fieldset>
  );
}
