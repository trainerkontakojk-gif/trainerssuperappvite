import React, { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  TelefunAppSettings as AppSettings,
  TelefunConsumerType as ConsumerType,
  ConsumerDifficulty,
} from "../../telefunSettings";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { SettingsChoiceRow } from "../../../../components/settings/SettingsChoices";
import { Button } from "../../../../components/ui/button";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "../../../../components/settings/SettingsPrimitives";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeTelefunConsumerDraft } from "./telefunDraftNormalizers";

interface TelefunConsumersTabProps {
  /** Tempat dialog konfirmasi dirender (wadah dialog Pengaturan). */
  confirmContainer?: HTMLElement | null;
  consumerTypes: ConsumerType[];
  preferredConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<ConsumerType>>;
  handleSelectConsumerType: (id: string) => void;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const DIFFICULTY_LABEL: Record<ConsumerDifficulty, string> = {
  [ConsumerDifficulty.Easy]: "Mudah",
  [ConsumerDifficulty.Medium]: "Sedang",
  [ConsumerDifficulty.Hard]: "Sulit",
  [ConsumerDifficulty.Random]: "Acak",
};

export const TelefunConsumersTab: React.FC<TelefunConsumersTabProps> = ({
  confirmContainer,
  consumerTypes,
  preferredConsumerTypeId,
  consumerForm,
  handleSelectConsumerType,
  setLocalSettings,
}) => {
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: "discard" } | { kind: "delete"; id: string } | null
  >(null);

  // Panggilan butuh persona konsumen; karakter terakhir tidak bisa dihapus.
  const isLastConsumer = consumerTypes.length <= 1;

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "delete") {
      const { id } = pendingConfirm;
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
        preferredConsumerTypeId:
          prev.preferredConsumerTypeId === id
            ? "random"
            : prev.preferredConsumerTypeId,
      }));
    } else {
      consumerForm.close();
    }
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

  const handleSaveConsumer = () => {
    if (!consumerForm.draft.name || !consumerForm.draft.description) return;

    const normalizedDraft = normalizeTelefunConsumerDraft({
      ...consumerForm.draft,
      gender: "random",
    });
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

  if (consumerForm.isOpen) {
    return (
      <div id="consumer-form" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            {consumerForm.editingId ? "Ubah karakter" : "Karakter baru"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelConsumerForm}
            className="min-h-[44px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField label="Nama karakter" id="telefun-consumer-name">
              <SettingsInput
                id="telefun-consumer-name"
                value={consumerForm.draft.name || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ name: e.target.value })
                }
                placeholder="Contoh: Konsumen yang menuntut jawaban cepat"
              />
            </SettingsField>

            <SettingsField
              label="Tingkat kesulitan"
              id="telefun-consumer-difficulty"
            >
              <SettingsSelect
                id="telefun-consumer-difficulty"
                className="min-h-[44px]"
                value={
                  consumerForm.draft.difficulty || ConsumerDifficulty.Medium
                }
                onChange={(e) =>
                  consumerForm.setDraft({
                    difficulty: e.target.value as ConsumerType["difficulty"],
                  })
                }
              >
                <option value={ConsumerDifficulty.Easy}>
                  Mudah: konsumen sopan
                </option>
                <option value={ConsumerDifficulty.Medium}>
                  Sedang: nada netral
                </option>
                <option value={ConsumerDifficulty.Hard}>
                  Sulit: marah atau kritis
                </option>
              </SettingsSelect>
            </SettingsField>
          </div>

          <SettingsField
            label="Deskripsi karakter"
            id="telefun-consumer-description"
            helperText="Jelaskan perilaku karakter ini agar AI dapat menirunya."
          >
            <SettingsTextarea
              id="telefun-consumer-description"
              rows={4}
              value={consumerForm.draft.description || ""}
              onChange={(e) =>
                consumerForm.setDraft({ description: e.target.value })
              }
              placeholder="Contoh: Bicara cepat, sering menyela, dan menaikkan suara saat kesal."
            />
          </SettingsField>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelConsumerForm}
            className="min-h-[44px]"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveConsumer}
            disabled={
              !consumerForm.draft.name || !consumerForm.draft.description
            }
            className="min-h-[44px]"
          >
            Terapkan
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
            Sifat dan gaya bicara konsumen di telepon. Berlaku untuk semua
            skenario. Pilih{" "}
            <span className="font-medium text-foreground">Acak</span> agar
            peserta tidak bisa menebak karakter berikutnya.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => consumerForm.openAdd()}
          className="min-h-[44px] shrink-0"
        >
          <Plus data-icon="inline-start" />
          Karakter baru
        </Button>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        <SettingsChoiceRow
          title="Acak"
          description="Karakter dipilih acak di setiap panggilan."
          selected={preferredConsumerTypeId === "random"}
          onSelect={() => handleSelectConsumerType("random")}
        />
        {consumerTypes.map((consumer) => (
          <SettingsChoiceRow
            key={consumer.id}
            title={consumer.name}
            meta={
              DIFFICULTY_LABEL[consumer.difficulty ?? ConsumerDifficulty.Medium]
            }
            description={consumer.description}
            selected={preferredConsumerTypeId === consumer.id}
            onSelect={() => handleSelectConsumerType(consumer.id)}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => consumerForm.openEdit(consumer)}
                  aria-label={`Ubah ${consumer.name}`}
                  className="min-h-[44px]"
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
                  disabled={isLastConsumer}
                  aria-describedby={
                    isLastConsumer ? "telefun-last-consumer-note" : undefined
                  }
                  aria-label={`Hapus ${consumer.name}`}
                  title="Hapus"
                  className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                >
                  <Trash2 data-icon="inline" />
                </Button>
              </>
            }
          />
        ))}
      </ul>
      {isLastConsumer && (
        <p
          id="telefun-last-consumer-note"
          className="text-[13px] text-muted-foreground"
        >
          Minimal satu karakter konsumen harus ada.
        </p>
      )}
      {confirmDialog}
    </div>
  );
};
