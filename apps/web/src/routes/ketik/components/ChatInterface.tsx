import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Phone,
  X,
  Check,
  CheckCheck,
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

const TickIcon = ({ status }: { status?: string }) => {
  if (!status) return null;
  const color = status === "read" ? "text-primary" : "text-muted-foreground";
  if (status === "sent") return <Check className={`w-3.5 h-3.5 ${color}`} />;
  return <CheckCheck className={`w-3.5 h-3.5 ${color}`} />;
};

const IMAGE_TAG_PATTERN = /\[SEND_IMAGE\s*:\s*\d+\]/i;
const IMAGE_TAG_PATTERN_GLOBAL = /\[SEND_IMAGE\s*:\s*\d+\]/gi;
const SYSTEM_TAG_PATTERN = /\[(sistem|system)\]/i;
const SYSTEM_TAG_PATTERN_GLOBAL = /\[(sistem|system)\]/gi;
const MAINTENANCE_TEMPLATE =
  "Demikian informasi yang dapat kami sampaikan. Apakah informasinya sudah cukup jelas? Ada hal lain yang dapat kami bantu?";

const STRICT_INSTRUCTIONAL_CUES = [
  "silakan",
  "mohon",
  "harap",
  "bisa dilakukan",
  "yang perlu",
  "pastikan",
  "hubungi",
  "datang ke",
  "bawa",
  "siapkan",
  "verifikasi",
] as const;

const ACTION_VERB_CUES = [
  "coba",
  "klik",
  "tekan",
  "pilih",
  "masukkan",
  "isi",
  "konfirmasi",
] as const;

function hasStructuralSteps(text: string): boolean {
  const lines = text.split(/\n/);
  let stepCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[\d]+[.)]\s/.test(trimmed)) stepCount += 1;
    else if (/^[a-z][.)]\s/i.test(trimmed)) stepCount += 1;
    else if (/^[-*•]\s/.test(trimmed)) stepCount += 1;
  }
  return stepCount >= 2;
}

function countCuesWithBoundary(lower: string): number {
  let count = 0;
  for (const cue of STRICT_INSTRUCTIONAL_CUES) {
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = cue.includes(" ")
      ? new RegExp(escaped, "i")
      : new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(lower)) count += 1;
  }
  for (const cue of ACTION_VERB_CUES) {
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(lower)) count += 1;
  }
  return count;
}

function allowSolutionAcknowledgement(
  lastAgentText: string | null,
): boolean {
  if (!lastAgentText) return false;
  const lower = lastAgentText.toLowerCase();
  const cueCount = countCuesWithBoundary(lower);
  const hasSteps = hasStructuralSteps(lastAgentText);
  const hasNextWord = /\b(selanjutnya|berikutnya|kemudian|lalu)\b/i.test(lower);
  if (cueCount >= 3) return true;
  if (cueCount >= 2 && hasSteps) return true;
  if (cueCount >= 2 && hasNextWord) return true;
  if (cueCount >= 1 && hasSteps) return true;
  return false;
}

function stripSystemTags(text: string): string {
  return text.replace(SYSTEM_TAG_PATTERN_GLOBAL, "").trim();
}

function hasImageTag(text: string): boolean {
  return IMAGE_TAG_PATTERN.test(text);
}

function isImageOnlyText(text: string): boolean {
  const cleaned = stripSystemTags(text);
  return (
    cleaned.length > 0 &&
    hasImageTag(cleaned) &&
    cleaned.replace(IMAGE_TAG_PATTERN_GLOBAL, "").trim() === ""
  );
}

function stripNarrationFromImagePart(text: string): string {
  const match = text.match(IMAGE_TAG_PATTERN);
  if (match) {
    const stripped = text.replace(IMAGE_TAG_PATTERN_GLOBAL, "").trim();
    if (stripped) {
      console.warn(
        "[ketik][stripNarration] Stripped narration from image part:",
        { stripped, kept: match[0] },
      );
    }
    return match[0];
  }
  return text;
}

