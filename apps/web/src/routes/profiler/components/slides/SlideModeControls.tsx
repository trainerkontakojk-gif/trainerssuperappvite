import React from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../../../components/ui/tabs";

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
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={slideMode}
        onValueChange={(value) => {
          if (value === "original" || value === "portraitA4")
            setSlideMode(value);
        }}
      >
        <TabsList variant="default" className="h-11">
          <TabsTrigger value="original" className="h-9 px-3 text-xs">
            Landscape
          </TabsTrigger>
          <TabsTrigger value="portraitA4" className="h-9 px-3 text-xs">
            Portrait
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Button
        onClick={onSaveImage}
        disabled={saving || savingPdf || disabled}
        size="lg"
        className="min-h-11 text-xs"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImageDown size={13} />
        )}
        {saving ? "Menyimpan..." : "Simpan Gambar"}
      </Button>

      <Button
        onClick={onSavePDF}
        disabled={savingPdf || saving || disabled}
        variant="outline"
        size="lg"
        className="min-h-11 border-destructive/40 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {savingPdf ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImageDown size={13} />
        )}
        {savingPdf ? "Menyimpan..." : "Simpan PDF"}
      </Button>
    </div>
  );
};
