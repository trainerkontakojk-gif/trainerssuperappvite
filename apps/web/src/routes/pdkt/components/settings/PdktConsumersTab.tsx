import React from "react";
import { Users, Edit2, Trash2, Plus, X, ArrowLeft } from "lucide-react";
import { PdktConsumerType } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { type PdktAppSettings as AppSettings } from "../../pdktSettings";
import { normalizePdktConsumerDraft } from "./pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsCardOption,
} from "./SettingsPrimitives";

interface PdktConsumersTabProps {
  consumerTypes: PdktConsumerType[];
  globalConsumerTypeId: string;
  setGlobalConsumerTypeId: (val: string) => void;
  consumerForm: ReturnType<typeof useCrudForm<PdktConsumerType>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function PdktConsumersTab({
  consumerTypes,
  globalConsumerTypeId,
  setGlobalConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: PdktConsumersTabProps) {

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus tipe konsumen ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
      }));
      if (globalConsumerTypeId === id) {
        setGlobalConsumerTypeId("random");
      }
    }
  };

  const handleAddClick = () => {
    consumerForm.openAdd();
  };

  const handleEditClick = (consumer: PdktConsumerType) => {
    consumerForm.openEdit(consumer);
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
      <div className="space-y-6 pb-10 mt-2">
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={handleCancelConsumerForm}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Daftar Karakter
          </button>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden relative">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.01]">
            <h3 className="font-bold text-foreground text-sm tracking-tight">
              {consumerForm.editingId ? "Edit Karakter" : "Tambah Karakter Baru"}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <SettingsField label="Nama Karakter / Tipe" id="consumer-name">
                <SettingsInput
                  id="consumer-name"
                  type="text"
                  placeholder="Contoh: Konsumen Milenial Galak"
                  value={consumerForm.draft.name || ""}
                  onChange={(e) => consumerForm.setDraft({ name: e.target.value })}
                />
              </SettingsField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <SettingsField label="Tingkat Kesulitan" id="consumer-difficulty">
                  <SettingsSelect
                    id="consumer-difficulty"
                    value={consumerForm.draft.difficulty || "Medium"}
                    onChange={(e) =>
                      consumerForm.setDraft({
                        difficulty: e.target.value as PdktConsumerType["difficulty"],
                      })
                    }
                  >
                    <option value="Easy">Mudah (Sopan)</option>
                    <option value="Medium">Menengah (Netral)</option>
                    <option value="Hard">Sulit (Marah/Kritis)</option>
                  </SettingsSelect>
                </SettingsField>
              </div>
              <div className="col-span-2 md:col-span-1">
                <SettingsField label="Tone Bicara / Keyword" id="consumer-tone">
                  <SettingsInput
                    id="consumer-tone"
                    type="text"
                    placeholder="Contoh: ketus, menggunakan 'saya', menuntut"
                    value={consumerForm.draft.tone || ""}
                    onChange={(e) => consumerForm.setDraft({ tone: e.target.value })}
                  />
                </SettingsField>
              </div>
            </div>
            <div>
              <SettingsField label="Deskripsi Karakteristik" id="consumer-description">
                <textarea
                  id="consumer-description"
                  className="w-full rounded-md border border-border bg-background p-2.5 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors placeholder:text-muted-foreground/30"
                  rows={4}
                  placeholder="Jelaskan detail perilaku karakter ini agar AI dapat menirunya..."
                  value={consumerForm.draft.description || ""}
                  onChange={(e) => consumerForm.setDraft({ description: e.target.value })}
                />
              </SettingsField>
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button
                onClick={handleCancelConsumerForm}
                className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveConsumer}
                disabled={!consumerForm.draft.name || !consumerForm.draft.description}
                className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 mt-2">
      {/* Tips Banner */}
      <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl flex gap-4 items-start backdrop-blur-sm">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground text-xs mb-0.5">
            💡 Tips Simulasi
          </h4>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Pilih tipe konsumen yang akan disimulasikan. Variasi tingkat kesulitan akan mempengaruhi gaya bahasa dan respon AI. Pilih <span className="text-primary font-bold">Acak</span> untuk tantangan yang berbeda setiap saat.
          </p>
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Random Option */}
        <SettingsCardOption
          isSelected={globalConsumerTypeId === "random"}
          onClick={() => setGlobalConsumerTypeId("random")}
          title="Acak (Random)"
        >
          Sistem akan memilih tipe konsumen secara acak untuk setiap sesi simulasi untuk variasi maksimal.
        </SettingsCardOption>

        {/* Consumer Types List */}
        {consumerTypes.map((c) => {
          const isSelected = globalConsumerTypeId === c.id;
          const difficultyLower = (c.difficulty || "Medium").toLowerCase();
          const badgeClass =
            difficultyLower === "easy"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
              : difficultyLower === "medium"
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                : difficultyLower === "hard"
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                  : "bg-muted border-border text-muted-foreground";

          return (
            <SettingsCardOption
              key={c.id}
              isSelected={isSelected}
              onClick={() => setGlobalConsumerTypeId(c.id)}
              title={c.name}
              badge={
                <span
                  className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${badgeClass}`}
                >
                  {c.difficulty}
                </span>
              }
              actions={
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(c);
                    }}
                    className="p-1.5 rounded-lg bg-background border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConsumer(c.id);
                    }}
                    className="p-1.5 rounded-lg bg-background border border-border hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              }
            >
              {c.description}
            </SettingsCardOption>
          );
        })}
      </div>

      <button
        onClick={handleAddClick}
        className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">Buat Karakteristik Baru</span>
      </button>
    </div>
  );
}
