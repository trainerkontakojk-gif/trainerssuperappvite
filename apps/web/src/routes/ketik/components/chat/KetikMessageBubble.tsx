import { motion } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "@trainers/types";

interface KetikMessageBubbleProps {
  message: ChatMessage;
  scenarioImages: string[];
  onImageClick: (src: string) => void;
}

const TickIcon = ({ status }: { status?: string }) => {
  if (!status) return null;
  const color = status === "read" ? "text-primary" : "text-muted-foreground";
  if (status === "sent") return <Check className={`w-3.5 h-3.5 ${color}`} />;
  return <CheckCheck className={`w-3.5 h-3.5 ${color}`} />;
};

export function renderKetikMessageContent(
  text: string,
  scenarioImages: string[],
  onImageClick: (src: string) => void,
) {
  const parts = text.split(/(\[SEND_IMAGE\s*:\s*\d+\])/gi);

  return parts.map((part, index) => {
    const match = part.match(/\[SEND_IMAGE\s*:\s*(\d+)\]/i);
    if (match) {
      const imgIndex = parseInt(match[1]);
      const imgSrc = scenarioImages[imgIndex];

      if (imgSrc) {
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="my-2"
          >
            <img
              src={imgSrc}
              alt={`Attachment ${imgIndex}`}
              className="rounded-2xl max-h-64 w-full object-cover border border-gray-200 dark:border-white/10 cursor-pointer hover:opacity-90 transition-all"
              onClick={() => onImageClick(imgSrc)}
            />
          </motion.div>
        );
      }
      return (
        <span key={index} className="text-sm italic text-muted-foreground">
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
  onImageClick,
}: KetikMessageBubbleProps) {
  const isAgent = message.sender === "agent";

  return (
    <motion.div
      key={message.id}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={`flex w-full ${isAgent ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] px-6 py-4 relative text-[15px] leading-relaxed shadow-sm
          ${
            isAgent
              ? "bg-module-ketik text-white rounded-[2rem] rounded-tr-none shadow-module-ketik/20"
              : "module-clean-panel text-foreground rounded-[2rem] rounded-tl-none"
          }`}
      >
        <div className="font-medium whitespace-pre-wrap break-words">
          {renderKetikMessageContent(message.text, scenarioImages, onImageClick)}
        </div>
        <div
          className={`text-[9px] font-black uppercase tracking-widest flex items-center justify-end gap-2 mt-2 ${isAgent ? "text-white/80" : "text-muted-foreground"}`}
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
