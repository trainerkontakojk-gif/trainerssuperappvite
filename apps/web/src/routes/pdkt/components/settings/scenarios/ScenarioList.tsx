import React from "react";
import { Check, Edit2, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { PdktScenario } from "@trainers/types";
import { Button } from "../../../../../components/ui/button";

interface ScenarioListProps {
  scenarios: PdktScenario[];
  isOpen: boolean;
  activeCount: number;
  totalScenarios: number;
  allSelected: boolean;
  noneSelected: boolean;
  enableImageGeneration: boolean;
  onToggleImageGeneration: () => void;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onToggleScenario: (id: string) => void;
  onEdit: (scenario: PdktScenario) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function ScenarioList({
  scenarios,
  isOpen,
  activeCount,
  totalScenarios,
  allSelected,
  noneSelected,
  enableImageGeneration,
  onToggleImageGeneration,
  onSelectAll,
  onUnselectAll,
  onToggleScenario,
  onEdit,
  onDelete,
  onAdd,
}: ScenarioListProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Daftar Skenario
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeCount} dari {totalScenarios} skenario aktif dipakai saat
            membuat email baru.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={enableImageGeneration ? "secondary" : "outline"}
            aria-pressed={enableImageGeneration}
            onClick={onToggleImageGeneration}
          >
            <ImageIcon data-icon="inline-start" />
            {enableImageGeneration ? "Gambar AI aktif" : "Gambar AI nonaktif"}
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSelectAll}
              disabled={allSelected}
            >
              Aktifkan Semua
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onUnselectAll}
              disabled={noneSelected}
            >
              Nonaktifkan Semua
            </Button>
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {scenarios.map((scenario) => (
          <li
            key={scenario.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
          >
            <Button
              type="button"
              variant={scenario.isActive ? "default" : "outline"}
              size="icon-lg"
              aria-pressed={scenario.isActive}
              aria-label={`${scenario.isActive ? "Nonaktifkan" : "Aktifkan"} skenario ${scenario.title}`}
              onClick={() => onToggleScenario(scenario.id)}
              className={scenario.isActive ? "" : "text-muted-foreground"}
            >
              {scenario.isActive ? (
                <Check data-icon="inline" />
              ) : (
                <span aria-hidden="true" className="size-4" />
              )}
            </Button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {scenario.category}
                </span>
                <h4 className="truncate text-sm font-medium text-foreground">
                  {scenario.title}
                </h4>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {scenario.description}
              </p>
              {scenario.attachmentImages &&
                scenario.attachmentImages.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ImageIcon aria-hidden="true" className="size-3.5" />
                    {scenario.attachmentImages.length} lampiran
                  </p>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={() => onEdit(scenario)}
                className="text-muted-foreground hover:text-foreground"
                title="Edit"
                aria-label={`Edit ${scenario.title}`}
              >
                <Edit2 data-icon="inline" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={() => onDelete(scenario.id)}
                className="text-muted-foreground hover:text-destructive"
                title="Hapus"
                aria-label={`Hapus ${scenario.title}`}
              >
                <Trash2 data-icon="inline" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {!isOpen && (
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
        >
          <Plus data-icon="inline" />
          <span className="text-sm font-medium">Tambah Skenario Baru</span>
        </Button>
      )}
    </div>
  );
}