function normalizeGeneratedParts(
  parts: string[],
): Array<Pick<ChatMessage, "sender" | "text">> {
  const normalized: Array<Pick<ChatMessage, "sender" | "text">> = [];

  for (let index = 0; index < parts.length; index += 1) {
    const currentRaw = parts[index];
    const currentText = stripSystemTags(currentRaw);
    const nextRaw = parts[index + 1];

    if (!currentText) continue;

    if (SYSTEM_TAG_PATTERN.test(currentRaw) && hasImageTag(currentRaw)) {
      normalized.push({
        sender: "consumer",
        text: stripNarrationFromImagePart(currentRaw),
      });
      continue;
    }

    if (
      SYSTEM_TAG_PATTERN.test(currentRaw) &&
      nextRaw &&
      isImageOnlyText(nextRaw)
    ) {
      normalized.push({
        sender: "consumer",
        text: `${currentText} ${stripSystemTags(nextRaw)}`.trim(),
      });
      index += 1;
      continue;
    }

    normalized.push({
      sender: hasImageTag(currentText)
        ? "consumer"
        : SYSTEM_TAG_PATTERN.test(currentRaw)
          ? "system"
          : "consumer",
      text: currentText,
    });
  }

  return normalized;
}

function normalizeMessagesForDisplay(messages: ChatMessage[]): ChatMessage[] {
  const normalized: ChatMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    const currentText = typeof current.text === "string" ? current.text : "";
    const cleanedText = stripSystemTags(currentText);
    const next = messages[index + 1];

    if (current.sender === "system" && hasImageTag(currentText)) {
      normalized.push({
        ...current,
        sender: "consumer",
        text: stripNarrationFromImagePart(currentText),
      });
      continue;
    }

    if (current.sender === "system" && next && isImageOnlyText(next.text)) {
      normalized.push({
        ...next,
        sender: "consumer",
        text: `${cleanedText} ${stripSystemTags(next.text)}`.trim(),
      });
      index += 1;
      continue;
    }

    if (hasImageTag(currentText)) {
      normalized.push({ ...current, sender: "consumer", text: cleanedText });
      continue;
    }

    normalized.push(
      cleanedText !== currentText ? { ...current, text: cleanedText } : current,
    );
  }

  return normalized;
}

type SessionPhase = "active" | "expired" | "closed";

function classifyTextBand(textLength: number): "short" | "normal" | "long" {
  if (textLength <= 25) return "short";
  if (textLength <= 90) return "normal";
  return "long";
}

function isAgentGivingSolution(lastAgentText: string | undefined): boolean {
  if (!lastAgentText) return false;
  return lastAgentText.length > 90;
}

function isSlowEligible(params: {
  consumerTurnIndex: number;
  consecutiveSlowCount: number;
  totalSlowCount: number;
  sessionDurationMinutes: number;
  remainingSeconds: number;
  elapsedSeconds?: number;
  totalDurationSeconds?: number;
}): boolean {
  const {
    consumerTurnIndex,
    consecutiveSlowCount,
    totalSlowCount,
    sessionDurationMinutes,
    remainingSeconds,
    elapsedSeconds,
    totalDurationSeconds,
  } = params;
  if (consumerTurnIndex < 4) return false;
  if (consecutiveSlowCount >= 1) return false;
  if (remainingSeconds < 45) return false;
  if (
    elapsedSeconds !== undefined &&
    totalDurationSeconds !== undefined &&
    totalDurationSeconds > 0
  ) {
    const elapsedRatio = elapsedSeconds / totalDurationSeconds;
    if (elapsedRatio < 0.25) return false;
  }
  const maxSlow =
    sessionDurationMinutes <= 5 ? 1 : sessionDurationMinutes <= 15 ? 2 : 2;
  if (totalSlowCount >= maxSlow) return false;
  return Math.random() < 0.15;
}

const REALISTIC_RANGES: Record<string, { minMs: number; maxMs: number }> = {
  short: { minMs: 1000, maxMs: 3000 },
  normal: { minMs: 5000, maxMs: 10000 },
  long: { minMs: 10000, maxMs: 20000 },
  slow: { minMs: 20000, maxMs: 30000 },
  follow_up: { minMs: 1200, maxMs: 2500 },
  greeting_reply: { minMs: 2000, maxMs: 6000 },
};

const TRAINING_FAST_RANGES: Record<string, { minMs: number; maxMs: number }> = {
  short: { minMs: 800, maxMs: 1500 },
  normal: { minMs: 2000, maxMs: 4000 },
  long: { minMs: 4000, maxMs: 7000 },
  slow: { minMs: 800, maxMs: 1500 },
  follow_up: { minMs: 800, maxMs: 1500 },
  greeting_reply: { minMs: 500, maxMs: 1500 },
};

