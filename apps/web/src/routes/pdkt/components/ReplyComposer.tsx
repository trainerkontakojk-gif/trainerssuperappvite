import React, { useState, useEffect, useRef } from "react";
import { Send, X, Loader2, Reply } from "lucide-react";

interface ReplyComposerProps {
  recipient: string;
  subject: string;
  onSend: (text: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  recipient,
  subject,
  onSend,
  onClose,
  isLoading,
}) => {
  const draftKey = `pdkt_draft_${recipient}_${subject}`;
  const [replyText, setReplyText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) || "";
    } catch {
      return "";
    }
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        if (replyText.trim()) {
          localStorage.setItem(draftKey, replyText);
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch {
        /* storage full */
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [replyText, draftKey]);

  const handleSend = () => {
    if (!replyText.trim() || isLoading) return;
    onSend(replyText);
    setReplyText("");
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* noop */
    }
  };

  const handleClose = () => {
    try {
      if (replyText.trim()) {
        localStorage.setItem(draftKey, replyText);
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {
      /* noop */
    }
    onClose();
  };

  return (
    <div className="mx-3 mb-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2">
          <Reply className="w-4 h-4 text-[var(--module-pdkt)]" />
          <span className="text-xs font-semibold text-[var(--fg)]">
            Balas
          </span>
        </div>
        <button
          onClick={handleClose}
          className="min-w-10 min-h-10 flex items-center justify-center hover:bg-[var(--surface)] rounded-lg transition-all text-[var(--fg2)] hover:text-[var(--fg)]"
          aria-label="Tutup form balasan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 md:px-6 py-2.5 space-y-2 border-b border-[var(--border)] text-xs">
        <div className="flex items-center">
          <span className="text-[var(--fg3)] w-14 shrink-0 font-medium">
            Kepada
          </span>
          <span className="text-[var(--fg)] font-semibold truncate">
            {recipient}
          </span>
        </div>
        <div className="flex items-center">
          <span className="text-[var(--fg3)] w-14 shrink-0 font-medium">Cc</span>
          <span className="text-[var(--fg3)] truncate">-</span>
        </div>
        <div className="flex items-center">
          <span className="text-[var(--fg3)] w-14 shrink-0 font-medium">
            Subjek
          </span>
          <span
            className={
              subject
                ? "text-[var(--fg)] font-semibold truncate"
                : "text-[var(--fg3)] italic truncate"
            }
          >
            {subject || "Tanpa Subjek"}
          </span>
        </div>
      </div>

      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        className="w-full h-32 md:h-48 p-4 outline-none text-[var(--fg)] bg-[var(--surface)] resize-none font-sans text-sm leading-relaxed placeholder:text-[var(--fg3)] focus:bg-[var(--bg)] transition-colors"
        placeholder="Tulis balasan Anda..."
        autoFocus
      />

      <div className="px-4 md:px-6 py-3 flex justify-end items-center border-t border-[var(--border)] bg-[var(--bg)]">
        <button
          onClick={handleSend}
          disabled={!replyText.trim() || isLoading}
          className="bg-[var(--inv-bg)] hover:opacity-90 text-[var(--inv-fg)] min-h-10 px-5 rounded-lg font-semibold text-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Mengirim...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Kirim</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
