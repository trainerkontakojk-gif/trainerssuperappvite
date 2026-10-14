import React, { useState } from "react";
import { Check, Trash2, Plus, ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { PdktConsumerType } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { type PdktAppSettings as AppSettings } from "../../pdktSettings";
import { normalizePdktConsumerDraft } from "./pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "@/components/settings/SettingsPrimitives";

interface PdktConsumersTabProps {
  /** Tempat dialog konfirmasi dirender (wadah dialog Pengaturan). */
  confirmContainer?: HTMLElement | null;
  consumerTypes: PdktConsumerType[];
  globalConsumerTypeId: string;
  setGlobalConsumerTypeId: (val: string) => void;
  consumerForm: ReturnType<typeof useCrudForm<PdktConsumerType>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

/** Nilai `difficulty` tersimpan dalam bahasa Inggris; tampilannya satu peta ini. */
const DIFFICULTY_LABELS: Record<string, string> = {
  Easy: "Mudah",
  Medium: "Sedang",
  Hard: "Sulit",
};

function difficultyLabel(difficulty: string | undefined): string {
  return DIFFICULTY_LABELS[difficulty || "Medium"] ?? DIFFICULTY_LABELS.Medium;
}

/** Baris pilihan karakter: tombol Pilih/Dipakai, keterangan, dan aksi. */
function ConsumerRow({
  title,
  meta,
  description,
  selected,
  onSelect,
  actions,
}: {
  title: string;
  meta?: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 px-4 py-3 transition-colors sm:flex-nowrap",
        selected ? "bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-foreground">{title}</span>
          {meta && <span className="text-xs text-fg2">{meta}</span>}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-1">
        {actions}
        <Button
          type="button"
          variant={selected ? "secondary" : "outline"}
          aria-pressed={selected}
          // Nama tetap; status pilihan diumumkan lewat `aria-pressed`.
          aria-label={`Pakai karakter ${title}`}
          onClick={onSelect}
          className="min-h-11"
        >
          {selected && <Check data-icon="inline-start" />}
          {selected ? "Dipakai" : "Pilih"}
        </Button>
      </span>
    </li>
  );
}

export function PdktConsumersTab({
  confirmContainer,
  consumerTypes,
  globalConsumerTypeId,
  setGlobalConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: PdktConsumersTabProps) {
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: "discard" } | { kind: "delete"; id: string } | null
  >(null);

  const deleteConsumer = (id: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
    }));
    if (globalConsumerTypeId === id) {
      setGlobalConsumerTypeId("random");
    }
  };

  const handleSaveConsumer = () => {
    if (!consumerForm.draft.name || !consumerForm.draft.description) return;

    const normalizedDraft = normalizePdktConsumerDraft(consumerForm.draft);

    setLocalSettings((prev) => ({
      ...prev,
      consumerTypes: consumerForm.save(prev.consumerTypes, normalizedDraft),
    }));

    consumerForm.close();
  };

  const handleCancelConsumerForm = () => {
    if (consumerForm.isDirty(consumerTypes)) {
      setPendingConfirm({ kind: "discard" });
      return;
    }
    consumerForm.close();
  };

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "delete") deleteConsumer(pendingConfirm.id);
    else consumerForm.close();
    setPendingConfirm(null);
  };

  const confirmDialog = (
    <ConfirmDialog
      open={pendingConfirm !== null}
      container={confirmContainer}
      {...(pendingConfirm?.kind === "discard"
        ? {
            title: "Buang perubahan karakter?",
            description: "Perubahan yang belum diterapkan akan hilang.",
            cancelLabel: "Lanjut mengubah",
            confirmLabel: "Buang perubahan",
          }
        : {
            title: "Hapus karakter ini?",
            description: "Perubahan berlaku setelah Anda memilih Simpan.",
            confirmLabel: "Hapus karakter",
          })}
      onConfirm={confirmPending}
      onCancel={() => setPendingConfirm(null)}
    />
  );

  if (consumerForm.isOpen) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {consumerForm.editingId ? "Ubah karakter" : "Karakter baru"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelConsumerForm}
            className="min-h-11 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <SettingsField label="Nama karakter" id="consumer-name">
            <SettingsInput
              id="consumer-name"
              type="text"
              placeholder="Contoh: Konsumen yang menuntut jawaban cepat"
              value={consumerForm.draft.name || ""}
              onChange={(e) => consumerForm.setDraft({ name: e.target.value })}
            />
          </SettingsField>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField label="Tingkat kesulitan" id="consumer-difficulty">
              <SettingsSelect
                id="consumer-difficulty"
                value={consumerForm.draft.difficulty || "Medium"}
                onChange={(e) =>
                  consumerForm.setDraft({
                    difficulty: e.target
                      .value as PdktConsumerType["difficulty"],
                  })
                }
              >
                <option value="Easy">Mudah: konsumen sopan</option>
                <option value="Medium">Sedang: nada netral</option>
                <option value="Hard">Sulit: marah atau kritis</option>
              </SettingsSelect>
            </SettingsField>

            <SettingsField
              label="Gaya bicara"
              id="consumer-tone"
              helperText="Kata kunci gaya bahasa, misalnya ketus atau menuntut."
            >
              <SettingsInput
                id="consumer-tone"
                type="text"
                placeholder="Contoh: ketus, menuntut"
                value={consumerForm.draft.tone || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ tone: e.target.value })
                }
              />
            </SettingsField>
          </div>

          <SettingsField
            label="Deskripsi karakter"
            id="consumer-description"
            helperText="Jelaskan perilaku karakter ini agar AI dapat menirunya."
          >
            <SettingsTextarea
              id="consumer-description"
              rows={4}
              placeholder="Contoh: Menuntut jawaban cepat, sering menyela, dan memakai huruf kapital."
              value={consumerForm.draft.description || ""}
              onChange={(e) =>
                consumerForm.setDraft({ description: e.target.value })
              }
            />
          </SettingsField>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelConsumerForm}
            className="min-h-11"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveConsumer}
            disabled={
              !consumerForm.draft.name || !consumerForm.draft.description
            }
            className="min-h-11"
          >
            Simpan
          </Button>
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Karakter konsumen
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Sifat dan gaya bicara konsumen yang menulis email. Berlaku untuk
            semua skenario. Pilih{" "}
            <span className="font-medium text-foreground">Acak</span> agar
            peserta tidak bisa menebak karakter berikutnya.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => consumerForm.openAdd()}
          className="min-h-11 shrink-0"
        >
          <Plus data-icon="inline-start" />
          Karakter baru
        </Button>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        <ConsumerRow
          title="Acak"
          description="Karakter dipilih acak di setiap sesi."
          selected={globalConsumerTypeId === "random"}
          onSelect={() => setGlobalConsumerTypeId("random")}
        />
        {consumerTypes.map((consumer) => (
          <ConsumerRow
            key={consumer.id}
            title={consumer.name}
            meta={difficultyLabel(consumer.difficulty)}
            description={consumer.description}
            selected={globalConsumerTypeId === consumer.id}
            onSelect={() => setGlobalConsumerTypeId(consumer.id)}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => consumerForm.openEdit(consumer)}
                  aria-label={`Ubah ${consumer.name}`}
                  className="min-h-11"
                >
                  Ubah
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={() =>
                    setPendingConfirm({ kind: "delete", id: consumer.id })
                  }
                  aria-label={`Hapus ${consumer.name}`}
                  title="Hapus"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 data-icon="inline" />
                </Button>
              </>
            }
          />
        ))}
      </ul>
      {confirmDialog}
    </div>
  );
}
