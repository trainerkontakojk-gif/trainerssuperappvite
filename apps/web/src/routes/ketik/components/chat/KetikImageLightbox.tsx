import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface KetikImageLightboxProps {
  src: string | null;
  onClose: () => void;
}

export function KetikImageLightbox({ src, onClose }: KetikImageLightboxProps) {
  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 cursor-pointer"
          onClick={onClose}
        >
          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            src={src}
            alt="Full preview"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
          <button className="absolute top-6 right-6 bg-gray-800/80 text-white p-2 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
