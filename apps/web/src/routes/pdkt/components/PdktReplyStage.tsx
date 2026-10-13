import type { PdktMailboxDetailItem } from "@trainers/types";
import { EmailAttachments } from "./EmailAttachments";
import { EmailBody } from "./EmailDetailPane";
import { ReplyComposer } from "./ReplyComposer";
import { formatPdktEmailDate, readInboundEmail } from "../utils/emailDisplay";

interface Props {
  item: PdktMailboxDetailItem;
  onSend: (text: string) => Promise<boolean>;
  isSending: boolean;
}

/** Tahap Tanggapi: email konsumen di kiri, editor balasan di kanan. */
export function PdktReplyStage({ item, onSend, isSending }: Props) {
  const inbound = readInboundEmail(item);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section
        aria-label="Email konsumen"
        className="flex shrink-0 flex-col gap-4 overflow-y-auto border-b border-border bg-background px-4 py-6 max-lg:max-h-[40vh] md:px-6 lg:w-[44%] lg:border-r lg:border-b-0"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground">
            Email konsumen
          </h2>
          <span className="text-xs text-muted-foreground">
            {formatPdktEmailDate(item.created_at)}
          </span>
        </div>
        <p className="font-display text-lg leading-6 font-bold tracking-tight text-balance">
          {item.subject || "(Tanpa subjek)"}
        </p>
        <p className="text-xs text-muted-foreground">
          Dari{" "}
          <strong className="font-semibold text-foreground">
            {item.sender_name}
          </strong>{" "}
          · {item.sender_email}
        </p>
        <EmailBody
          body={inbound.body}
          className="flex flex-col gap-3 text-sm leading-6 text-foreground"
        />
        <EmailAttachments attachments={inbound.attachments} size="compact" />
      </section>

      <ReplyComposer
        key={item.id}
        mailboxId={item.id}
        recipient={item.sender_email}
        subject={`Re: ${item.subject}`}
        onSend={onSend}
        isLoading={isSending}
      />
    </div>
  );
}
