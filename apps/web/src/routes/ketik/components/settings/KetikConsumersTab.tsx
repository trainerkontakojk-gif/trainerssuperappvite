import { ArrowLeft, Edit2, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { KetikAppSettings, KetikConsumerType } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import {
  SettingsCardOption,
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "../../../../components/settings/SettingsPrimitives";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeKetikConsumerDraft } from "./ketikDraftNormalizers";

interface KetikConsumersTabProps {
  consumerTypes: KetikConsumerType[];
  activeConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<KetikConsumerType>>;
  setLocalSettings: Dispatch<SetStateAction<KetikAppSettings>>;
}

function difficultyBadgeClass(difficulty: string | undefined): string {
  switch ((difficulty || "Sedang").toLowerCase()) {
    case "mudah":
      return "border-[var(--chart-green)]/30 text-[var(--chart-green)]";
    case "sulit":
      return "border-destructive/30 text-destructive";
    default:
      return "border-[var(--chart-amber)]/30 text-[var(--chart-amber)]";
  }
}

export function KetikConsumersTab({
  consumerTypes,
  activeConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: KetikConsumersTabProps) {
  const handleSelectConsumerType = (id: string) =>
    setLocalSettings((prev) => ({ ...prev, activeConsumerTypeId: id }));

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakteristik ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
        activeConsumerTypeId:
          prev.activeConsumerTypeId === id
            ? "random"
            : prev.activeConsumerTypeId,
      }));
    }
  };

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
            <SettingsField label="Nama Karakter" id="ketik-consumer-name">
              <SettingsInput
                id="ketik-consumer-name"
                value={consumerForm.draft.name || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ name: e.target.value })
                }
                placeholder="Contoh: Pelanggan Marah"
              />
            </SettingsField>
            <SettingsField
              label="Tingkat Kesulitan"
              id="ketik-consumer-difficulty"
            >
              <SettingsSelect
                id="ketik-consumer-difficulty"
                value={consumerForm.draft.difficulty || "Sedang"}
                onChange={(e) =>
                  consumerForm.setDraft({
                    difficulty: e.target
                      .value as KetikConsumerType["difficulty"],
                  })
                }
              >
                <option value="Mudah">Mudah</option>
                <option value="Sedang">Sedang</option>
                <option value="Sulit">Sulit</option>
              </SettingsSelect>
            </SettingsField>
          </div>

          <SettingsField
            label="Deskripsi / AI Prompt"
            id="ketik-consumer-description"
          >
            <SettingsTextarea
              id="ketik-consumer-description"
              rows={4}
              placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
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
          Pilih Karakter Pelanggan
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini
          akan digunakan{" "}
          <span className="font-medium text-foreground">
            untuk semua skenario
          </span>{" "}
          yang aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SettingsCardOption
          isSelected={activeConsumerTypeId === "random"}
          onClick={() => handleSelectConsumerType("random")}
          title="Acak"
        >
          Sistem akan memilih salah satu karakter secara acak setiap kali sesi
          simulasi dimulai.
        </SettingsCardOption>

        {consumerTypes.map((consumer) => (
          <SettingsCardOption
            key={consumer.id}
            isSelected={activeConsumerTypeId === consumer.id}
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
              activeConsumerTypeId === consumer.id ? undefined : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => consumerForm.openEdit(consumer)}
                    aria-label={`Edit karakter ${consumer.name}`}
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
                    aria-label={`Hapus karakter ${consumer.name}`}
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
