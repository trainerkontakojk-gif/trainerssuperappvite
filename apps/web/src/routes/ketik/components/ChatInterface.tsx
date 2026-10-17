import { useState, useEffect, useRef } from "react";
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
import type { KetikQuickTemplate, KetikServerSession } from "@trainers/types";
import { KETIK_PROMPT_LIMITS } from "@trainers/types";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useServerKetikChat } from "../hooks/useServerKetikChat";
import { getKetikConsumerAvatarUrl } from "../lib/ketik-avatar";
import {
  IMAGE_TAG_PATTERN,
  IMAGE_TAG_PATTERN_GLOBAL,
} from "../lib/message-utils";
import {
  KetikMessageBubble,
  renderKetikMessageContent,
} from "./chat/KetikMessageBubble";
import { KetikImageLightbox } from "./chat/KetikImageLightbox";
import {
  getKetikScenarioImages,
  getKetikScenarioImageAlts,
} from "./chat/ketikScenarioImages";

/** Counts simulation time up from the server start; stops when the chat ends. */
function SimulationTimer({
  startedAt,
  expiresAt,
  running,
}: {
  startedAt: string;
  expiresAt: string;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // One last reading when the chat stops, then the value stays frozen.
    setNow(Date.now());
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  const start = Date.parse(startedAt);
  const seconds = Math.max(
    0,
    Math.floor((Math.min(now, Date.parse(expiresAt)) - start) / 1000),
  );
  const label = [Math.floor(seconds / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return (
    <span
      role="timer"
      aria-label="Durasi simulasi"
      className="shrink-0 rounded-md bg-muted px-2 py-1 text-[13px] font-medium tabular-nums text-muted-foreground"
    >
      {label}
    </span>
  );
}

interface ChatInterfaceProps {
  session: KetikServerSession;
  onEndSession: () => void;
  isEnding?: boolean;
  templates?: KetikQuickTemplate[];
}

export function ChatInterface({
  session,
  onEndSession,
  isEnding = false,
  templates = [],
}: ChatInterfaceProps) {
  const { config, scenario } = session;
  const {
    messages,
    isLoading,
    isConsumerTyping,
    queuedCount,
    error,
    retry,
    send,
    sessionPhase,
  } = useServerKetikChat(session);
  const avatarUrl = getKetikConsumerAvatarUrl(config.identity);
  const [inputText, setInputText] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const charCount = inputText.length;
  const maxChars = KETIK_PROMPT_LIMITS.chatMessageText;
  const isOverLimit = charCount > maxChars;
  const [showTemplatePopup, setShowTemplatePopup] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const templatePopupRef = useRef<HTMLDivElement>(null);
  const filteredTemplates = templates.filter((t) =>
    t.keyword.toLowerCase().includes(templateSearchQuery.toLowerCase()),
  );
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isConsumerTyping]);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
    const slash = inputText.lastIndexOf("/");
    const query = inputText.substring(slash + 1);
    const valid =
      slash >= 0 &&
      (slash === 0 || inputText[slash - 1] === " ") &&
      !query.includes(" ");
    setShowTemplatePopup(valid);
    setTemplateSearchQuery(query);
    setSelectedTemplateIndex(0);
  }, [inputText]);
  useEffect(() => {
    if (!showTemplatePopup) return;
    const close = (event: MouseEvent) => {
      if (
        !templatePopupRef.current?.contains(event.target as Node) &&
        !textareaRef.current?.contains(event.target as Node)
      )
        setShowTemplatePopup(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showTemplatePopup]);
  useEffect(() => {
    if (!queuedCount) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queuedCount]);
  const handleSend = () => {
    if (!inputText.trim() || isOverLimit || sessionPhase !== "active") return;
    if (send(inputText.trim())) setInputText("");
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
    if ((!isLoading || sessionPhase !== "active") && !isEnding) onEndSession();
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
          {avatarUrl && (
            <AvatarImage
              src={avatarUrl}
              alt=""
              className="!rounded-lg"
              referrerPolicy="no-referrer"
            />
          )}
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
        <SimulationTimer
          startedAt={session.startedAt}
          expiresAt={session.expiresAt}
          running={sessionPhase === "active"}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmEnd(true)}
          disabled={(isLoading && sessionPhase === "active") || isEnding}
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
          {isConsumerTyping && (
            <motion.div
              key="consumer-typing"
              layout="position"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-start"
              role="status"
              aria-label="Konsumen sedang mengetik"
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
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={retry}
            disabled={isLoading || sessionPhase !== "active"}
          >
            Coba kirim lagi
          </Button>
        </div>
      )}
      {queuedCount > 1 && (
        <p role="status" className="px-4 py-2 text-sm text-fg2">
          {queuedCount - 1} pesan menunggu dikirim.
        </p>
      )}
      {sessionPhase === "active" ? (
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
            {sessionPhase === "expired"
              ? "Waktu sesi berakhir. Akhiri chat untuk menyimpan percakapan."
              : "Chat telah berakhir"}
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
        description={
          queuedCount
            ? "Hanya pesan yang sudah tersimpan di server yang disertakan. Pesan antrean yang belum terkirim tidak ikut masuk tahap Telaah."
            : "Percakapan disimpan, lalu Anda masuk ke tahap Telaah. Chat yang sudah diakhiri tidak bisa dilanjutkan."
        }
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
