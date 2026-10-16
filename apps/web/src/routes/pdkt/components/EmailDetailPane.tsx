import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import type { PdktMailboxDetailItem } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { EmailAttachments } from "./EmailAttachments";
import { PdktStageNav } from "./PdktStageNav";
import type { MailboxReviewState } from "./MailboxSidebar";
import {
  PDKT_NO_SUBJECT,
  formatPdktEmailDate,
  getPdktInitials,
  readInboundEmail,
} from "../utils/emailDisplay";

interface EmailDetailPaneProps {
  item: PdktMailboxDetailItem;
  onReply: () => void;
  onDelete?: () => void;
  onOpenReview?: () => void;
  reviewStatus?: MailboxReviewState["status"] | null;
  /** Tombol kembali ke daftar email di layar sempit. */
  onBackToList?: () => void;
}

/** Isi email dipecah per paragraf kosong supaya jarak baca tetap lega. */
export function EmailBody({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {body
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-wrap">
            {paragraph.trim()}
          </p>
        ))}
    </div>
  );
}

/** Tahap Pahami: membaca email konsumen; untuk email dibalas, pintu ke Telaah. */
export function EmailDetailPane({
  item,
  onReply,
  onDelete,
  onOpenReview,
  reviewStatus,
  onBackToList,
}: EmailDetailPaneProps) {
  const inbound = readInboundEmail(item);
  const canDelete = item.permissions?.can_delete !== false;

  return (
    <section
      aria-label="Detail email"
      className="flex h-full min-w-0 flex-1 flex-col bg-surface-elevated text-foreground"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        {onBackToList && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBackToList}
            className="-ml-2 min-h-[44px] min-w-[44px] md:hidden"
            aria-label="Kembali ke daftar email"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        )}
        <PdktStageNav
          current="pahami"
          completed={item.status === "replied" ? ["tanggapi"] : undefined}
          onSelect={
            item.status === "replied"
              ? { telaah: onOpenReview }
              : { tanggapi: onReply }
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8 md:px-6">
        <article className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
          <header className="flex flex-col gap-4">
            <h2
              className={
                item.subject
                  ? "font-display text-2xl leading-8 font-bold tracking-tight text-balance"
                  : "text-2xl leading-8 text-muted-foreground italic"
              }
            >
              {item.subject || PDKT_NO_SUBJECT}
            </h2>
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
              >
                {getPdktInitials(item.sender_name)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">
                  {item.sender_name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.sender_email}
                </span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatPdktEmailDate(item.created_at)}
              </span>
            </div>
          </header>

          <EmailBody
            body={inbound.body}
            className="flex max-w-[68ch] flex-col gap-3.5 text-[15px] leading-[26px]"
          />

          <EmailAttachments attachments={inbound.attachments} />
        </article>
      </div>

      {item.status === "open" && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 md:px-6">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={!canDelete}
              aria-describedby={canDelete ? undefined : "pdkt-delete-hint"}
              className="min-h-[44px] gap-2 px-3 text-xs"
            >
              <Trash2 aria-hidden="true" className="text-destructive" />
              Hapus email
            </Button>
            {!canDelete && (
              <span id="pdkt-delete-hint" className="text-xs text-fg2">
                Hanya pembuat email, admin, atau trainer yang bisa menghapus.
              </span>
            )}
          </span>
          <Button
            type="button"
            onClick={onReply}
            className="min-h-[44px] gap-2 px-5 text-[13px] font-semibold"
          >
            Tulis balasan
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      )}
      {item.status === "replied" && onOpenReview && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 md:px-6">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="min-h-[44px] gap-2 px-3 text-xs"
            >
              <Trash2 aria-hidden="true" className="text-destructive" />
              Hapus email
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span role="status" className="text-xs text-fg2">
              {reviewStatus === "completed"
                ? "Telaah siap"
                : reviewStatus === "failed"
                  ? "Telaah gagal"
                  : reviewStatus === "unavailable"
                    ? "Telaah sudah dihapus"
                    : reviewStatus === "not_started"
                      ? "Belum ditelaah"
                      : "Sedang ditelaah AI"}
            </span>
            <Button
              type="button"
              onClick={onOpenReview}
              className="min-h-[44px] gap-2 px-5 text-[13px] font-semibold"
            >
              Lihat telaah
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
