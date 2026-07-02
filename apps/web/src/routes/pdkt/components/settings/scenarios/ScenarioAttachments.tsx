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
    <div className="col-span-2">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Lampiran Bukti / Media
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col items-center justify-center w-full h-28 border border-dashed border-border rounded-md cursor-pointer hover:bg-foreground/[0.02] hover:border-foreground/30 transition-colors group">
          <div className="flex flex-col items-center justify-center py-4">
            <FileUp className="w-5 h-5 mb-1.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <p className="text-xs font-medium text-foreground">
              Pilih Gambar / PDF
            </p>
          </div>
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            ref={fileInputRef}
            onChange={onUpload}
            className="hidden"
          />
        </label>

        {attachmentImages.length > 0 && (
          <div className="flex gap-2 p-3 bg-card/25 border border-border rounded-xl overflow-x-auto scrollbar-hide">
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
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center shadow transition-opacity cursor-pointer"
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
