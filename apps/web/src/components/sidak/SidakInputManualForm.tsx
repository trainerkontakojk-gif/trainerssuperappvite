import { useState } from "react";
import { Plus, Check, Loader2, X, Trash2 } from "lucide-react";
import IndicatorDropdown from "./IndicatorDropdown";
import type { QAIndicator, ScoringMode } from "@trainers/types";

const NILAI_OPTIONS = [
  { v: 0, sub: "Sangat Tidak Sesuai", label: "Sangat", active: "bg-rose-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 1, sub: "Tidak Sesuai", label: "Tidak", active: "bg-orange-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 2, sub: "Perlu Perbaikan", label: "Perlu", active: "bg-amber-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 3, sub: "Sesuai", label: "Sesuai", active: "bg-green-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
];

interface Entry {
  uid: string;
  indicator_id: string;
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
}

interface Props {
  entries: Entry[];
  noTiket: string;
  onSetNoTiket: (v: string) => void;
  onUpdateEntry: (uid: string, patch: Record<string, any>) => void;
  onAddEntry: () => void;
  onRemoveEntry: (uid: string) => void;
  onSave: () => void;
  onCancel: () => void;
  activeIndicators: QAIndicator[];
  scoringMode: ScoringMode;
  saving: boolean;
  previewing: boolean;
}

function newEntry(): Entry {
  return { uid: Math.random().toString(36).slice(2), indicator_id: "", nilai: 3, ketidaksesuaian: "", sebaiknya: "" };
}

export { newEntry };

export default function SidakInputManualForm({
  entries, noTiket, onSetNoTiket, onUpdateEntry, onAddEntry, onRemoveEntry,
  onSave, onCancel, activeIndicators, scoringMode, saving, previewing,
}: Props) {
  return (
    <div className="bg-card rounded-2xl border border-primary/20 overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-border bg-primary/5">
        <p className="font-bold">Temuan Baru</p>
        <p className="text-xs text-muted-foreground mt-0.5">Satu tiket bisa memiliki beberapa temuan</p>
      </div>
      <div className="p-6 space-y-6">
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
            No. Tiket
          </label>
          <input
            value={noTiket}
            onChange={(e) => onSetNoTiket(e.target.value)}
            placeholder="Contoh: L202503001"
            className="w-full px-4 py-3 rounded-xl border border-border bg-foreground/5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-4">
          {entries.map((entry, idx) => (
            <div key={entry.uid} className="rounded-2xl border border-border overflow-visible bg-foreground/[0.02]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase">Parameter {idx + 1}</p>
                {entries.length > 1 && (
                  <button
                    onClick={() => onRemoveEntry(entry.uid)}
                    className="text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
                    Parameter
                  </label>
                  <IndicatorDropdown
                    value={entry.indicator_id}
                    indicators={activeIndicators}
                    scoringMode={scoringMode}
                    disabled={activeIndicators.length === 0}
                    onChange={(id) => onUpdateEntry(entry.uid, { indicator_id: id })}
                  />
                  {activeIndicators.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-amber-600">
                      Belum ada parameter untuk layanan dan periode ini.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
                    Nilai
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {NILAI_OPTIONS.map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => onUpdateEntry(entry.uid, { nilai: opt.v })}
                        className={`py-3 rounded-xl border-2 transition-all text-center ${
                          entry.nilai === opt.v ? opt.active : opt.inactive
                        }`}
                      >
                        <p className="text-lg font-black">{opt.v}</p>
                        <p className="text-[9px] font-bold uppercase opacity-60">{opt.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
                      Ketidaksesuaian
                    </label>
                    <textarea
                      value={entry.ketidaksesuaian}
                      onChange={(e) => onUpdateEntry(entry.uid, { ketidaksesuaian: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
                      Sebaiknya
                    </label>
                    <textarea
                      value={entry.sebaiknya}
                      onChange={(e) => onUpdateEntry(entry.uid, { sebaiknya: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddEntry}
          className="w-full py-3 border-2 border-dashed border-primary/20 rounded-2xl text-sm font-bold text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Tambah Parameter
        </button>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || previewing || entries.some((e) => !e.indicator_id)}
            className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
            ) : previewing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Memeriksa...</>
            ) : (
              <><Check className="w-4 h-4" /> Simpan Temuan</>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3.5 bg-foreground/5 text-muted-foreground rounded-xl font-bold sm:w-auto"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
