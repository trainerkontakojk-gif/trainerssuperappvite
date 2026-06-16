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
  isSlowEligible,
  boundedRandom,
  REALISTIC_RANGES,
  TRAINING_FAST_RANGES,
  type SessionPhase,
} from "../lib/pacing";
import {
  KetikMessageBubble,
  renderKetikMessageContent,
} from "./chat/KetikMessageBubble";
import { KetikImageLightbox } from "./chat/KetikImageLightbox";
import { getKetikScenarioImages } from "./chat/ketikScenarioImages";

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
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
  const totalSlowCountRef = useRef(0);
  const consecutiveSlowCountRef = useRef(0);
  const sendGenerationRef = useRef(0);

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
    if (isReviewMode || sessionPhase !== "active") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isReviewMode, sessionPhase]);

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

      const responseText = result.text.replace(NO_RESPONSE_PATTERN_GLOBAL, "").trim();
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
        const currentConsumerTurn = consumerTurnCountRef.current;

        let firstBand: "short" | "normal" | "long" | "slow" | "greeting_reply" =
          isFirstConsumerTurn
            ? "greeting_reply"
            : classifyTextBand(parts[0]?.text.length || 0);
        const shouldUseSlow =
          pacingMode === "realistic" &&
          parts.length > 0 &&
          !agentGivingSolution &&
          isSlowEligible({
            consumerTurnIndex: currentConsumerTurn,
            consecutiveSlowCount: consecutiveSlowCountRef.current,
            totalSlowCount: totalSlowCountRef.current,
            sessionDurationMinutes: durationMinutes,
            remainingSeconds: remaining,
            elapsedSeconds,
            totalDurationSeconds: durationMinutes * 60,
          });

        if (shouldUseSlow) {
          firstBand = "slow";
          totalSlowCountRef.current += 1;
          consecutiveSlowCountRef.current += 1;
        } else {
          consecutiveSlowCountRef.current = 0;
        }

        const ranges =
          pacingMode === "realistic" ? REALISTIC_RANGES : TRAINING_FAST_RANGES;
        let delay = 0;

        for (let i = 0; i < parts.length; i += 1) {
          const part = parts[i];
          const isFirst = i === 0;
          const band = isFirst ? firstBand : "follow_up";
          const range = ranges[band];
          let plannedDelay = boundedRandom(range.minMs, range.maxMs);

          if (remaining < 20) {
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
            timerClamped: remaining < 20,
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
    } else if (e.key === "Enter" && !e.shiftKey) {
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
      {/* Premium Header */}
      <div className="module-clean-toolbar px-4 py-4 md:px-8 md:py-6 flex items-center justify-between border-b shrink-0 w-full z-50 relative">
        <div className="flex items-center gap-4 w-auto md:w-1/4 shrink-0">
          {isReviewMode && (
            <button
              onClick={() => onEndSession(messages)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all group cursor-pointer"
            >
              <div className="module-clean-button-secondary w-10 h-10 rounded-xl flex items-center justify-center transition-all">
                <ArrowLeft className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                Kembali
              </span>
            </button>
          )}
          {!isReviewMode && (
            <div className="module-clean-panel w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl overflow-hidden shrink-0 relative flex items-center justify-center">
              <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-primary/20 text-primary text-base md:text-lg font-black rounded-xl md:rounded-2xl">
                {config.identity.name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center flex-1 min-w-0 px-2 md:w-2/4">
          <h1 className="font-black text-foreground text-base md:text-xl tracking-tighter truncate max-w-full text-center">
            {config.identity.name}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-1 md:gap-2 mt-1.5 max-w-full">
            <div className="module-clean-panel flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 rounded-full shrink-0">
              <Phone className="w-2.5 h-2.5 text-primary" />
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {config.identity.phone}
              </span>
            </div>
            <div className="module-clean-panel flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 rounded-full min-w-0">
              <MapPin className="w-2.5 h-2.5 text-primary shrink-0" />
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">
                {config.identity.city}
              </span>
            </div>
          </div>
          {!isReviewMode ? (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-module-ketik">
                Online
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
              <span className="w-1 h-1 bg-module-ketik rounded-full animate-pulse"></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <X className="w-3 h-3 text-orange-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                Review Mode
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 w-auto md:w-1/4 shrink-0">
          {isReviewMode ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const csvContent =
                    "data:text/csv;charset=utf-8,Pengirim,Pesan,Waktu\n" +
                    messages
                      .map((m) => {
                        const sender =
                          m.sender === "agent"
                            ? "Agen"
                            : m.sender === "consumer"
                              ? "Konsumen"
                              : "Sistem";
                        const text = m.text.replace(/"/g, '""');
                        const time = new Date(m.timestamp).toLocaleString();
                        return `"${sender}","${text}","${time}"`;
                      })
                      .join("\n");
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute(
                    "download",
                    `chat_review_${Date.now()}.csv`,
                  );
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="module-clean-button-secondary w-12 h-12 flex items-center justify-center hover:text-foreground rounded-2xl transition-all shadow-sm cursor-pointer"
                title="Download CSV"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => onEndSession([])}
                className="module-clean-button-secondary w-12 h-12 flex items-center justify-center hover:text-red-500 rounded-2xl transition-all shadow-sm cursor-pointer"
                title="Tutup Review"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                clearPendingTimeouts();
                if (!isLoading && !isEnding && authReady) {
                  onEndSession(messages);
                }
              }}
              disabled={isLoading || isEnding || !authReady}
              className={`px-4 py-2 md:px-6 md:py-2.5 text-white font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all rounded-xl shadow-lg flex items-center gap-2
                ${
                  isLoading || isEnding || !authReady
                    ? "bg-red-400 cursor-not-allowed opacity-80"
                    : "bg-red-500 hover:bg-red-600 shadow-red-500/20 active:scale-95 cursor-pointer"
                }`}
            >
              {isEnding || !authReady ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
      <div className="module-clean-stage flex-1 overflow-y-auto z-10 scroll-smooth custom-scrollbar flex flex-col p-4 space-y-2">
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
                  className="flex justify-center py-4"
                >
                  <div className="flex flex-col items-center gap-2">
                    {systemTextWithoutTag ? (
                      <p className="text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wide">
                        {systemTextWithoutTag}
                      </p>
                    ) : null}
                    {msgHasImageTag ? (
                      <div className="w-full max-w-sm">
                        {renderKetikMessageContent(
                          msg.text,
                          getKetikScenarioImages(scenario),
                          setSelectedImage,
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
                onImageClick={setSelectedImage}
              />
            );
          })}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-start"
          >
            <div className="module-clean-panel rounded-[20px] rounded-bl-sm px-4 py-3">
              <div className="flex space-x-1">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6 }}
                  className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                />
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                  className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                />
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                  className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
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
        <div className="module-clean-toolbar p-4 md:p-6 border-t z-40 shrink-0 relative">
          <div className="absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />

          <div className="flex justify-center mb-4 md:mb-6">
            <button
              onClick={isMaintenanceMode ? applyMaintenance : applyTemplate}
              className="module-clean-button-secondary flex items-center gap-2 px-4 py-2 md:px-6 md:py-2.5 rounded-2xl shadow-sm text-[9px] md:text-[10px] font-black uppercase tracking-widest text-module-ketik transition-all group cursor-pointer"
            >
              <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5 group-hover:rotate-12 transition-transform" />
              <span>
                {isMaintenanceMode
                  ? "Gunakan Maintenance"
                  : "Gunakan Template Salam"}
              </span>
            </button>
          </div>

          <div className="max-w-4xl mx-auto flex items-end gap-2 md:gap-4">
            <div className="module-clean-input-shell flex-1 rounded-[2rem] border-2 flex flex-col px-4 py-2 md:px-6 md:py-2.5 focus-within:border-module-ketik transition-all shadow-inner">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/50 mb-1 ml-1 select-none">
                Pesan Baru
              </span>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tulis pesan Anda..."
                className="w-full bg-transparent border-none outline-none resize-none max-h-48 min-h-[40px] py-1 text-base text-foreground placeholder-foreground/50 font-medium"
                rows={1}
              />

              {/* Floating Template Popup */}
              <AnimatePresence>
                {showTemplatePopup && (
                  <motion.div
                    ref={templatePopupRef}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-6 mb-4 w-72 max-h-64 overflow-y-auto bg-card border border-border/50 rounded-[2rem] shadow-2xl z-[60] p-3 flex flex-col gap-1 custom-scrollbar"
                  >
                    <div className="px-4 py-2 border-b border-border/10 mb-1 flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Pilih Template
                      </span>
                      <span className="text-[9px] font-medium text-primary/50">
                        ↑↓ Navigasi
                      </span>
                    </div>
                    {filteredTemplates.length > 0 ? (
                      filteredTemplates.map((t, i) => (
                        <button
                          key={t.id}
                          onClick={() => insertTemplate(t)}
                          onMouseEnter={() => setSelectedTemplateIndex(i)}
                          className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex flex-col gap-0.5 cursor-pointer ${
                            i === selectedTemplateIndex
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-foreground/5 border border-transparent"
                          }`}
                        >
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider ${i === selectedTemplateIndex ? "text-primary" : "text-muted-foreground"}`}
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
              whileHover={{ scale: 1.05 }}
              onClick={handleSend}
              disabled={!inputText.trim()}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-[2rem] flex items-center justify-center transition-all shrink-0 ${
                inputText.trim()
                  ? "module-clean-button-primary text-white cursor-pointer"
                  : "bg-foreground/5 text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Send
                className={`w-5 h-5 md:w-6 md:h-6 ${inputText.trim() ? "translate-x-0.5 -translate-y-0.5" : ""}`}
              />
            </motion.button>
          </div>
        </div>
      ) : !isReviewMode ? (
        <div className="module-clean-toolbar p-8 border-t z-40 shrink-0 text-center flex items-center justify-center gap-3">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted-foreground">
            Sesi Telah Berakhir
          </span>
        </div>
      ) : (
        <div className="module-clean-toolbar p-8 border-t z-40 shrink-0 text-center flex items-center justify-center gap-3">
          <X className="w-4 h-4 text-orange-500/50" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted-foreground">
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
