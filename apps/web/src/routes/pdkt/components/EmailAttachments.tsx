import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "cn";
import ScenarioImage from "./ScenarioImage";
import {
  getAttachmentDataUri,
  getPdfBlob,
  getPdfUrl,
  isPdfAttachment,
} from "../utils/detectMimeType";
import { Button } from "../../../components/ui/button";
import { notify } from "../../../lib/toast";

const PDF_OPEN_ERROR =
  "Lampiran PDF tidak bisa dibuka. Izinkan pop-up untuk situs ini, lalu coba lagi.";

interface Props {
  attachments: readonly string[];
  /** `compact` dipakai di kolom email tahap Tanggapi. */
  size?: "default" | "compact";
}

/** Lampiran email konsumen: gambar diperbesar di layar penuh, PDF dibuka di tab baru. */
export function EmailAttachments({ attachments, size = "default" }: Props) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!zoomedImage) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomedImage(null);
      } else if (event.key === "Tab") {
        // Satu-satunya kontrol di pratinjau adalah tombol tutup.
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [zoomedImage]);

  if (attachments.length === 0) return null;

  const open = (base64: string) => {
    if (!isPdfAttachment(base64)) {
      setZoomedImage(getAttachmentDataUri(base64));
      return;
    }
    const pdfUrl = getPdfUrl(base64);
    if (pdfUrl) {
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const pdfBlob = getPdfBlob(base64);
      if (!pdfBlob || typeof URL.createObjectURL !== "function") {
        notify.error(PDF_OPEN_ERROR);
        return;
      }
      const objectUrl = URL.createObjectURL(pdfBlob);
      try {
        // Dengan `noopener` hasil `window.open` selalu null, jadi pop-up yang
        // diblokir tidak bisa dideteksi di sini; yang dilaporkan hanya galat.
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      } finally {
        window.setTimeout(() => URL.revokeObjectURL?.(objectUrl), 60_000);
      }
    } catch {
      // Lampiran rusak tidak boleh merusak panel.
      notify.error(PDF_OPEN_ERROR);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Paperclip aria-hidden="true" className="size-3.5" />
        Lampiran ({attachments.length})
      </span>
      <div
        className={cn(
          "grid gap-3",
          size === "compact"
            ? "grid-cols-3 sm:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3",
        )}
      >
        {attachments.map((base64, index) => (
          <ScenarioImage
            key={index}
            base64={base64}
            alt={`Lampiran ${index + 1}`}
            variant="grid"
            onClick={() => open(base64)}
            className="transition-opacity hover:opacity-90"
          />
        ))}
      </div>

      {zoomedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau lampiran"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setZoomedImage(null);
          }}
        >
          <img
            src={zoomedImage}
            alt="Lampiran diperbesar"
            className="max-h-full max-w-full rounded-xl object-contain ring-1 ring-white/10"
          />
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setZoomedImage(null)}
            aria-label="Tutup pratinjau lampiran"
            className="absolute top-6 right-6 min-h-[44px] min-w-[44px] text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" className="size-8" />
          </Button>
        </div>
      )}
    </div>
  );
}
