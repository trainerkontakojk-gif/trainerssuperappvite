import React from "react";
import { Image as ImageIcon, X } from "lucide-react";
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
      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
        Lampiran Bukti / Media
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col items-center justify-center w-full h-28 border border-dashed border-border/85 rounded-xl cursor-pointer bg-muted/10 hover:bg-primary/5 hover:border-primary/30 transition-all group">
          <div className="flex flex-col items-center justify-center py-4">
            <ImageIcon className="w-7 h-7 mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
              Upload Media
            </p>
          </div>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={onUpload}
            className="hidden"
          />
        </label>

        {attachmentImages.length > 0 && (
          <div className="flex gap-2 p-3 bg-muted/20 border border-border/40 rounded-xl overflow-x-auto custom-scrollbar">
            {attachmentImages.map((img, index) => (
              <div key={index} className="relative shrink-0 group">
                <ScenarioImage
                  base64={img}
                  variant="thumbnail"
                  className="w-16 h-16 rounded-lg"
                />
                <button
                  onClick={() => onRemove(index)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
