import React from "react";
import { Edit2, Trash2, Plus, ArrowLeft } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { PdktConsumerType } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { type PdktAppSettings as AppSettings } from "../../pdktSettings";
import { normalizePdktConsumerDraft } from "./pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
  SettingsCardOption,
} from "./SettingsPrimitives";

interface PdktConsumersTabProps {
  consumerTypes: PdktConsumerType[];
  globalConsumerTypeId: string;
  setGlobalConsumerTypeId: (val: string) => void;
  consumerForm: ReturnType<typeof useCrudForm<PdktConsumerType>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

function difficultyBadgeClass(difficulty: string | undefined): string {
  switch ((difficulty || "Medium").toLowerCase()) {
    case "easy":
      return "border-[var(--chart-green)]/30 text-[var(--chart-green)]";
    case "hard":
      return "border-destructive/30 text-destructive";
    default:
      return "border-[var(--chart-amber)]/30 text-[var(--chart-amber)]";
  }
}

export function PdktConsumersTab({
  consumerTypes,
  globalConsumerTypeId,
  setGlobalConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: PdktConsumersTabProps) {
  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakter konsumen ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
      }));
      if (globalConsumerTypeId === id) {
        setGlobalConsumerTypeId("random");
      }
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
      if (!window.confirm("Karakter belum disimpan. Buang perubahan?")) return;
    }
    consumerForm.close();
  };

  if (consumerForm.isOpen) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {consumerForm.editingId ? "Edit Karakter" : "Tambah Karakter Baru"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelConsumerForm}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <SettingsField label="Nama Karakter" id="consumer-name">
            <SettingsInput
              id="consumer-name"
              type="text"
              placeholder="Contoh: Konsumen Milenial Galak"
              value={consumerForm.draft.name || ""}
              onChange={(e) => consumerForm.setDraft({ name: e.target.value })}
            />
          </SettingsField>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField label="Tingkat Kesulitan" id="consumer-difficulty">
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
                <option value="Easy">Mudah (Sopan)</option>
                <option value="Medium">Menengah (Netral)</option>
                <option value="Hard">Sulit (Marah/Kritis)</option>
              </SettingsSelect>
            </SettingsField>

            <SettingsField
              label="Tone Bicara / Keyword"
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
            label="Deskripsi Karakteristik"
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
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveConsumer}
            disabled={
              !consumerForm.draft.name || !consumerForm.draft.description
            }
          >
            Simpan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Karakter Konsumen
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Karakter aktif dipakai untuk{" "}
          <span className="font-medium text-foreground">semua skenario</span>{" "}
          PDKT. Pilih <span className="font-medium text-foreground">Acak</span>{" "}
          agar sistem memilih karakter berbeda setiap sesi.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SettingsCardOption
          isSelected={globalConsumerTypeId === "random"}
          onClick={() => setGlobalConsumerTypeId("random")}
          title="Acak (Random)"
        >
          Sistem memilih tipe konsumen secara acak untuk setiap sesi simulasi.
        </SettingsCardOption>

        {consumerTypes.map((consumer) => (
          <SettingsCardOption
            key={consumer.id}
            isSelected={globalConsumerTypeId === consumer.id}
            onClick={() => setGlobalConsumerTypeId(consumer.id)}
            title={consumer.name}
            badge={
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium ${difficultyBadgeClass(consumer.difficulty)}`}
              >
                {consumer.difficulty}
              </span>
            }
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => consumerForm.openEdit(consumer)}
                  title="Edit"
                  aria-label={`Edit ${consumer.name}`}
                >
                  <Edit2 data-icon="inline-start" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteConsumer(consumer.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Hapus"
                  aria-label={`Hapus ${consumer.name}`}
                >
                  <Trash2 data-icon="inline-start" />
                  Hapus
                </Button>
              </>
            }
          >
            {consumer.description}
          </SettingsCardOption>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => consumerForm.openAdd()}
        className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
      >
        <Plus data-icon="inline" />
        <span className="text-sm font-medium">Buat Karakteristik Baru</span>
      </Button>
    </div>
  );
}
