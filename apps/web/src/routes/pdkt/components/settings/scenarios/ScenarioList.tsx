import React from "react";
import { Check, Edit2, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { motion } from "framer-motion";
import { PdktScenario } from "@trainers/types";

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
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 mt-2">
        <div>
          <h3 className="font-bold text-foreground text-lg tracking-tight">
            Daftar Skenario
          </h3>
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary mt-0.5">
            {activeCount} / {totalScenarios} AKTIF
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleImageGeneration}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
                enableImageGeneration
                  ? "bg-primary border-primary/20 text-primary-foreground"
                  : "bg-transparent border-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {enableImageGeneration ? "AI Gambar Aktif" : "AI Gambar Mati"}
            </button>
            {enableImageGeneration && (
              <span className="text-[11px] text-muted-foreground hidden lg:inline max-w-[200px] leading-tight">
                AI generate gambar jika tidak ada lampiran manual.
              </span>
            )}
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Pilih Semua
          </button>
          <button
            onClick={onUnselectAll}
            disabled={noneSelected}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Hapus Semua
          </button>
        </div>
      </div>

      {/* Scenario List */}
      <div className="grid grid-cols-1 gap-3">
        {scenarios.map((scenario) => (
          <motion.div
            layout
            key={scenario.id}
            className={`flex items-start p-4 rounded-xl border transition-all relative overflow-hidden ${
              scenario.isActive
                ? "bg-card border-border/80"
                : "bg-card/40 border-border/30 opacity-85 hover:opacity-100"
            }`}
          >
            {/* Checkbox Toggle */}
            <div className="pt-0.5 mr-3 shrink-0">
              <button
                onClick={() => onToggleScenario(scenario.id)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                  scenario.isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border hover:border-foreground/30 bg-transparent text-transparent"
                }`}
              >
                {scenario.isActive && (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium">
                  {scenario.category}
                </span>
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {scenario.description}
              </p>
              {scenario.attachmentImages && scenario.attachmentImages.length > 0 && (
                <div className="mt-2.5">
                  <span className="text-[11px] bg-foreground/5 text-muted-foreground px-2 py-1 rounded-md inline-flex items-center gap-1.5 font-medium border border-border/50">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    {scenario.attachmentImages?.length} Lampiran
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 ml-3 shrink-0">
              <button
                onClick={() => onEdit(scenario)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border cursor-pointer"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(scenario.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20 cursor-pointer"
                title="Hapus"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}

        {!isOpen && (
          <button
            onClick={onAdd}
            className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group"
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">
              Tambah Skenario Baru
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
