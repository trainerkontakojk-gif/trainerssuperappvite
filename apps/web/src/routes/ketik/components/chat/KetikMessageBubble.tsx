import { motion, useReducedMotion } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "@trainers/types";

interface KetikMessageBubbleProps {
  message: ChatMessage;
  scenarioImages: string[];
  scenarioImageAlts?: string[];
  onImageClick: (src: string) => void;
}

const TickIcon = ({ status }: { status?: string }) => {
  if (!status) return null;
  const color = status === "read" ? "text-primary" : "text-muted-foreground";
  if (status === "sent") return <Check className={`h-3.5 w-3.5 ${color}`} />;
  return <CheckCheck className={`h-3.5 w-3.5 ${color}`} />;
};

export function renderKetikMessageContent(
  text: string,
  scenarioImages: string[],
  onImageClick: (src: string) => void,
  scenarioImageAlts?: string[],
) {
  const parts = text.split(/(\[SEND_IMAGE\s*:\s*\d+\])/gi);

  return parts.map((part, index) => {
    const match = part.match(/\[SEND_IMAGE\s*:\s*(\d+)\]/i);
    if (match) {
      const imgIndex = parseInt(match[1]);
      const imgSrc = scenarioImages[imgIndex];

      if (imgSrc) {
        const altText =
          scenarioImageAlts?.[imgIndex]?.trim() ||
          `Lampiran skenario ${imgIndex}`;
        return (
          <motion.button
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            type="button"
            className="my-2 block w-full overflow-hidden rounded-xl border border-border bg-background text-left transition hover:border-module-ketik focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => onImageClick(imgSrc)}
            aria-label={`Buka lampiran gambar ${imgIndex}: ${altText}`}
          >
            <img
              src={imgSrc}
              alt={altText}
              className="max-h-64 w-full object-cover"
              loading="lazy"
            />
          </motion.button>
        );
      }
      return (
        <span key={index} className="text-[15px] italic text-muted-foreground">
          Lampiran gambar
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function KetikMessageBubble({
  message,
  scenarioImages,
  scenarioImageAlts,
  onImageClick,
}: KetikMessageBubbleProps) {
  const isAgent = message.sender === "agent";
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      key={message.id}
      layout="position"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
      }
      className={`flex w-full ${isAgent ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`relative max-w-[88%] px-4 py-3 text-lg leading-7 sm:max-w-[76%] sm:px-5
          ${
            isAgent
              ? "rounded-2xl rounded-tr-md bg-module-ketik text-white"
              : "module-clean-panel rounded-2xl rounded-tl-md text-foreground"
          }`}
      >
        <div className="whitespace-pre-wrap break-words font-medium">
          {renderKetikMessageContent(
            message.text,
            scenarioImages,
            onImageClick,
            scenarioImageAlts,
          )}
        </div>
        <div
          className={`mt-2 flex items-center justify-end gap-2 text-[13px] font-medium tabular-nums ${isAgent ? "text-white/80" : "text-muted-foreground"}`}
        >
          <span>
            {message.timestamp
              ? new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </span>
          {isAgent && <TickIcon status={message.status} />}
        </div>
      </div>
    </motion.div>
  );
}
