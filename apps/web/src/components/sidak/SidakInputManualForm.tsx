import { useState } from "react";
import { Plus, Check, Loader2, X, Trash2 } from "lucide-react";
import IndicatorDropdown from "./IndicatorDropdown";
import type { QAIndicator, ScoringMode } from "@trainers/types";

const NILAI_OPTIONS = [
  {
    v: 0,
    sub: "Sangat Tidak Sesuai",
    label: "Sangat",
    active: "bg-rose-500/15 text-rose-600 border-rose-500/30",
    inactive:
      "bg-background border-border text-muted-foreground hover:bg-muted",
  },
  {
    v: 1,
    sub: "Tidak Sesuai",
    label: "Tidak",
    active: "bg-orange-500/15 text-orange-600 border-orange-500/30",
    inactive:
      "bg-background border-border text-muted-foreground hover:bg-muted",
  },
  {
    v: 2,
    sub: "Perlu Perbaikan",
    label: "Perlu",
    active: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    inactive:
      "bg-background border-border text-muted-foreground hover:bg-muted",
  },
  {
    v: 3,
    sub: "Sesuai",
    label: "Sesuai",
    active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    inactive:
      "bg-background border-border text-muted-foreground hover:bg-muted",
  },
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
  serviceType: QAIndicator["service_type"];
  saving: boolean;
  previewing: boolean;
}

function newEntry(): Entry {
  return {
    uid: Math.random().toString(36).slice(2),
    indicator_id: "",
    nilai: 3,
    ketidaksesuaian: "",
    sebaiknya: "",
  };
}

export { newEntry };

export default function SidakInputManualForm({
  entries,
  noTiket,
  onSetNoTiket,
  onUpdateEntry,
  onAddEntry,
  onRemoveEntry,
  onSave,
  onCancel,
  activeIndicators,
  scoringMode,
  saving,
  previewing,
  serviceType,
}: Props) {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/20">
        <p className="font-semibold text-foreground">Temuan Baru</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Satu tiket bisa memiliki beberapa temuan
          {serviceType === "slik"
            ? " · Nilai 3 setara nilai rekomendasi 1 pada matriks SLIK"
            : ""}
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
            No. Tiket
          </label>
          <input
            value={noTiket}
            onChange={(e) => onSetNoTiket(e.target.value)}
            placeholder="Contoh: L202503001"
            className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground"
          />
        </div>

        <div className="space-y-4">
          {entries.map((entry, idx) => (
            <div
              key={entry.uid}
              className="rounded-xl border border-border overflow-visible bg-background/20"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Parameter {idx + 1}
                </p>
                {entries.length > 1 && (
                  <button
                    onClick={() => onRemoveEntry(entry.uid)}
                    className="text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-550/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                    Parameter
                  </label>
                  <IndicatorDropdown
                    value={entry.indicator_id}
                    indicators={activeIndicators}
                    scoringMode={scoringMode}
                    disabled={activeIndicators.length === 0}
                    onChange={(id) =>
                      onUpdateEntry(entry.uid, { indicator_id: id })
                    }
                  />
                  {activeIndicators.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-amber-600">
                      Belum ada parameter untuk layanan dan periode ini.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                    Nilai
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {NILAI_OPTIONS.map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() =>
                          onUpdateEntry(entry.uid, { nilai: opt.v })
                        }
                        className={`py-2.5 rounded-lg border transition-all text-center ${
                          entry.nilai === opt.v ? opt.active : opt.inactive
                        }`}
                      >
                        <p className="text-lg font-bold">{opt.v}</p>
                        <p className="text-[9px] font-semibold uppercase opacity-65">
                          {opt.label}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      Ketidaksesuaian
                    </label>
                    <textarea
                      value={entry.ketidaksesuaian}
                      onChange={(e) =>
                        onUpdateEntry(entry.uid, {
                          ketidaksesuaian: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-foreground text-foreground resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      Sebaiknya
                    </label>
                    <textarea
                      value={entry.sebaiknya}
                      onChange={(e) =>
                        onUpdateEntry(entry.uid, { sebaiknya: e.target.value })
                      }
                      rows={2}
                      className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-foreground text-foreground resize-none"
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
          className="w-full py-2.5 border border-dashed border-border rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Tambah Parameter
        </button>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={onSave}
            disabled={
              saving || previewing || entries.some((e) => !e.indicator_id)
            }
            className="flex-1 py-3 bg-foreground hover:opacity-90 disabled:opacity-50 text-background rounded-lg text-xs font-semibold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
              </>
            ) : previewing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Memeriksa...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" /> Simpan Temuan
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 bg-transparent border border-border hover:bg-muted text-muted-foreground rounded-lg text-xs font-semibold uppercase tracking-wide transition sm:w-auto"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
