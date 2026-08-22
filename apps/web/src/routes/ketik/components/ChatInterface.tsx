import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Phone,
  MapPin,
  X,
  ArrowLeft,
  Download,
  Sparkles,
} from "lucide-react";
import type {
  ChatMessage,
  KetikSessionConfig,
  KetikScenario,
  KetikQuickTemplate,
  PacingMeta,
} from "@trainers/types";
import { KETIK_PROMPT_LIMITS } from "@trainers/types";
import { ketikApi } from "../ketikApi";
import { shouldLogKetikGenerationError } from "../lib/ketik-error";
import {
  IMAGE_TAG_PATTERN,
  IMAGE_TAG_PATTERN_GLOBAL,
  allowSolutionAcknowledgement,
  normalizeGeneratedParts,
  NO_RESPONSE_PATTERN_GLOBAL,
  normalizeMessagesForDisplay,
} from "../lib/message-utils";
import {
  classifyTextBand,
  isAgentGivingSolution,
  shouldUseFastSameMinute,
  boundedRandom,
  REALISTIC_RANGES,
  FAST_SAME_MINUTE_RANGES,
  TRAINING_FAST_RANGES,
  type SessionPhase,
} from "../lib/pacing";
import {
  KetikMessageBubble,
  renderKetikMessageContent,
} from "./chat/KetikMessageBubble";
import { KetikImageLightbox } from "./chat/KetikImageLightbox";
import { getKetikScenarioImages, getKetikScenarioImageAlts } from "./chat/ketikScenarioImages";

interface ChatInterfaceProps {
  config: KetikSessionConfig;
  scenario: KetikScenario;
  onEndSession: (messages: ChatMessage[]) => void;
  isReviewMode?: boolean;
  initialMessages?: ChatMessage[];
  isEnding?: boolean;
  authReady?: boolean;
  currentUserId?: string;
  templates?: KetikQuickTemplate[];
  signatureName?: string;
}

const MAINTENANCE_TEMPLATE =
  "Demikian informasi yang dapat kami sampaikan. Apakah informasinya sudah cukup jelas? Ada hal lain yang dapat kami bantu?";