function boundedRandom(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
        consumerTypeId: config.consumerType.id,
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

      const responseText = result.text;
      if (responseText !== "[NO_RESPONSE]") {
        const rawParts = responseText
          .split("[BREAK]")
          .map((p) => p.trim())
          .filter((p) => p);
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
      console.error("Error generating response", error);
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

  const renderMessageContent = (text: string) => {
    const scenarioImages = (scenario as any).images || [];
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
                onClick={() => setSelectedImage(imgSrc)}
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
  };

  return (
    <div
      data-module="ketik"
      className="module-clean-app flex flex-col h-full w-full bg-background overflow-hidden relative"
    >
      {/* Premium Header */}
      <div className="module-clean-toolbar px-8 py-6 flex items-center justify-between border-b shrink-0 w-full z-50 relative">
        <div className="flex items-center gap-4 w-1/4">
          {isReviewMode && (
            <button
              onClick={() => onEndSession(messages)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all group"
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
            <div className="module-clean-panel w-12 h-12 rounded-2xl overflow-hidden shrink-0 relative flex items-center justify-center">
              <div className="w-12 h-12 flex items-center justify-center bg-primary/20 text-primary text-lg font-black rounded-2xl">
                {config.identity.name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center w-2/4">
          <h1 className="font-black text-foreground text-xl tracking-tighter truncate max-w-full text-center">
            {config.identity.name}
          </h1>
          <div className="module-clean-panel flex items-center gap-3 mt-1.5 px-4 py-1 rounded-full">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {config.identity.phone}
              </span>
            </div>
            <span className="w-1 h-1 bg-foreground/20 rounded-full"></span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">📍</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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

        <div className="flex items-center justify-end gap-3 w-1/4">
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
                className="module-clean-button-secondary w-12 h-12 flex items-center justify-center hover:text-foreground rounded-2xl transition-all shadow-sm"
                title="Download CSV"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => onEndSession([])}
                className="module-clean-button-secondary w-12 h-12 flex items-center justify-center hover:text-red-500 rounded-2xl transition-all shadow-sm"
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
              className={`px-6 py-2.5 text-white font-black text-[10px] uppercase tracking-widest transition-all rounded-xl shadow-lg flex items-center gap-2
                ${
                  isLoading || isEnding || !authReady
                    ? "bg-red-400 cursor-not-allowed opacity-80"
                    : "bg-red-500 hover:bg-red-600 shadow-red-500/20 active:scale-95"
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
                        {renderMessageContent(msg.text)}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            }

            const isAgent = msg.sender === "agent";

            return (
              <motion.div
                key={msg.id}
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
                    {renderMessageContent(msg.text)}
                  </div>
                  <div
                    className={`text-[9px] font-black uppercase tracking-widest flex items-center justify-end gap-2 mt-2 ${isAgent ? "text-white/80" : "text-muted-foreground"}`}
                  >
                    <span>
                      {msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                    {isAgent && <TickIcon status={msg.status} />}
                  </div>
                </div>
              </motion.div>
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
        <div className="module-clean-toolbar p-6 border-t z-40 shrink-0 relative">
          <div className="absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />

          <div className="flex justify-center mb-6">
            <button
              onClick={isMaintenanceMode ? applyMaintenance : applyTemplate}
              className="module-clean-button-secondary flex items-center gap-2.5 px-6 py-2.5 rounded-2xl shadow-sm text-[10px] font-black uppercase tracking-widest text-module-ketik transition-all group"
            >
              <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
              <span>
                {isMaintenanceMode
                  ? "Gunakan Maintenance"
                  : "Gunakan Template Salam"}
              </span>
            </button>
          </div>

          <div className="max-w-4xl mx-auto flex items-end gap-4">
            <div className="module-clean-input-shell flex-1 rounded-[2rem] border-2 flex flex-col px-6 py-2.5 focus-within:border-module-ketik transition-all shadow-inner">
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
                          className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex flex-col gap-0.5 ${
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
              className={`w-14 h-14 rounded-[2rem] flex items-center justify-center transition-all ${
                inputText.trim()
                  ? "module-clean-button-primary text-white"
                  : "bg-foreground/5 text-muted-foreground"
              }`}
            >
              <Send
                className={`w-6 h-6 ${inputText.trim() ? "translate-x-0.5 -translate-y-0.5" : ""}`}
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

      {/* Image Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 cursor-pointer"
            onClick={() => setSelectedImage(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={selectedImage}
              alt="Full preview"
              className="max-w-full max-h-full rounded-xl shadow-2xl"
            />
            <button className="absolute top-6 right-6 bg-gray-800/80 text-white p-2 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
