import React from "react";
import { Check, Edit2, Trash2, Plus, Image as ImageIcon, FileText } from "lucide-react";
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 p-4 rounded-xl border border-border/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm tracking-tight">
              Daftar Skenario
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
              <span className="text-primary">{activeCount}</span> / {totalScenarios} Aktif
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={onToggleImageGeneration}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-2 cursor-pointer ${
                enableImageGeneration
                  ? "bg-primary border-primary/20 text-primary-foreground shadow-sm"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              {enableImageGeneration ? "AI Aktif" : "AI Mati"}
            </button>
            {enableImageGeneration && (
              <p className="text-[9px] text-muted-foreground italic max-w-[150px] text-right leading-tight">
                AI akan generate gambar relevan jika skenario tidak memiliki lampiran manual.
              </p>
            )}
          </div>
          <div className="h-6 w-px bg-border/60 mx-1" />
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Pilih Semua
          </button>
          <button
            onClick={onUnselectAll}
            disabled={noneSelected}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
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
            className={`flex items-start p-5 rounded-xl border transition-all relative overflow-hidden ${
              scenario.isActive
                ? "bg-card border-primary/40 shadow-sm"
                : "bg-card/40 border-border/40 opacity-50 hover:opacity-100 hover:bg-card/70"
            }`}
          >
            {scenario.isActive && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            )}

            {/* Checkbox Toggle */}
            <div className="pt-0.5 mr-4 flex items-center justify-center relative z-10">
              <button
                onClick={() => onToggleScenario(scenario.id)}
                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                  scenario.isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-muted/40 hover:border-primary/50 text-transparent"
                }`}
              >
                {scenario.isActive && (
                  <Check className="w-4 h-4 stroke-[3px]" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border/30">
                  {scenario.category}
                </span>
                <h4 className="text-sm font-bold text-foreground tracking-tight truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground font-medium line-clamp-2 leading-relaxed">
                {scenario.description}
              </p>
              {scenario.attachmentImages && scenario.attachmentImages.length > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="px-2 py-0.5 border border-primary/20 bg-primary/5 rounded-md inline-flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
                      {scenario.attachmentImages?.length} Lampiran
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 ml-4 relative z-10">
              <button
                onClick={() => onEdit(scenario)}
                className="p-2 rounded-lg bg-background border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(scenario.id)}
                className="p-2 rounded-lg bg-background border border-border hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}

        {!isOpen && (
          <button
            onClick={onAdd}
            className="w-full py-8 rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground hover:text-foreground hover:bg-muted/20 hover:border-border transition-all flex flex-col items-center justify-center gap-2.5 group mt-2 shadow-inner cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:scale-105 transition-all">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold">
              Tambah Skenario Baru
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
