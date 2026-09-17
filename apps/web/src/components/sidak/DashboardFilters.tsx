import type { ReactNode } from "react";
import { Calendar, Filter, Layers, Users, type LucideIcon } from "lucide-react";
import { cn } from "cn";
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

function normalizeServiceOptions(services: string[]): string[] {
  const seen = new Set<string>();
  return services.flatMap((raw) => {
    const key = raw.trim().toLowerCase();
    const service =
      key === "digital chat" || key === "digital_chat" ? "chat" : key;
    if (!service || seen.has(service)) return [];
    seen.add(service);
    return service;
  });
}

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
  showHeader?: boolean;
}

interface FilterSelectProps {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
  items: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  children: ReactNode;
}

interface TeamFilterOption {
  value: string;
  label: string;
  context?: string;
  kind: "all" | "team" | "batch";
}

interface TeamComboboxProps {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
  options: TeamFilterOption[];
  onValueChange: (value: string) => void;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase("id-ID");
}

function FilterSelect({
  id,
  label,
  icon: Icon,
  value,
  placeholder,
  items,
  disabled,
  onValueChange,
  children,
}: FilterSelectProps) {
  return (
    <div className="min-w-0 flex-1">
      <Label
        htmlFor={id}
        className="mb-1.5 text-xs font-semibold text-muted-foreground [&_svg]:size-3.5"
      >
        <Icon aria-hidden="true" />
        {label}
      </Label>
      <Select
        items={items}
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onValueChange(nextValue);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          className={cn(
            "min-h-[44px] w-full min-w-0 rounded-lg border-border bg-background px-3 text-sm font-medium text-foreground",
            "hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
          )}
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

function TeamCombobox({
  id,
  label,
  icon: Icon,
  value,
  placeholder,
  options,
  onValueChange,
}: TeamComboboxProps) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="min-w-0 flex-1">
      <Label
        htmlFor={id}
        className="mb-1.5 text-xs font-semibold text-muted-foreground [&_svg]:size-3.5"
      >
        <Icon aria-hidden="true" />
        {label}
      </Label>
      <Combobox
        items={options}
        value={selectedOption ?? null}
        autoHighlight
        isItemEqualToValue={(itemValue, nextValue) =>
          itemValue?.value === nextValue?.value
        }
        itemToStringLabel={(option) => option?.label ?? ""}
        itemToStringValue={(option) => option?.value ?? ""}
        filter={(option, query) => {
          const searchableValue = normalizeSearchValue(
            `${option.label} ${option.context ?? ""}`,
          );
          return searchableValue.includes(normalizeSearchValue(query));
        }}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onValueChange(nextValue.value);
        }}
      >
        <ComboboxTrigger
          id={id}
          aria-label={label}
          render={
            <Button
              variant="outline"
              size="lg"
              className="min-h-[44px] w-full min-w-0 justify-between rounded-lg border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          }
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption?.label ?? placeholder}
          </span>
        </ComboboxTrigger>
        <ComboboxContent
          align="start"
          className="min-w-[min(22rem,calc(100vw-2rem))]"
        >
          <div className="border-b border-border p-1">
            <ComboboxInput
              aria-label={`Cari ${label.toLocaleLowerCase("id-ID")}`}
              placeholder="Cari tim atau batch..."
            />
          </div>
          <ComboboxEmpty>Tidak ada tim atau batch yang cocok.</ComboboxEmpty>
          <ComboboxList>
            {(option: TeamFilterOption) => (
              <ComboboxItem key={option.value} value={option}>
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    option.kind === "batch" ? "pl-2" : undefined,
                  )}
                >
                  <span
                    className={cn(
                      "block truncate",
                      option.kind === "team" ? "font-medium" : "font-normal",
                    )}
                  >
                    {option.label}
                  </span>
                  {option.context ? (
                    <span
                      aria-hidden="true"
                      className="mt-0.5 block truncate text-xs text-muted-foreground"
                    >
                      {option.context}
                    </span>
                  ) : null}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
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
  showHeader = true,
}: Props) {
  const serviceOptions = leaderLockedService
    ? [leaderLockedService]
    : normalizeServiceOptions(
        availableServices?.length
          ? availableServices
          : Object.entries(SERVICE_LABELS).map(([key]) => key),
      );

  const serviceLabels: Record<string, string> = Object.fromEntries(
    serviceOptions.map((service) => [
      service,
      SERVICE_LABELS[service] || service,
    ]),
  );

  const { groupedFolders, standaloneFolders } =
    buildSidakFolderSelectGroups(folders);
  const teamOptions: TeamFilterOption[] = [
    { value: "ALL", label: "Semua Tim", kind: "all" },
    ...standaloneFolders.map((folder) => ({
      value: folder.id,
      label: folder.nama,
      kind: "team" as const,
    })),
    ...groupedFolders.flatMap((group) => [
      {
        value: group.parent.id,
        label: `${group.parent.nama} — Semua batch`,
        context: "Tim utama",
        kind: "team" as const,
      },
      ...group.children.map((child) => ({
        value: child.id,
        label: `↳ ${child.nama}`,
        context: `Batch dari ${group.parent.nama}`,
        kind: "batch" as const,
      })),
    ]),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3 lg:flex-row lg:items-end lg:gap-4">
      {showHeader ? (
        <div className="flex shrink-0 items-center gap-3 px-1 py-1 lg:pb-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
            <Filter aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Konteks
            </p>
            <p className="font-heading text-sm font-semibold tracking-tight text-foreground">
              Filter data
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
        <FilterSelect
          id="sidak-filter-service"
          label="Layanan"
          icon={Layers}
          value={leaderLockedService ?? selectedService}
          placeholder="Pilih layanan"
          items={serviceOptions.map((service) => ({
            value: service,
            label: serviceLabels[service] || service,
          }))}
          disabled={Boolean(leaderLockedService)}
          onValueChange={onServiceChange}
        >
          {serviceOptions.map((service) => (
            <SelectItem key={service} value={service}>
              {serviceLabels[service] || service}
            </SelectItem>
          ))}
        </FilterSelect>

        <TeamCombobox
          id="sidak-filter-folder"
          label="Tim"
          icon={Users}
          value={selectedFolder}
          placeholder="Pilih tim"
          options={teamOptions}
          onValueChange={onFolderChange}
        />

        <FilterSelect
          id="sidak-filter-year"
          label="Tahun"
          icon={Calendar}
          value={String(selectedYear)}
          placeholder="Pilih tahun"
          items={availableYears.map((year) => ({
            value: String(year),
            label: String(year),
          }))}
          onValueChange={(value) => onYearChange(Number(value))}
        >
          {availableYears.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>

      <fieldset className="min-w-0 flex-[1.4]">
        <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">
          Periode data
        </legend>
        <MonthRangePicker
          selectedYear={selectedYear}
          startMonth={startMonth}
          endMonth={endMonth}
          onRangeChange={onMonthRangeChange}
          variant="toolbar"
          className="w-full"
        />
      </fieldset>
    </div>
  );
}
