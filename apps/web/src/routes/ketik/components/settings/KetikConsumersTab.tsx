import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { KetikAppSettings, KetikConsumerType } from "@trainers/types";
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
import { normalizeKetikConsumerDraft } from "./ketikDraftNormalizers";

interface KetikConsumersTabProps {
  /** Tempat dialog konfirmasi dirender (wadah dialog Pengaturan). */
  confirmContainer?: HTMLElement | null;
  consumerTypes: KetikConsumerType[];
  activeConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<KetikConsumerType>>;
  setLocalSettings: Dispatch<SetStateAction<KetikAppSettings>>;
}

export function KetikConsumersTab({
  confirmContainer,
  consumerTypes,
  activeConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: KetikConsumersTabProps) {
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: "discard" } | { kind: "delete"; id: string } | null
  >(null);

  const handleSelectConsumerType = (id: string) =>
    setLocalSettings((prev) => ({ ...prev, activeConsumerTypeId: id }));

  const deleteConsumer = (id: string) =>
    setLocalSettings((prev) => ({
      ...prev,
      consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
      activeConsumerTypeId:
        prev.activeConsumerTypeId === id ? "random" : prev.activeConsumerTypeId,
    }));

  const handleSaveConsumer = () => {
    if (!consumerForm.draft.name || !consumerForm.draft.description) return;

    const normalizedDraft = normalizeKetikConsumerDraft(consumerForm.draft);
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
            <SettingsField label="Nama karakter" id="ketik-consumer-name">
              <SettingsInput
                id="ketik-consumer-name"
                value={consumerForm.draft.name || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ name: e.target.value })
                }
                placeholder="Contoh: Konsumen yang menuntut jawaban cepat"
              />
            </SettingsField>
            <SettingsField
              label="Tingkat kesulitan"
              id="ketik-consumer-difficulty"
            >
              <SettingsSelect
                id="ketik-consumer-difficulty"
                className="min-h-[44px]"
                value={consumerForm.draft.difficulty || "Sedang"}
                onChange={(e) =>
                  consumerForm.setDraft({
                    difficulty: e.target
                      .value as KetikConsumerType["difficulty"],
                  })
                }
              >
                <option value="Mudah">Mudah: konsumen sopan</option>
                <option value="Sedang">Sedang: nada netral</option>
                <option value="Sulit">Sulit: marah atau kritis</option>
              </SettingsSelect>
            </SettingsField>
          </div>

          <SettingsField
            label="Deskripsi karakter"
            id="ketik-consumer-description"
            helperText="Jelaskan perilaku karakter ini agar AI dapat menirunya."
          >
            <SettingsTextarea
              id="ketik-consumer-description"
              rows={4}
              placeholder="Contoh: Membalas singkat, sering menyela, dan memakai huruf kapital saat kesal."
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
            Sifat dan gaya bicara konsumen di chat. Berlaku untuk semua
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
          description="Karakter dipilih acak di setiap sesi."
          selected={activeConsumerTypeId === "random"}
          onSelect={() => handleSelectConsumerType("random")}
        />
        {consumerTypes.map((consumer) => (
          <SettingsChoiceRow
            key={consumer.id}
            title={consumer.name}
            meta={consumer.difficulty}
            description={consumer.description}
            selected={activeConsumerTypeId === consumer.id}
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
      {confirmDialog}
    </div>
  );
}
