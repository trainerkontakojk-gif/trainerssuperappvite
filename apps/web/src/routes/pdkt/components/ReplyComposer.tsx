import { useEffect, useId, useReducer, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { PDKT_NO_SUBJECT } from "../utils/emailDisplay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

interface ReplyComposerProps {
  mailboxId: string;
  recipient: string;
  subject: string;
  /** Mengirim balasan; `true` bila berhasil sehingga draf boleh dibuang. */
  onSend: (text: string) => Promise<boolean> | void;
  isLoading: boolean;
}

function readDraft(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, text: string) {
  try {
    if (text.trim()) {
      localStorage.setItem(key, text);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Penyimpanan penuh atau diblokir: draf hanya hilang dari perangkat ini.
  }
}

type ReplyPhase = "editing" | "confirming" | "sending" | "failed" | "sent";
type ReplyAction = "confirm" | "cancel" | "send" | "fail" | "sent";
function replyReducer(phase: ReplyPhase, action: ReplyAction): ReplyPhase {
  switch (action) {
    case "confirm":
      return phase === "sending" || phase === "sent" ? phase : "confirming";
    case "cancel":
      return phase === "confirming" ? "editing" : phase;
    case "send":
      return phase === "confirming" ? "sending" : phase;
    case "fail":
      return phase === "sending" ? "failed" : phase;
    case "sent":
      return phase === "sending" ? "sent" : phase;
  }
}

/** Tahap Tanggapi: menulis balasan. Draf tersimpan per email di perangkat ini. */
export function ReplyComposer({
  mailboxId,
  recipient,
  subject,
  onSend,
  isLoading,
}: ReplyComposerProps) {
  const draftKey = `pdkt_draft_${mailboxId}`;
  const textareaId = useId();
  const [replyText, setReplyText] = useState(() => readDraft(draftKey));
  const [phase, dispatch] = useReducer(replyReducer, "editing");
  const confirmOpen = phase === "confirming";
  const sendInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Ruang kerja PDKT adalah lapisan `fixed z-[100]`; dialog dirender di
  // dalamnya supaya tidak tertutup editor.
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const latestTextRef = useRef(replyText);
  const sentRef = useRef(false);

  useEffect(() => {
    latestTextRef.current = replyText;
    const timer = setTimeout(() => writeDraft(draftKey, replyText), 500);
    return () => clearTimeout(timer);
  }, [replyText, draftKey]);

  // Kembali ke kotak masuk sebelum jeda simpan selesai tidak membuang ketikan terakhir.
  useEffect(
    () => () => {
      if (!sentRef.current) writeDraft(draftKey, latestTextRef.current);
    },
    [draftKey],
  );

  const words = replyText.trim() ? replyText.trim().split(/\s+/).length : 0;
  const sending = isLoading || phase === "sending";
  const canSend = replyText.trim().length > 0 && !sending && phase !== "sent";

  const send = async () => {
    if (sendInFlight.current || !canSend || phase !== "confirming") return;
    const submittedText = replyText;
    sendInFlight.current = true;
    dispatch("send");
    // A pending request is not an acknowledged send. Persist before awaiting.
    writeDraft(draftKey, submittedText);
    try {
      const ok = await onSend(submittedText);
      if (ok === false) {
        if (mounted.current) dispatch("fail");
        return;
      }
      sentRef.current = true;
      // A late success must not delete a different draft typed after reopening.
      if (readDraft(draftKey) === submittedText) writeDraft(draftKey, "");
      if (mounted.current) {
        latestTextRef.current = "";
        setReplyText("");
        dispatch("sent");
      }
    } catch {
      // Rejection and a false result both preserve the draft for retry.
      if (mounted.current) dispatch("fail");
    } finally {
      sendInFlight.current = false;
    }
  };

  return (
    <section
      aria-label="Tulis balasan"
      aria-busy={sending}
      className="flex min-h-0 flex-1 flex-col bg-surface-elevated"
    >
      <dl className="flex shrink-0 flex-col gap-1.5 border-b border-border px-4 py-3 text-[12px] md:px-6">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-muted-foreground">Kepada</dt>
          <dd className="truncate font-medium text-foreground">{recipient}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-muted-foreground">Subjek</dt>
          <dd className="truncate font-medium text-foreground">
            {subject || PDKT_NO_SUBJECT}
          </dd>
        </div>
      </dl>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-4 md:px-6">
        <label
          htmlFor={textareaId}
          className="text-xs font-semibold text-foreground"
        >
          Balasan Anda
        </label>
        <Textarea
          id={textareaId}
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          readOnly={sending}
          className="min-h-64 flex-1 resize-none bg-background p-4 text-[15px] leading-[26px]"
          autoFocus
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <span className="text-xs text-muted-foreground">
          Draf disimpan di perangkat ini · {words} kata · {replyText.length}{" "}
          karakter
        </span>
        <Button
          type="button"
          onClick={() => dispatch("confirm")}
          disabled={!canSend}
          className="min-h-[44px] gap-2 px-5 text-[13px] font-semibold"
        >
          {sending ? (
            <>
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              Mengirim…
            </>
          ) : (
            <>
              <Send aria-hidden="true" />
              Kirim balasan
            </>
          )}
        </Button>
      </div>

      <div ref={setDialogContainer} className="contents" />
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => dispatch(open ? "confirm" : "cancel")}
      >
        <DialogContent
          container={dialogContainer}
          showCloseButton={false}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Kirim balasan sekarang?
            </DialogTitle>
            <DialogDescription>
              Setelah dikirim, balasan tidak bisa diubah dan langsung ditelaah
              AI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch("cancel")}
              className="min-h-[44px]"
            >
              Periksa lagi
            </Button>
            <Button
              type="button"
              onClick={() => void send()}
              className="min-h-[44px]"
            >
              Kirim balasan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
