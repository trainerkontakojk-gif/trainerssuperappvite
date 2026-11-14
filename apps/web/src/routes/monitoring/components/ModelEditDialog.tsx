import { useState } from "react";
import { AiModelPolicyItem } from "@trainers/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";

interface ModelEditDialogProps {
  policy: AiModelPolicyItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (task: string, modelId: string) => Promise<void>;
  onNavigateToPricing: () => void;
  busy: boolean;
}

export function ModelEditDialog({
  policy,
  open,
  onOpenChange,
  onSave,
  onNavigateToPricing,
  busy,
}: ModelEditDialogProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // Initialize selected model whenever dialog opens for a policy
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && policy) {
      setSelectedModelId(policy.modelId);
    }
    onOpenChange(isOpen);
  };

  if (!policy) return null;

  const currentSelected = selectedModelId || policy.modelId;
  const isChanged = currentSelected !== policy.modelId;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Ubah Model: {policy.label}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {policy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pilih Model yang Tersedia
          </p>

          <div
            role="radiogroup"
            aria-label="Pilih model AI"
            className="space-y-2.5"
          >
            {policy.eligible.map((model) => {
              const hasPricing = model.hasPricing;
              const isSelected = currentSelected === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => {
                    if (hasPricing) setSelectedModelId(model.id);
                  }}
                  className={`flex items-start justify-between rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40"
                  } ${hasPricing ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      id={`model-option-${model.id}`}
                      name="model-selection"
                      checked={isSelected}
                      disabled={!hasPricing}
                      onChange={() => setSelectedModelId(model.id)}
                      className="mt-1 h-4 w-4 cursor-pointer text-primary focus:ring-primary"
                    />
                    <div>
                      <label
                        htmlFor={`model-option-${model.id}`}
                        className={`text-sm font-medium ${
                          hasPricing ? "cursor-pointer" : "cursor-not-allowed"
                        }`}
                      >
                        {model.name}
                      </label>
                      <p className="font-mono text-xs text-muted-foreground">
                        {model.id} • {model.provider}
                      </p>
                      {!hasPricing && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                          Belum ada harga aktif.{" "}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenChange(false);
                              onNavigateToPricing();
                            }}
                            className="underline hover:text-amber-700"
                          >
                            Atur harga dulu
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                  {model.id === policy.codeDefault && (
                    <Badge variant="outline" className="text-[10px]">
                      Bawaan Kode
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <strong>Catatan:</strong> Perubahan berlaku untuk pemanggilan AI
            baru. Unit kerja atau proses yang sedang berjalan tidak akan
            terpengaruh.
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={!isChanged || busy}
            onClick={() => onSave(policy.task, currentSelected)}
          >
            {busy ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
