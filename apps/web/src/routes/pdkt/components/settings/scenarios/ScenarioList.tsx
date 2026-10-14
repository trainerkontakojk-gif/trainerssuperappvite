import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { cn } from "cn";
import type { PdktScenario } from "@trainers/types";
import { Button } from "../../../../../components/ui/button";
import { SettingsSwitch } from "../../../../../components/settings/SettingsSwitch";
import { REPLY_DIRECTIONS, getReplyDirection } from "./replyDirections";

interface ScenarioListProps {
  scenarios: PdktScenario[];
  activeCount: number;
  totalScenarios: number;
  allSelected: boolean;
  noneSelected: boolean;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onToggleScenario: (id: string) => void;
  onEdit: (scenario: PdktScenario) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

const ALL_CATEGORIES = "";

/** Penanda arah balasan di baris skenario; "Jebakan" memakai warna modul. */
const DIRECTION_DOT: Record<string, string> = {
  cc_only: "bg-muted-foreground",
  ojk_request_in_body: "bg-module-pdkt",
  ojk: "bg-foreground",
};

export function ScenarioList({
  scenarios,
  activeCount,
  totalScenarios,
  allSelected,
  noneSelected,
  onSelectAll,
  onUnselectAll,
  onToggleScenario,
  onEdit,
  onDelete,
  onAdd,
}: ScenarioListProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const categories = Array.from(
    new Set(scenarios.map((scenario) => scenario.category).filter(Boolean)),
  );
  const activeCategory = categories.includes(category)
    ? category
    : ALL_CATEGORIES;
  const needle = query.trim().toLowerCase();
  const visible = scenarios.filter(
    (scenario) =>
      (!activeCategory || scenario.category === activeCategory) &&
      (!needle ||
        `${scenario.title} ${scenario.description}`
          .toLowerCase()
          .includes(needle)),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Skenario
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Kasus yang menjadi dasar email konsumen. Hanya skenario aktif yang
            bisa dipilih saat membuat email.
          </p>
        </div>
        <Button type="button" onClick={onAdd} className="min-h-[44px] shrink-0">
          <Plus data-icon="inline-start" />
          Skenario baru
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-[44px] min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground focus-within:border-foreground">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari skenario"
            aria-label="Cari skenario"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {categories.length > 1 && (
          <div
            role="group"
            aria-label="Filter kategori"
            className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] text-xs font-medium"
          >
            {[ALL_CATEGORIES, ...categories].map((item) => {
              const selected = item === activeCategory;
              return (
                <button
                  key={item || "semua"}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategory(item)}
                  className={cn(
                    "min-h-[44px] shrink-0 rounded-md px-3 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-fg2 hover:text-foreground",
                  )}
                >
                  {item || "Semua"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          {scenarios.length === 0
            ? "Belum ada skenario. Tambahkan skenario baru untuk mulai."
            : "Tidak ada skenario yang cocok dengan pencarian."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((scenario) => {
            const direction = REPLY_DIRECTIONS.find(
              (item) => item.id === getReplyDirection(scenario),
            )!;
            return (
              <li
                key={scenario.id}
                className="flex items-center gap-2 py-2 pr-2 pl-1.5 transition-colors hover:bg-muted/40"
              >
                <SettingsSwitch
                  label={`${scenario.isActive ? "Nonaktifkan" : "Aktifkan"} ${scenario.title}`}
                  checked={scenario.isActive}
                  onCheckedChange={() => onToggleScenario(scenario.id)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={cn(
                      "line-clamp-2 font-semibold",
                      scenario.isActive
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {scenario.title}
                  </span>
                  {/* Tanpa pemisah "·": di layar sempit butir turun ke baris baru tanpa titik menggantung. */}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {scenario.category && (
                      <span className="whitespace-nowrap">
                        {scenario.category}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        direction.id === "ojk_request_in_body"
                          ? "text-module-pdkt"
                          : "text-fg2",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          DIRECTION_DOT[direction.id],
                        )}
                      />
                      {direction.title}
                    </span>
                    <span className="whitespace-nowrap">
                      {scenario.alwaysUseSampleEmail
                        ? "Email tetap"
                        : "Dibuat AI"}
                    </span>
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(scenario)}
                  aria-label={`Ubah ${scenario.title}`}
                  className="min-h-[44px] shrink-0"
                >
                  Ubah
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => onDelete(scenario.id)}
                  aria-label={`Hapus ${scenario.title}`}
                  title="Hapus"
                  className="min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 data-icon="inline" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {activeCount} dari {totalScenarios} skenario aktif. Skenario nonaktif
          tetap tersimpan.
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            disabled={allSelected}
            className="min-h-[44px]"
          >
            Aktifkan semua
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUnselectAll}
            disabled={noneSelected}
            className="min-h-[44px]"
          >
            Nonaktifkan semua
          </Button>
        </div>
      </div>
    </div>
  );
}
