import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import type {
  ChatMessage,
  KetikSessionConfig,
  KetikScenario,
  KetikQuickTemplate,
  PacingMeta,
} from "@trainers/types";
import { KETIK_PROMPT_LIMITS } from "@trainers/types";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { ketikApi } from "../ketikApi";
import { getKetikConsumerAvatarUrl } from "../lib/ketik-avatar";
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
import {
  getKetikScenarioImages,
  getKetikScenarioImageAlts,
} from "./chat/ketikScenarioImages";

interface ChatInterfaceProps {
  config: KetikSessionConfig;
  scenario: KetikScenario;
  onEndSession: (messages: ChatMessage[]) => void;
  isEnding?: boolean;
  templates?: KetikQuickTemplate[];
}

export function ChatInterface({
  config,
  scenario,
  onEndSession,
  isEnding = false,
  templates = [],
}: ChatInterfaceProps) {
  const durationMinutes = config.simulationDuration || 5;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("active");
  const totalDurationSeconds = durationMinutes * 60;
  // Waktu sesi tetap dihitung untuk penutupan oleh konsumen, tetapi tidak
  // ditampilkan: peserta melayani seperti chat sungguhan, tanpa jam hitung.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const timeLeft = Math.max(0, totalDurationSeconds - elapsedSeconds);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const pendingTimeoutsRef = useRef<number[]>([]);
  const sessionPhaseRef = useRef<SessionPhase>("active");
  const timeoutFinalizedRef = useRef(false);
  const closingMessageSentRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const isMountedRef = useRef(true);
  const consumerTurnCountRef = useRef(0);
  const totalSlowCountRef = useRef(0);
  const consecutiveSlowCountRef = useRef(0);
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
    if (sessionPhase === "active") {
      textareaRef.current?.focus();
    }
  }, [sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== "active" && sessionPhase !== "expired") return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionPhase]);

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
    if (sessionPhase !== "active" || timeLeft > 0) return;
    handleSessionTimeout();
  }, [sessionPhase, timeLeft, handleSessionTimeout]);

  // Chat hanya ada di memori: peringatkan sebelum tab ditutup atau dimuat ulang.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: Date.now().toString(),
          sender: "system",
          text: `iMessage with ${config.identity.name}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [messages.length, config.identity.name]);

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

  const endChat = () => {
    setConfirmEnd(false);
    clearPendingTimeouts();
    if (!isLoading && !isEnding) onEndSession(messages);
  };

  return (
    <section
      ref={setLayer}
      aria-label="Ruang chat"
      data-module="ketik"
      className="module-clean-app relative flex h-full w-full flex-col overflow-hidden bg-background"
    >
      <header className="module-clean-toolbar relative z-50 flex w-full shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-5">
        <Avatar size="lg" className="!size-10 !rounded-lg after:!rounded-lg">
          <AvatarImage
            src={getKetikConsumerAvatarUrl(config.identity)}
            alt=""
            className="!rounded-lg"
            referrerPolicy="no-referrer"
          />
          <AvatarFallback className="!rounded-lg bg-module-ketik/15 text-sm font-bold text-module-ketik">
            {config.identity.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-[15px] font-semibold text-foreground">
            {config.identity.name}
          </h1>
          <p className="truncate text-[13px] text-muted-foreground">
            {[config.identity.city, config.identity.phone]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmEnd(true)}
          disabled={isLoading || isEnding}
          className="min-h-[44px] shrink-0 px-4 text-[13px] font-medium"
        >
          {isEnding ? (
            <>
              <span
                aria-hidden="true"
                className="size-3 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none"
              />
              Menyimpan…
            </>
          ) : (
            "Akhiri chat"
          )}
        </Button>
      </header>

      {/* Messages Area */}
      <div className="module-clean-stage custom-scrollbar z-10 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto scroll-smooth px-3 py-4 sm:px-4 md:px-6">
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
                      <p className="max-w-[75ch] text-center text-[14px] font-medium text-muted-foreground">
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

        <AnimatePresence initial={false}>
          {isLoading && (
            <motion.div
              key="consumer-typing"
              layout="position"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-start"
              aria-live="polite"
            >
              <div className="module-clean-panel rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex gap-1">
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
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {sessionPhase === "active" || sessionPhase === "expired" ? (
        <div className="module-clean-toolbar relative z-40 shrink-0 border-t p-3 sm:p-4 md:p-5">

          <div className="mx-auto flex max-w-4xl items-end gap-2 md:gap-3">
            <div className="module-clean-input-shell relative flex flex-1 flex-col rounded-2xl px-4 py-2.5 transition focus-within:border-module-ketik md:px-5">
              <label htmlFor="ketik-message-input" className="sr-only">
                Tulis balasan
              </label>
              <Textarea
                id="ketik-message-input"
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tulis balasan… ketik / untuk template"
                className="max-h-48 min-h-11 w-full resize-none border-none bg-transparent py-1 text-lg font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 md:text-lg"
                rows={1}
                aria-describedby="ketik-char-counter"
                aria-invalid={isOverLimit}
              />

              {/* Character Counter */}
              <div
                id="ketik-char-counter"
                className={`flex items-center justify-end gap-1 px-1 pt-1 text-[14px] font-medium tabular-nums ${
                  isOverLimit ? "text-destructive" : "text-muted-foreground"
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
                <Alert
                  variant="destructive"
                  className="mt-1 px-2 py-1"
                  aria-live="assertive"
                >
                  <AlertDescription className="text-[14px] font-semibold">
                    Pesan terlalu panjang ({charCount.toLocaleString()}{" "}
                    karakter). Maksimum {maxChars.toLocaleString()} karakter.
                  </AlertDescription>
                </Alert>
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
                      <span className="text-[13px] font-semibold text-muted-foreground">
                        Pilih Template
                      </span>
                      <span className="text-[13px] font-medium text-muted-foreground">
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
                            className={`text-[13px] font-semibold ${i === selectedTemplateIndex ? "text-module-ketik" : "text-muted-foreground"}`}
                          >
                            /{t.keyword}
                          </span>
                          <span className="text-[14px] text-foreground font-medium line-clamp-1 opacity-80">
                            {t.content}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-center">
                        <span className="text-[14px] text-muted-foreground font-medium">
                          Tidak ada template yang cocok
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Button
              variant={
                inputText.trim() && !isOverLimit ? "default" : "secondary"
              }
              size="icon-lg"
              onClick={handleSend}
              disabled={!inputText.trim() || isOverLimit}
              className={`h-12 w-12 shrink-0 rounded-2xl transition-transform active:scale-95 md:h-14 md:w-14 ${
                inputText.trim() && !isOverLimit
                  ? "module-clean-button-primary text-white"
                  : "bg-foreground/5 text-muted-foreground"
              }`}
              type="button"
              aria-label="Kirim pesan"
            >
              <Send
                data-icon="inline"
                className={
                  inputText.trim() && !isOverLimit
                    ? "translate-x-0.5 -translate-y-0.5"
                    : ""
                }
              />
            </Button>
          </div>
        </div>
      ) : (
        <div className="module-clean-toolbar z-40 flex shrink-0 items-center justify-center gap-3 border-t p-6 text-center">
          <span className="text-[15px] font-semibold text-muted-foreground">
            Chat telah berakhir
          </span>
        </div>
      )}

      <KetikImageLightbox
        src={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
      <ConfirmDialog
        open={confirmEnd}
        title="Akhiri chat sekarang?"
        description="Percakapan disimpan, lalu Anda masuk ke tahap Telaah. Chat yang sudah diakhiri tidak bisa dilanjutkan."
        confirmLabel="Akhiri chat"
        cancelLabel="Lanjutkan chat"
        confirmVariant="default"
        container={layer}
        onConfirm={endChat}
        onCancel={() => setConfirmEnd(false)}
      />
    </section>
  );
}
