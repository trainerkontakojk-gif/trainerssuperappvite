import React from "react";
import { FileUp, Trash2 } from "lucide-react";
import { Button } from "../../../../../components/ui/button";
import ScenarioImage from "../../ScenarioImage";

interface ScenarioAttachmentsProps {
  attachmentImages: string[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ScenarioAttachments({
  attachmentImages,
  onUpload,
  onRemove,
  fileInputRef,
}: ScenarioAttachmentsProps) {
  return (
    <div
      id="scenario-attachments"
      className="flex min-w-0 flex-col gap-4 border-t border-border pt-4"
    >
      <div>
        <h4 className="text-sm font-medium text-foreground">
          Lampiran (opsional)
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Gambar maksimal 500KB atau PDF maksimal 2MB, maksimal 5 lampiran per
          skenario.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <label
          htmlFor="scenario-attachment-upload"
          className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring sm:max-w-64"
        >
          <FileUp aria-hidden="true" className="size-5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">
            Pilih Gambar / PDF
          </span>
          <input
            id="scenario-attachment-upload"
            type="file"
            accept="image/*,.pdf,application/pdf"
            ref={fileInputRef}
            onChange={onUpload}
            className="sr-only"
          />
        </label>

        {attachmentImages.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {attachmentImages.map((img, index) => (
              <li key={index} className="flex w-24 flex-col gap-1.5">
                <ScenarioImage
                  base64={img}
                  variant="thumbnail"
                  className="size-24 w-full rounded-lg border border-border object-cover"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(index)}
                  className="justify-start text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus lampiran ${index + 1}`}
                >
                  <Trash2 data-icon="inline-start" />
                  Hapus
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
