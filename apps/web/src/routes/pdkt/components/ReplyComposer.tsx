import React, { useState, useEffect, useRef } from "react";
import { Send, X, Loader2, Reply } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";

interface ReplyComposerProps {
  mailboxId: string;
  recipient: string;
  subject: string;
  onSend: (text: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  mailboxId,
  recipient,
  subject,
  onSend,
  onClose,
  isLoading,
}) => {
  const draftKey = `pdkt_draft_${mailboxId}`;
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
    <Card
      className="mx-3 mb-3 overflow-hidden rounded-lg border-border bg-card p-0"
      role="region"
      aria-label="Form balasan email"
      aria-busy={isLoading}
    >
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2">
          <Reply className="w-4 h-4 text-[var(--module-pdkt)]" />
          <span className="text-xs font-semibold text-[var(--fg)]">Balas</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="min-h-11 min-w-11 text-muted-foreground"
          aria-label="Tutup form balasan"
        >
          <X aria-hidden="true" />
        </Button>
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
          <span className="text-[var(--fg3)] w-14 shrink-0 font-medium">
            Cc
          </span>
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

      <Textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        className="min-h-32 resize-none rounded-none border-0 bg-card p-4 text-sm leading-relaxed focus-visible:ring-0 md:min-h-48"
        placeholder="Tulis balasan Anda..."
        aria-label="Isi balasan"
        autoFocus
      />

      <div className="px-4 md:px-6 py-3 flex justify-end items-center border-t border-[var(--border)] bg-[var(--bg)]">
        <Button
          type="button"
          onClick={handleSend}
          disabled={!replyText.trim() || isLoading}
          className="min-h-11 px-5 text-xs"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
              <span>Mengirim...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Kirim</span>
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};
