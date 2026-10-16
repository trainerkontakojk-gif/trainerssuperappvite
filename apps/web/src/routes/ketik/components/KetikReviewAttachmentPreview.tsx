import { useState, type RefObject } from "react";
import { X } from "lucide-react";
import type { KetikHistoryAttachment } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../../components/ui/dialog";

function PreviewImage({ attachment }: { attachment: KetikHistoryAttachment }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return failed ? (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p>Gambar lampiran tidak dapat dimuat.</p>
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px]"
        onClick={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
      >
        Coba muat lagi
      </Button>
    </div>
  ) : (
    <img
      key={attempt}
      src={attachment.src}
      alt={attachment.alt}
      onError={() => setFailed(true)}
      className="max-h-[70dvh] w-full object-contain"
    />
  );
}

export function KetikReviewAttachmentPreview({
  attachment,
  onClose,
  container,
  trigger,
}: {
  attachment: KetikHistoryAttachment | null;
  onClose: () => void;
  container: HTMLElement | null;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Dialog
      open={attachment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        container={container}
        finalFocus={trigger}
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <DialogTitle>
              Lampiran {attachment ? attachment.index + 1 : ""}
            </DialogTitle>
            <DialogDescription className="break-words">
              {attachment?.alt}
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                variant="ghost"
                className="min-h-[44px] min-w-[44px] shrink-0"
                aria-label="Tutup lampiran"
              />
            }
          >
            <X data-icon="inline-start" />
          </DialogClose>
        </div>
        {attachment && (
          <PreviewImage key={attachment.index} attachment={attachment} />
        )}
      </DialogContent>
    </Dialog>
  );
}
