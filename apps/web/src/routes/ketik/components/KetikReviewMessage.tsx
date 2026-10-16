import { useState } from "react";
import type { KetikHistoryAttachment } from "@trainers/types";
import type { QuoteMark } from "../../../components/simulation/quoteMarks";
import { IMAGE_TAG_PATTERN, stripSystemTags } from "../lib/message-utils";
import { withQuoteMarks } from "../utils/quoteMarks";

function AttachmentButton({
  attachment,
  onOpen,
}: {
  attachment: KetikHistoryAttachment;
  onOpen: (
    attachment: KetikHistoryAttachment,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Buka lampiran ${attachment.index + 1}: ${attachment.alt}`}
      onClick={(event) => onOpen(attachment, event.currentTarget)}
      className="my-2 flex min-h-[44px] w-full flex-col gap-2 overflow-hidden rounded-lg border border-border bg-background p-2 text-left text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {failed ? (
        <span className="text-[13px] leading-5">
          Gambar tidak dapat dimuat. Buka untuk mencoba lagi.
        </span>
      ) : (
        <img
          src={attachment.src}
          alt={attachment.alt}
          onError={() => setFailed(true)}
          loading="lazy"
          className="max-h-64 w-full rounded-sm object-contain"
        />
      )}
      <span className="text-[13px] leading-5">
        Buka lampiran {attachment.index + 1} · {attachment.alt}
      </span>
    </button>
  );
}

/** Keep text annotations/typos while rendering image markers as attachments. */
export function KetikReviewMessage({
  text,
  attachments,
  marks,
  typoWords,
  onOpen,
}: {
  text: string;
  attachments: readonly KetikHistoryAttachment[];
  marks: readonly QuoteMark[];
  typoWords: readonly string[];
  onOpen: (
    attachment: KetikHistoryAttachment,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const content = stripSystemTags(text).trim();
  if (!content) return <span>(pesan kosong)</span>;
  return content.split(/(\[SEND_IMAGE\s*:\s*\d+\])/gi).map((part, key) => {
    if (IMAGE_TAG_PATTERN.test(part)) {
      const index = Number(part.match(/\d+/)?.[0]);
      const attachment = attachments.find((item) => item.index === index);
      return attachment ? (
        <AttachmentButton
          key={`${key}-${attachment.index}`}
          attachment={attachment}
          onOpen={onOpen}
        />
      ) : (
        <span key={key} className="my-2 block text-[13px] leading-5">
          Lampiran {index + 1} tidak tersedia dalam riwayat sesi ini.
        </span>
      );
    }
    return <span key={key}>{withQuoteMarks(part, marks, typoWords)}</span>;
  });
}