export function ChatInterface({
  config,
  scenario,
  onEndSession,
  isReviewMode = false,
  initialMessages = [],
  isEnding = false,
  authReady = true,
  currentUserId,
  templates = [],
  signatureName = "",
}: ChatInterfaceProps) {
  const durationMinutes = config.simulationDuration || 5;
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    normalizeMessagesForDisplay(initialMessages),
  );
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>(
    isReviewMode ? "closed" : "active",
  );
  const totalDurationSeconds = durationMinutes * 60;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timeLeft = Math.max(0, totalDurationSeconds - elapsedSeconds);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [hasTemplateBeenClicked, setHasTemplateBeenClicked] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const pendingTimeoutsRef = useRef<number[]>([]);
  const sessionPhaseRef = useRef<SessionPhase>(
    isReviewMode ? "closed" : "active",
  );
  const timeoutFinalizedRef = useRef(false);
  const closingMessageSentRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(
    normalizeMessagesForDisplay(initialMessages),
  );
  const isMountedRef = useRef(true);
  const consumerTurnCountRef = useRef(0);
  const sendGenerationRef = useRef(0);

  // ── Character counter ─────────────────────────────────
  const charCount = inputText.length;
  const maxChars = KETIK_PROMPT_LIMITS.chatMessageText;
  const isOverLimit = charCount > maxChars;

  const [showTemplatePopup, setShowTemplatePopup] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const templatePopupRef = useRef<HTMLDivElement>(null);

  const filteredTemplates = (templates || []).filter((t) =>
    t.keyword.toLowerCase().includes(templateSearchQuery.toLowerCase()),
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const clearPendingTimeouts = useCallback(() => {
    for (const id of pendingTimeoutsRef.current) {
      clearTimeout(id);
    }
    pendingTimeoutsRef.current = [];
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPendingTimeouts();
    };
  }, [clearPendingTimeouts]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionPhaseRef.current = sessionPhase;
  }, [sessionPhase]);

  useEffect(() => {
    if (!isReviewMode && sessionPhase === "active") {
      textareaRef.current?.focus();
    }
  }, [isReviewMode, sessionPhase]);

  useEffect(() => {
    if (
      isReviewMode ||
      (sessionPhase !== "active" && sessionPhase !== "expired")
    )
      return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isReviewMode, sessionPhase]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
    const lastSlashIndex = inputText.lastIndexOf("/");
    if (lastSlashIndex !== -1) {
      const textAfterSlash = inputText.substring(lastSlashIndex + 1);
      const beforeSlash = inputText.substring(0, lastSlashIndex);
      const isTriggerValid =
        (lastSlashIndex === 0 || beforeSlash.endsWith(" ")) &&
        !textAfterSlash.includes(" ");

      if (isTriggerValid) {
        setShowTemplatePopup(true);
        setTemplateSearchQuery(textAfterSlash);
        setSelectedTemplateIndex((prev) => {
          const newFiltered = (templates || []).filter((t) =>
            t.keyword.toLowerCase().includes(textAfterSlash.toLowerCase()),
          );
          return prev >= newFiltered.length ? 0 : prev;
        });
      } else {
        setShowTemplatePopup(false);
      }
    } else {
      setShowTemplatePopup(false);
    }
  }, [inputText, templates]);

  useEffect(() => {
    if (!showTemplatePopup) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        templatePopupRef.current &&
        !templatePopupRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowTemplatePopup(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTemplatePopup]);

  const handleSessionTimeout = useCallback(() => {
    if (
      sessionPhaseRef.current !== "active" ||
      timeoutFinalizedRef.current ||
      closingMessageSentRef.current
    )
      return;
    timeoutFinalizedRef.current = true;
    closingMessageSentRef.current = true;

    clearPendingTimeouts();
    setIsLoading(false);

    const currentMsgs = messagesRef.current;
    const lastAgentMsg = [...currentMsgs]
      .reverse()
      .find((m) => m.sender === "agent");
    const agentIsGivingSolution = allowSolutionAcknowledgement(
      lastAgentMsg?.text ?? null,
    );

    if (agentIsGivingSolution) {
      sessionPhaseRef.current = "expired";
      setSessionPhase("expired");
      return;
    }

    sessionPhaseRef.current = "expired";
    setSessionPhase("expired");

    const fallbackClosingText =
      "Maaf, saya harus lanjut aktivitas dulu. Nanti saya hubungi lagi ya. Terima kasih.";
    const timeoutMessageId = `timeout-${Date.now()}`;

    setMessages((prev) => {
      const closingMessage: ChatMessage = {
        id: timeoutMessageId,
        sender: "consumer",
        text: fallbackClosingText,
        timestamp: new Date().toISOString(),
      };
      return normalizeMessagesForDisplay([...prev, closingMessage]);
    });
  }, [clearPendingTimeouts]);

  useEffect(() => {
    if (isReviewMode || sessionPhase !== "active" || timeLeft > 0) return;
    handleSessionTimeout();
  }, [isReviewMode, sessionPhase, timeLeft, handleSessionTimeout]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!isReviewMode && messages.length === 0) {
      setMessages([
        {
          id: Date.now().toString(),
          sender: "system",
          text: `iMessage with ${config.identity.name}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [isReviewMode, messages.length, config.identity.name]);

  const handleSend = async () => {
    clearPendingTimeouts();
    sendGenerationRef.current += 1;
    const currentGeneration = sendGenerationRef.current;

    if (
      !inputText.trim() ||
      isOverLimit ||
      (sessionPhase !== "active" && sessionPhase !== "expired")
    )
      return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "agent",
      text: inputText.trim(),
      timestamp: new Date().toISOString(),
      status: "sent",
    };

    setMessages((prev) => [...prev, userMsg]);
    if (hasTemplateBeenClicked && !isMaintenanceMode) {
      setIsMaintenanceMode(true);
    }
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    if (sessionPhase !== "active" || timeLeft <= 0) return;

    setIsLoading(true);

    const currentHistory = [...messages, userMsg];

    try {
      const result = await ketikApi.generate({
        scenarioId: scenario.id,
        scenarioDraft: {
          ...scenario,
          images: scenario.images?.map(() => ""),
          imageAlts: scenario.imageAlts,
        },
        consumerTypeId: config.consumerType.id,
        consumerTypeDraft: config.consumerType,
        identity: config.identity,
        selectedModel: config.selectedModel,
        simulationDuration: config.simulationDuration,
        responsePacingMode: config.responsePacingMode,
        chatHistory: currentHistory,
        remainingSeconds: timeLeft,
        elapsedSeconds,
      });

      if (sessionPhaseRef.current !== "active") {
        setIsLoading(false);
        return;
      }

      if (sendGenerationRef.current !== currentGeneration) return;

      if (!result || !result.text) {
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: "error-" + Date.now(),
            sender: "system",
            text: "Terjadi kesalahan.",
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }

      const responseText = result.text
        .replace(NO_RESPONSE_PATTERN_GLOBAL, "")
        .trim();
      if (responseText) {
        const rawParts = responseText
          .split("[BREAK]")
          .map((p: string) => p.trim())
          .filter((p: string) => p);
        const parts = normalizeGeneratedParts(rawParts);
        const pacingMode = config.responsePacingMode || "realistic";
        const remaining = timeLeft;

        const lastAgentMsg = [...currentHistory]
          .reverse()
          .find((m) => m.sender === "agent");
        const agentGivingSolution = isAgentGivingSolution(lastAgentMsg?.text);

        const isFirstConsumerTurn = consumerTurnCountRef.current === 0;
        consumerTurnCountRef.current += 1;

        const firstBand: "short" | "normal" | "long" | "slow" | "greeting_reply" =
          isFirstConsumerTurn
            ? "greeting_reply"
            : classifyTextBand(parts[0]?.text.length || 0);

        // Opsi B: ~82% beda menit (45-95s), ~18% cepat menit sama (5-25s)
        const useFast =
          pacingMode === "realistic" && shouldUseFastSameMinute({ remainingSeconds: remaining });

        const ranges =
          pacingMode === "realistic"
            ? useFast
              ? FAST_SAME_MINUTE_RANGES
              : REALISTIC_RANGES
            : TRAINING_FAST_RANGES;
        let delay = 0;

        for (let i = 0; i < parts.length; i += 1) {
          const part = parts[i];
          const isFirst = i === 0;
          const band = isFirst ? firstBand : "follow_up";
          const range = ranges[band];
          let plannedDelay = boundedRandom(range.minMs, range.maxMs);

          if (remaining < 25) {
            plannedDelay = boundedRandom(1000, 3000);
          } else if (isFirst && agentGivingSolution && plannedDelay < 10000) {
            plannedDelay = boundedRandom(10000, Math.max(10000, range.maxMs));
          } else {
            const remainingMs = remaining * 1000;
            const maxAllowed = remainingMs - 5000;
            if (plannedDelay > maxAllowed && maxAllowed > 0) {
              plannedDelay = boundedRandom(1000, Math.max(1000, maxAllowed));
            } else if (maxAllowed <= 0) {
              plannedDelay = boundedRandom(1000, 3000);
            }
          }

          delay += plannedDelay;
          const pacingMeta: PacingMeta = {
            mode: pacingMode as "realistic" | "training_fast",
            band,
            plannedDelayMs: plannedDelay,
            timerClamped: remaining < 25,
          };

          const timeoutId = window.setTimeout(() => {
            setMessages((prev) =>
              normalizeMessagesForDisplay([
                ...prev,
                {
                  id: Date.now().toString() + Math.random(),
                  sender: part.sender,
                  text: part.text,
                  timestamp: new Date().toISOString(),
                  pacingMeta,
                },
              ]),
            );
          }, delay);
          pendingTimeoutsRef.current.push(timeoutId);
        }

        const finishId = window.setTimeout(() => setIsLoading(false), delay);
        pendingTimeoutsRef.current.push(finishId);
      } else {
        setIsLoading(false);
        setSessionPhase("closed");
      }
    } catch (error) {
      if (shouldLogKetikGenerationError(error)) {
        console.error("Error generating response", error);
      }
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          id: "error-" + Date.now(),
          sender: "system",
          text: "Terjadi gangguan koneksi dengan konsumen. Coba kirim pesan lagi.",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const applyTemplate = () => {
    const hour = new Date().getHours();
    let greeting = "Pagi";
    if (hour >= 11 && hour < 15) greeting = "Siang";
    else if (hour >= 15) greeting = "Sore";

    const agentName = signatureName || "Petugas";
    const consumerName = config.identity.name;

    const template = `Anda telah terhubung dengan Layanan Kontak OJK 157. Selamat ${greeting}. Saya ${agentName} dengan senang hati memberikan informasi yang Bapak/Ibu ${consumerName} butuhkan seputar Sektor Jasa Keuangan. Perihal apa yang dapat kami bantu?`;

    setHasTemplateBeenClicked(true);
    setInputText(template);
    textareaRef.current?.focus();
  };

  const insertTemplate = (tmpl: { content: string }) => {
    const lastSlashIndex = inputText.lastIndexOf("/");
    const beforeSlash = inputText.substring(0, lastSlashIndex);
    setInputText(beforeSlash + tmpl.content);
    setShowTemplatePopup(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showTemplatePopup) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedTemplateIndex(
          (prev) => (prev + 1) % filteredTemplates.length,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedTemplateIndex(
          (prev) =>
            (prev - 1 + filteredTemplates.length) % filteredTemplates.length,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filteredTemplates.length > 0) {
          e.preventDefault();
          insertTemplate(filteredTemplates[selectedTemplateIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowTemplatePopup(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey && !isOverLimit) {
      e.preventDefault();
      handleSend();
    }
  };

  const applyMaintenance = () => {
    setInputText(MAINTENANCE_TEMPLATE);
    textareaRef.current?.focus();
  };

  return (
    <div
      data-module="ketik"
      className="module-clean-app flex flex-col h-full w-full bg-background overflow-hidden relative"
    >
      {/* Header */}
      <div className="module-clean-toolbar relative z-50 flex w-full shrink-0 items-center justify-between gap-3 border-b px-3 py-3 sm:px-4 md:px-6 md:py-4">
        <div className="flex w-auto shrink-0 items-center gap-3 md:w-1/4">
          {isReviewMode && (
            <button
              type="button"
              onClick={() => onEndSession(messages)}
              className="group flex items-center gap-2 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Kembali dari mode review"
            >
              <div className="module-clean-button-secondary flex h-11 w-11 items-center justify-center rounded-xl transition">
                <ArrowLeft className="h-5 w-5" />
              </div>
              <span className="hidden text-xs font-semibold sm:inline">
                Kembali
              </span>
            </button>
          )}
          {!isReviewMode && (
            <div className="module-clean-panel relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl md:h-12 md:w-12">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-module-ketik/15 text-base font-bold text-module-ketik md:h-12 md:w-12 md:text-lg">
                {config.identity.name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 md:w-2/4">
          <h1 className="max-w-full truncate text-center text-base font-semibold text-foreground md:text-lg">
            {config.identity.name}
          </h1>
          <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-1.5 md:gap-2">
            <div className="module-clean-panel flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 md:px-3">
              <Phone className="h-3 w-3 text-module-ketik" />
              <span className="text-xs font-medium text-muted-foreground">
                {config.identity.phone}
              </span>
            </div>
            <div className="module-clean-panel flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 md:px-3">
              <MapPin className="h-3 w-3 shrink-0 text-module-ketik" />
              <span className="truncate text-xs font-medium text-muted-foreground">
                {config.identity.city}
              </span>
            </div>
          </div>
          {!isReviewMode ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-module-ketik">
                Online
              </span>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {formatTime(elapsedSeconds)}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-module-ketik" />
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <X className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs font-semibold text-orange-500">
                Review Mode
              </span>
            </div>
          )}
        </div>

        <div className="flex w-auto shrink-0 items-center justify-end gap-2 md:w-1/4">
          {isReviewMode ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const csvContent = [
                    "Pengirim,Pesan,Waktu",
                    ...messages.map((message) => {
                      const sender =
                        message.sender === "agent"
                          ? "Agen"
                          : message.sender === "consumer"
                            ? "Konsumen"
                            : "Sistem";
                      const text = message.text.replace(/"/g, '""');
                      const time = new Date(message.timestamp).toLocaleString();

                      return `"${sender}","${text}","${time}"`;
                    }),
                  ].join("\r\n");
                  const blob = new Blob(["\uFEFF", csvContent], {
                    type: "text/csv;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");

                  try {
                    link.href = url;
                    link.download = `chat_review_${Date.now()}.csv`;
                    document.body.appendChild(link);
                    link.click();
                  } finally {
                    link.remove();
                    URL.revokeObjectURL(url);
                  }
                }}
                className="module-clean-button-secondary flex h-11 w-11 items-center justify-center rounded-xl transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Download CSV"
                aria-label="Download transcript CSV"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onEndSession([])}
                className="module-clean-button-secondary flex h-11 w-11 items-center justify-center rounded-xl transition hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Tutup Review"
                aria-label="Tutup mode review"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                clearPendingTimeouts();
                if (!isLoading && !isEnding && authReady) {
                  onEndSession(messages);
                }
              }}
              disabled={isLoading || isEnding || !authReady}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition md:px-5 md:py-2.5
                ${
                  isLoading || isEnding || !authReady
                    ? "bg-red-400 cursor-not-allowed opacity-80"
                    : "bg-red-500 hover:bg-red-600 active:scale-95 cursor-pointer"
                }`}
              aria-label="Akhiri sesi KETIK"
            >
              {isEnding || !authReady ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Memproses...</span>
                </>
              ) : (
                "Selesai"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="module-clean-stage custom-scrollbar z-10 flex flex-1 flex-col space-y-2 overflow-y-auto scroll-smooth px-3 py-4 sm:px-4 md:px-6">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.sender === "system") {
              const msgHasImageTag = IMAGE_TAG_PATTERN.test(msg.text);
              const systemTextWithoutTag = msgHasImageTag
                ? ""
                : msg.text.replace(IMAGE_TAG_PATTERN_GLOBAL, "").trim();

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex justify-center py-4"
                >
                  <div className="flex flex-col items-center gap-2">
                    {systemTextWithoutTag ? (
                      <p className="max-w-[75ch] text-center text-xs font-medium text-muted-foreground">
                        {systemTextWithoutTag}
                      </p>
                    ) : null}
                    {msgHasImageTag ? (
                      <div className="w-full max-w-sm">
                        {renderKetikMessageContent(
                          msg.text,
                          getKetikScenarioImages(scenario),
                          setSelectedImage,
                          getKetikScenarioImageAlts(scenario),
                        )}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            }

            return (
              <KetikMessageBubble
                key={msg.id}
                message={msg}
                scenarioImages={getKetikScenarioImages(scenario)}
                scenarioImageAlts={getKetikScenarioImageAlts(scenario)}
                onImageClick={setSelectedImage}
              />
            );
          })}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex justify-start"
            aria-live="polite"
          >
            <div className="module-clean-panel rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex space-x-1">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6 }}
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                />
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                />
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {!isReviewMode &&
      (sessionPhase === "active" || sessionPhase === "expired") ? (
        <div className="module-clean-toolbar relative z-40 shrink-0 border-t p-3 sm:p-4 md:p-5">
          <div className="absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />

          <div className="mb-3 flex justify-center md:mb-4">
            <button
              type="button"
              onClick={isMaintenanceMode ? applyMaintenance : applyTemplate}
              className="module-clean-button-secondary group flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-module-ketik transition hover:text-module-ketik focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-5"
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
              <span>
                {isMaintenanceMode
                  ? "Gunakan Maintenance"
                  : "Gunakan Template Salam"}
              </span>
            </button>
          </div>

          <div className="mx-auto flex max-w-4xl items-end gap-2 md:gap-3">
            <div className="module-clean-input-shell relative flex flex-1 flex-col rounded-2xl px-4 py-2.5 transition focus-within:border-module-ketik md:px-5">
              <label
                htmlFor="ketik-message-input"
                className="mb-1 ml-1 select-none text-xs font-semibold text-muted-foreground"
              >
                Pesan Baru
              </label>
              <textarea
                id="ketik-message-input"
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tulis pesan Anda..."
                className="max-h-48 min-h-11 w-full resize-none border-none bg-transparent py-1 text-base font-medium text-foreground outline-none placeholder:text-muted-foreground"
                rows={1}
                aria-label="Tulis pesan KETIK"
                aria-describedby="ketik-char-counter"
                aria-invalid={isOverLimit}
              />

              {/* Character Counter */}
              <div
                id="ketik-char-counter"
                className={`flex items-center justify-end gap-1 px-1 pt-1 text-xs font-medium tabular-nums ${
                  isOverLimit
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
                role="status"
                aria-live="polite"
                aria-label={`${charCount} karakter dari ${maxChars}`}
              >
                <span>{charCount.toLocaleString()}</span>
                <span>/</span>
                <span>{maxChars.toLocaleString()}</span>
              </div>

              {/* Over-limit error */}
              {isOverLimit && (
                <div
                  className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold text-red-500"
                  role="alert"
                  aria-live="assertive"
                >
                  <span>
                    Pesan terlalu panjang ({charCount.toLocaleString()} karakter).
                    Maksimum {maxChars.toLocaleString()} karakter.
                  </span>
                </div>
              )}

              {/* Floating Template Popup */}
              <AnimatePresence>
                {showTemplatePopup && (
                  <motion.div
                    ref={templatePopupRef}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="custom-scrollbar absolute bottom-full left-0 z-[60] mb-3 flex max-h-64 w-[min(22rem,calc(100vw-2rem))] flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-card p-2"
                    role="listbox"
                    aria-label="Pilihan template cepat"
                  >
                    <div className="mb-1 flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Pilih Template
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        ↑↓ Navigasi
                      </span>
                    </div>
                    {filteredTemplates.length > 0 ? (
                      filteredTemplates.map((t, i) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => insertTemplate(t)}
                          onMouseEnter={() => setSelectedTemplateIndex(i)}
                          className={`flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                            i === selectedTemplateIndex
                              ? "border-module-ketik/30 bg-module-ketik/10"
                              : "hover:bg-foreground/5 border border-transparent"
                          }`}
                          role="option"
                          aria-selected={i === selectedTemplateIndex}
                        >
                          <span
                            className={`text-xs font-semibold ${i === selectedTemplateIndex ? "text-module-ketik" : "text-muted-foreground"}`}
                          >
                            /{t.keyword}
                          </span>
                          <span className="text-xs text-foreground font-medium line-clamp-1 opacity-80">
                            {t.content}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-center">
                        <span className="text-xs text-muted-foreground font-medium">
                          Tidak ada template yang cocok
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSend}
              disabled={!inputText.trim() || isOverLimit}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-14 md:w-14 ${
                inputText.trim() && !isOverLimit
                  ? "module-clean-button-primary text-white cursor-pointer"
                  : "bg-foreground/5 text-muted-foreground cursor-not-allowed"
              }`}
              type="button"
              aria-label="Kirim pesan"
            >
              <Send
                className={`h-5 w-5 md:h-6 md:w-6 ${inputText.trim() && !isOverLimit ? "translate-x-0.5 -translate-y-0.5" : ""}`}
              />
            </motion.button>
          </div>
        </div>
      ) : !isReviewMode ? (
        <div className="module-clean-toolbar z-40 flex shrink-0 items-center justify-center gap-3 border-t p-6 text-center">
          <span className="text-sm font-semibold text-muted-foreground">
            Sesi Telah Berakhir
          </span>
        </div>
      ) : (
        <div className="module-clean-toolbar z-40 flex shrink-0 items-center justify-center gap-3 border-t p-6 text-center">
          <X className="h-4 w-4 text-orange-500/70" />
          <span className="text-sm font-semibold text-muted-foreground">
            Mode Review &bull; Hanya Baca
          </span>
        </div>
      )}

      <KetikImageLightbox
        src={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </div>
  );
}
