import React from "react";
import { ArrowLeft, Edit2, Plus, Trash2 } from "lucide-react";
import {
  TelefunAppSettings as AppSettings,
  TelefunConsumerType as ConsumerType,
  ConsumerDifficulty,
} from "../../telefunSettings";
import { Button } from "../../../../components/ui/button";
import {
  SettingsCardOption,
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "../../../../components/settings/SettingsPrimitives";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeTelefunConsumerDraft } from "./telefunDraftNormalizers";

interface TelefunConsumersTabProps {
  consumerTypes: ConsumerType[];
  preferredConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<ConsumerType>>;
  handleSelectConsumerType: (id: string) => void;
  handleDeleteConsumer: (id: string) => void;
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

export const TelefunConsumersTab: React.FC<TelefunConsumersTabProps> = ({
  consumerTypes,
  preferredConsumerTypeId,
  consumerForm,
  handleSelectConsumerType,
  handleDeleteConsumer,
  setLocalSettings,
}) => {
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField
              label="Nama Karakter / Tipe"
              id="telefun-consumer-name"
            >
              <SettingsInput
                id="telefun-consumer-name"
                value={consumerForm.draft.name || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ name: e.target.value })
                }
                placeholder="Contoh: Pelanggan Marah"
              />
            </SettingsField>

            <SettingsField
              label="Tingkat Kesulitan"
              id="telefun-consumer-difficulty"
            >
              <SettingsSelect
                id="telefun-consumer-difficulty"
                value={
                  consumerForm.draft.difficulty || ConsumerDifficulty.Medium
                }
                onChange={(e) =>
                  consumerForm.setDraft({
                    difficulty: e.target.value as ConsumerType["difficulty"],
                  })
                }
              >
                <option value={ConsumerDifficulty.Easy}>Mudah</option>
                <option value={ConsumerDifficulty.Medium}>Sedang</option>
                <option value={ConsumerDifficulty.Hard}>Sulit</option>
              </SettingsSelect>
            </SettingsField>
          </div>

          <SettingsField
            label="Deskripsi / Prompt AI"
            id="telefun-consumer-description"
          >
            <SettingsTextarea
              id="telefun-consumer-description"
              rows={4}
              value={consumerForm.draft.description || ""}
              onChange={(e) =>
                consumerForm.setDraft({ description: e.target.value })
              }
              placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
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
          Tips Simulasi
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pilih tipe konsumen yang akan disimulasikan. Variasi tingkat kesulitan
          akan mempengaruhi gaya bahasa dan respons AI. Pilih Acak untuk
          tantangan yang berbeda setiap saat.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SettingsCardOption
          isSelected={preferredConsumerTypeId === "random"}
          onClick={() => handleSelectConsumerType("random")}
          title="Acak (Random)"
        >
          Sistem akan memilih salah satu karakter secara acak setiap kali sesi
          simulasi dimulai.
        </SettingsCardOption>

        {consumerTypes.map((consumer) => {
          const isSelected = preferredConsumerTypeId === consumer.id;
          return (
            <SettingsCardOption
              key={consumer.id}
              isSelected={isSelected}
              onClick={() => handleSelectConsumerType(consumer.id)}
              title={consumer.name}
              badge={
                <span
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium ${difficultyBadgeClass(consumer.difficulty)}`}
                >
                  {consumer.difficulty}
                </span>
              }
              actions={
                isSelected ? undefined : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => consumerForm.openEdit(consumer)}
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
                      aria-label={`Hapus ${consumer.name}`}
                    >
                      <Trash2 data-icon="inline-start" />
                      Hapus
                    </Button>
                  </>
                )
              }
            >
              {consumer.description}
            </SettingsCardOption>
          );
        })}
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
};
