import React from "react";
import { Folder, ChevronDown, Check } from "lucide-react";
import type { ProfilerYear, ProfilerFolder } from "@trainers/types";

interface ProfilerExportToolbarProps {
  selectedBatch: string;
  showPicker: boolean;
  setShowPicker: React.Dispatch<React.SetStateAction<boolean>>;
  initialYears: ProfilerYear[];
  initialFolders: ProfilerFolder[];
  handleBatchChange: (newBatch: string) => void;
  pesertaCount: number;
  orientation: "landscape" | "portrait";
  setOrientation: (orientation: "landscape" | "portrait") => void;
}

export function ProfilerExportToolbar({
  selectedBatch,
  showPicker,
  setShowPicker,
  initialYears,
  initialFolders,
  handleBatchChange,
  pesertaCount,
  orientation,
  setOrientation,
}: ProfilerExportToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="focus-within:ring-ring focus-within:border-accent overflow-hidden rounded-3xl border border-border/40 bg-card shadow-sm focus-within:ring-2">
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-4 transition-colors focus-visible:outline-none"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Folder className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Folder yang akan diunduh
            </p>
            <p className="mt-0.5 truncate text-[15px] font-black tracking-tight text-foreground">
              {selectedBatch || "Pilih folder..."}
            </p>
          </div>
          <ChevronDown
            className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
              showPicker ? "rotate-180" : ""
            }`}
          />
        </button>
        {showPicker && (
          <div className="max-h-80 space-y-4 overflow-y-auto border-t border-border/40 p-3">
            {initialYears.length === 0 ? (
              <p className="py-4 text-center text-sm font-medium text-muted-foreground">
                Tidak ada data tahun.
              </p>
            ) : (
              initialYears.map((year) => {
                const yearFolders = initialFolders.filter(
                  (f) => f.year_id === year.id && !f.parent_id
                );
                if (yearFolders.length === 0) return null;

                return (
                  <div key={year.id} className="space-y-2">
                    <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {year.label}
                    </p>
                    <div className="space-y-1">
                      {yearFolders.map((folder) => {
                        const subFolders = initialFolders.filter(
                          (f) => f.parent_id === folder.id
                        );
                        return (
                          <div key={folder.id} className="space-y-1">
                            <button
                              onClick={() => {
                                handleBatchChange(folder.name);
                              }}
                              className={`focus-visible:ring-ring flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                                folder.name === selectedBatch
                                  ? "bg-primary/10 font-bold text-primary"
                                  : "hover:bg-muted font-medium text-foreground/80"
                              }`}
                            >
                              {folder.name}
                              {folder.name === selectedBatch && (
                                <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                              )}
                            </button>

                            {subFolders.map((sub) => (
                              <button
                                key={sub.id}
                                onClick={() => {
                                  handleBatchChange(sub.name);
                                }}
                                className={`focus-visible:ring-ring ml-4 flex w-[calc(100%-1rem)] items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                                  sub.name === selectedBatch
                                    ? "bg-primary/10 font-bold text-primary"
                                    : "hover:bg-muted font-medium text-foreground/80"
                                }`}
                              >
                                {sub.name}
                                {sub.name === selectedBatch && (
                                  <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                                )}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-3xl border border-border/40 bg-card p-5 shadow-sm">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Total peserta siap diunduh
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-black leading-none tracking-tight text-foreground">
              {pesertaCount}
            </span>
            <span className="text-sm font-bold text-muted-foreground">
              Orang
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1 rounded-2xl border border-border/40 bg-muted/50 p-1.5">
          <button
            onClick={() => setOrientation("landscape")}
            className={`focus-visible:ring-ring rounded-xl px-4 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 ${
              orientation === "landscape"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            Landscape
          </button>
          <button
            onClick={() => setOrientation("portrait")}
            className={`focus-visible:ring-ring rounded-xl px-4 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 ${
              orientation === "portrait"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            Portrait
          </button>
        </div>
      </div>
    </div>
  );
}
