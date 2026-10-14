import React, { useState } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import type { PdktScenario } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Separator } from "../../../components/ui/separator";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty";

interface CreateEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarios: PdktScenario[];
  onCreate: (scenario: PdktScenario) => void;
  isLoading: boolean;
}

export const CreateEmailModal: React.FC<CreateEmailModalProps> = ({
  isOpen,
  onClose,
  scenarios,
  onCreate,
  isLoading,
}) => {
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );

  if (!isOpen) return null;

  const activeScenarios = scenarios.filter((s) => s.isActive);

  return (
    <div ref={setDialogContainer} className="contents">
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          container={dialogContainer}
          aria-labelledby="pdkt-create-email-title"
          aria-busy={isLoading}
          showCloseButton={false}
          className="w-[calc(100vw-2rem)] max-w-lg sm:max-w-lg flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 gap-1 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle
                  id="pdkt-create-email-title"
                  className="text-lg tracking-tight"
                >
                  Buat email baru
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  Pilih skenario. Email konsumen baru masuk ke kotak masuk Anda.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px]"
                aria-label="Tutup"
              >
                <X data-icon="inline" />
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {activeScenarios.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <AlertCircle aria-hidden="true" />
                  <EmptyTitle>Tidak ada skenario aktif</EmptyTitle>
                  <EmptyDescription>
                    Aktifkan minimal satu skenario pada menu Pengaturan sebelum
                    membuat email baru.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {activeScenarios.map((scenario) => {
                  // Email tetap: isi email sama untuk semua peserta. Ringkasannya
                  // disalin dari isi email itu, jadi tidak boleh tampil di sini.
                  const isFixedEmail = Boolean(scenario.alwaysUseSampleEmail);
                  const meta = [
                    scenario.category,
                    isFixedEmail ? "Email tetap" : "Dibuat AI",
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <li key={scenario.id}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onCreate(scenario)}
                        disabled={isLoading}
                        className="h-auto min-h-20 w-full flex-col items-stretch justify-start gap-1.5 whitespace-normal px-4 py-3 text-left"
                      >
                        <span className="truncate text-sm font-medium text-foreground">
                          {scenario.title}
                        </span>
                        <span className="text-xs font-normal text-fg2">
                          {meta}
                        </span>
                        {!isFixedEmail && scenario.description && (
                          <span className="line-clamp-2 text-xs leading-relaxed font-normal text-muted-foreground">
                            {scenario.description}
                          </span>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Separator />
          <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-end rounded-none border-0 bg-card px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="min-h-[44px]"
            >
              Batal
            </Button>
          </DialogFooter>

          {isLoading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-card/80"
              role="status"
              aria-live="polite"
            >
              <Loader2
                aria-hidden="true"
                className="size-6 animate-spin text-module-pdkt motion-reduce:animate-none"
              />
              <span className="text-sm font-medium text-foreground">
                Membuat email konsumen…
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
