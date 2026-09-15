import React, { useState } from "react";
import { Check, FolderInput, Inbox, Loader2 } from "lucide-react";
import { profilerApi } from "../../../../lib/profilerService";
import { notify } from "../../../../lib/toast";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../../../components/ui/empty";

interface MoveFolderModalProps {
  selectedIds: string[];
  currentBatch: string;
  folders: any[];
  years: any[];
  onClose: () => void;
  onMoved: (ids: string[], targetFolder: string) => void;
}

export const MoveFolderModal: React.FC<MoveFolderModalProps> = ({
  selectedIds,
  currentBatch,
  folders,
  years,
  onClose,
  onMoved,
}) => {
  const [targetFolder, setTargetFolder] = useState("");
  const [moving, setMoving] = useState(false);
  const otherFolders = folders.filter((folder) => folder.name !== currentBatch);

  const handleMove = async () => {
    if (!targetFolder) return;
    setMoving(true);
    try {
      await profilerApi.movePesertaToBatch(selectedIds, targetFolder);
      onMoved(selectedIds, targetFolder);
      onClose();
    } catch (err: any) {
      notify.error("Gagal memindahkan: " + err.message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg !flex h-[min(92dvh,52rem)] max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FolderInput className="size-5 text-primary" aria-hidden="true" />
            Pindah folder
          </DialogTitle>
          <DialogDescription>
            {selectedIds.length} peserta terpilih. Pilih folder tujuan.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {otherFolders.length === 0 ? (
            <Empty className="border-0 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Folder tujuan belum tersedia</EmptyTitle>
                <EmptyDescription>
                  Buat folder baru terlebih dahulu untuk memindahkan peserta.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-5">
              {years.map((year) => {
                const rootFolders = otherFolders.filter(
                  (folder) => folder.year_id === year.id && !folder.parent_id,
                );
                if (rootFolders.length === 0) return null;
                return (
                  <section key={year.id} className="grid gap-2">
                    <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {year.label}
                    </h3>
                    <div className="grid gap-2">
                      {rootFolders.map((folder) => {
                        const subFolders = otherFolders.filter(
                          (subFolder) => subFolder.parent_id === folder.id,
                        );
                        return (
                          <React.Fragment key={folder.id}>
                            <Button
                              type="button"
                              variant={
                                targetFolder === folder.name
                                  ? "default"
                                  : "outline"
                              }
                              size="lg"
                              className="min-h-11 justify-between text-left"
                              onClick={() => setTargetFolder(folder.name)}
                            >
                              <span className="flex min-w-0 items-center gap-2 truncate">
                                <Inbox
                                  className="size-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{folder.name}</span>
                              </span>
                              {targetFolder === folder.name ? (
                                <Check aria-hidden="true" />
                              ) : null}
                            </Button>
                            {subFolders.map((subFolder) => (
                              <Button
                                key={subFolder.id}
                                type="button"
                                variant={
                                  targetFolder === subFolder.name
                                    ? "default"
                                    : "outline"
                                }
                                size="lg"
                                className="ml-4 min-h-11 justify-between text-left"
                                onClick={() => setTargetFolder(subFolder.name)}
                              >
                                <span className="flex min-w-0 items-center gap-2 truncate">
                                  <Inbox
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">
                                    {subFolder.name}
                                  </span>
                                </span>
                                {targetFolder === subFolder.name ? (
                                  <Check aria-hidden="true" />
                                ) : null}
                              </Button>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={handleMove}
            disabled={!targetFolder || moving}
          >
            {moving ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {moving ? "Memindahkan..." : "Konfirmasi pemindahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
