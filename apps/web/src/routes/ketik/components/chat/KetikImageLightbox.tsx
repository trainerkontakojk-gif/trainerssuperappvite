import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface KetikImageLightboxProps {
  src: string | null;
  onClose: () => void;
}

export function KetikImageLightbox({ src, onClose }: KetikImageLightboxProps) {
  useEffect(() => {
    if (!src) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background/95 p-4 sm:p-6"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau gambar"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="module-clean-panel max-h-full max-w-5xl cursor-default overflow-hidden rounded-2xl p-2"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={src}
              alt="Pratinjau penuh lampiran skenario"
              className="max-h-[82dvh] max-w-full rounded-xl object-contain"
            />
          </motion.div>
          <button
            type="button"
            className="module-clean-button-secondary absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:right-6 sm:top-6"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Tutup pratinjau gambar"
          >
            <X className="h-5 w-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
