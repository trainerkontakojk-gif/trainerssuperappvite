import React from "react";
import { ImageDown, Loader2 } from "lucide-react";

export type SlideMode = "original" | "portraitA4";

interface SlideModeControlsProps {
  slideMode: SlideMode;
  setSlideMode: (mode: SlideMode) => void;
  onSaveImage: () => void;
  onSavePDF: () => void;
  saving: boolean;
  savingPdf: boolean;
  disabled: boolean;
}

export const SlideModeControls: React.FC<SlideModeControlsProps> = ({
  slideMode,
  setSlideMode,
  onSaveImage,
  onSavePDF,
  saving,
  savingPdf,
  disabled,
}) => {
  return (
    <div className="flex items-center gap-3">
      {/* Slide Mode Toggle */}
      <div className="bg-muted/30 border-border/40 flex items-center rounded-xl border p-1">
        <button
          onClick={() => setSlideMode("original")}
          className={`focus-visible:ring-ring rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 ${
            slideMode === "original"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Versi Landscape"
        >
          Landscape
        </button>
        <button
          onClick={() => setSlideMode("portraitA4")}
          className={`focus-visible:ring-ring rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 ${
            slideMode === "portraitA4"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Portrait A4"
        >
          Portrait
        </button>
      </div>

      <button
        onClick={onSaveImage}
        disabled={saving || savingPdf || disabled}
        className="text-primary-foreground bg-primary border-primary/10 focus-visible:ring-ring flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImageDown size={13} />
        )}
        {saving ? "Menyimpan..." : "Simpan Gambar"}
      </button>

      <button
        onClick={onSavePDF}
        disabled={savingPdf || saving || disabled}
        className="text-destructive-foreground bg-destructive border-destructive/10 focus-visible:ring-ring flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2"
      >
        {savingPdf ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImageDown size={13} />
        )}
        {savingPdf ? "Menyimpan..." : "Simpan PDF"}
      </button>
    </div>
  );
};
