import React from "react";
import { FileUp, X } from "lucide-react";
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
    <div className="col-span-2 border-t border-border pt-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Lampiran Bukti / Media
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          htmlFor="scenario-attachment-upload"
          className="group flex h-28 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border transition-colors hover:border-foreground/30 hover:bg-foreground/[0.02] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foreground"
        >
          <div className="flex flex-col items-center justify-center py-4">
            <FileUp className="mb-1.5 h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
            <p className="text-xs font-medium text-foreground">
              Pilih Gambar / PDF
            </p>
          </div>
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
          <div className="flex gap-2 overflow-x-auto border-l-2 border-border px-3 py-2 scrollbar-hide">
            {attachmentImages.map((img, index) => (
              <div key={index} className="relative shrink-0 group">
                <ScenarioImage
                  base64={img}
                  variant="thumbnail"
                  className="w-14 h-14 rounded-md object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`Hapus lampiran ${index + 1}`}
                  className="absolute -right-2 -top-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
