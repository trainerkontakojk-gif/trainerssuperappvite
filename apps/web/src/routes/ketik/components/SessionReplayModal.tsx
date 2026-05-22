import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MessageSquare,
  Clock,
} from "lucide-react";
import type { ChatMessage, KetikTypoFinding } from "@trainers/types";

interface SessionReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  typos?: KetikTypoFinding[];
  scenarioTitle?: string;
  consumerName?: string;
}

export function SessionReplayModal({
  isOpen,
  onClose,
  messages,
  typos = [],
  scenarioTitle = "Session Replay",
  consumerName = "Consumer",
}: SessionReplayModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const renderTextWithHighlights = (text: string, messageId?: string) => {
    if (!messageId || !typos || typos.length === 0) return text;
    const messageTypos = typos.filter((t) => t.messageId === messageId);
    if (messageTypos.length === 0) return text;
    let parts: (string | React.ReactNode)[] = [text];
    messageTypos.forEach((typo) => {
      const newParts: (string | React.ReactNode)[] = [];
      parts.forEach((part) => {
        if (typeof part === "string") {
          const escapedWord = typo.originalWord.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          );
          const regex = new RegExp(`(${escapedWord})`, "gi");
          const split = part.split(regex);
          for (let i = 0; i < split.length; i++) {
            if (i % 2 === 1) {
              newParts.push(
                <span
                  key={`${typo.id}-${i}`}
                  className="relative group/typo cursor-help inline-block"
                >
                  <span className="underline decoration-red-400 decoration-wavy underline-offset-4 bg-red-400/5 px-0.5 rounded transition-colors group-hover/typo:bg-red-400/10">
                    {split[i]}
                  </span>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover/typo:opacity-100 transition-opacity whitespace-nowrap z-[210] shadow-xl pointer-events-none border border-white/10">
                    <span className="text-white/50 mr-1 italic">Saran:</span>
                    <span className="text-green-400">{typo.correctedWord}</span>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900" />
                  </span>
                </span>,
              );
            } else if (split[i]) {
              newParts.push(split[i]);
            }
          }
        } else {
          newParts.push(part);
        }
      });
      parts = newParts;
    });
    return parts;
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && currentIndex < messages.length - 1) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => prev + 1);
      }, 1500);
    } else if (currentIndex >= messages.length - 1) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [currentIndex]);

  if (!isOpen) return null;

  const currentMessages = messages.slice(0, currentIndex + 1);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl rounded-[2rem] overflow-hidden flex flex-col h-full max-h-[86vh] shadow-2xl shadow-black/10 bg-card border border-border/50"
      >
        <header className="px-5 py-4 sm:px-6 sm:py-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-primary fill-current" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight line-clamp-1">
                {scenarioTitle}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Replay
                </span>
                <span className="w-1 h-1 bg-foreground/20 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {consumerName}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-foreground/5 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 bg-background/50"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
              <MessageSquare className="w-12 h-12 mb-4" />
              <p className="font-black uppercase tracking-widest text-[10px]">
                Tidak ada pesan
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {currentMessages.map((msg, idx) => {
                if (msg.sender === "system") {
                  return (
                    <motion.div
                      key={msg.id || idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-center py-2"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 bg-foreground/5 px-3 py-1 rounded-full">
                        {msg.text}
                      </span>
                    </motion.div>
                  );
                }
                const isAgent = msg.sender === "agent";
                return (
                  <motion.div
                    key={msg.id || idx}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className={`flex w-full ${isAgent ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-5 py-3.5 relative text-[14px] leading-relaxed shadow-sm ${isAgent ? "bg-emerald-600 text-white rounded-[1.5rem] rounded-tr-none" : "bg-foreground/[0.03] border border-border/50 text-foreground rounded-[1.5rem] rounded-tl-none"}`}
                    >
                      <div className="font-medium whitespace-pre-wrap break-words">
                        {renderTextWithHighlights(msg.text, msg.id)}
                      </div>
                      <div
                        className={`text-[8px] font-black uppercase tracking-widest mt-2 flex items-center gap-1.5 opacity-60 ${isAgent ? "justify-end" : "justify-start"}`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        <footer className="p-5 sm:p-6 border-t shrink-0">
          <div className="max-w-md mx-auto">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${((currentIndex + 1) / messages.length) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-black tabular-nums text-muted-foreground min-w-[40px]">
                {currentIndex + 1} / {messages.length}
              </span>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  setCurrentIndex(0);
                  setIsPlaying(false);
                }}
                className="w-12 h-12 flex items-center justify-center rounded-2xl border border-border/50 hover:bg-foreground/5 transition-all"
                title="Reset"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="w-12 h-12 flex items-center justify-center rounded-2xl border border-border/50 hover:bg-foreground/5 transition-all disabled:opacity-20"
                title="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-16 h-16 bg-primary text-white flex items-center justify-center rounded-[2rem] shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current translate-x-0.5" />
                )}
              </button>
              <button
                onClick={() =>
                  setCurrentIndex((prev) =>
                    Math.min(messages.length - 1, prev + 1),
                  )
                }
                disabled={currentIndex === messages.length - 1}
                className="w-12 h-12 flex items-center justify-center rounded-2xl border border-border/50 hover:bg-foreground/5 transition-all disabled:opacity-20"
                title="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <div className="w-12" />
            </div>
            <p className="text-center mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
              Stepping through session replay
            </p>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
