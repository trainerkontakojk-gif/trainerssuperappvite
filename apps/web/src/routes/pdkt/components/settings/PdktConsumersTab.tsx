import React from "react";
import { Users, Edit2, Trash2, Plus, X } from "lucide-react";
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
    setTimeout(() => {
      document.getElementById("consumer-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleEditClick = (consumer: PdktConsumerType) => {
    consumerForm.openEdit(consumer);
    setTimeout(() => {
      document.getElementById("consumer-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
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

  return (
    <div className="space-y-6 mt-4">
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

      {!consumerForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-8 rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground hover:text-foreground hover:bg-muted/20 hover:border-border transition-all flex flex-col items-center justify-center gap-2.5 group mt-2 shadow-inner cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:scale-105 transition-all">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold">
            Tambah Karakter Baru
          </span>
        </button>
      )}

      {consumerForm.isOpen && (
        <div
          id="consumer-form"
          className="bg-card rounded-xl border border-border/80 shadow-md overflow-hidden mt-6 relative"
        >
          <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
          <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center bg-muted/10">
            <h3 className="font-semibold text-foreground text-sm tracking-tight">
              {consumerForm.editingId ? "Edit Karakter" : "Tambah Karakter"}
            </h3>
            <button
              onClick={handleCancelConsumerForm}
              className="w-8 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2">
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
            <div className="col-span-2">
              <SettingsField label="Deskripsi Karakteristik" id="consumer-description">
                <textarea
                  id="consumer-description"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-medium placeholder:text-muted-foreground/30"
                  rows={3}
                  placeholder="Jelaskan detail perilaku karakter ini agar AI dapat menirunya..."
                  value={consumerForm.draft.description || ""}
                  onChange={(e) => consumerForm.setDraft({ description: e.target.value })}
                />
              </SettingsField>
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-4 border-t border-border/40 mt-2">
              <button
                onClick={handleCancelConsumerForm}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveConsumer}
                disabled={!consumerForm.draft.name || !consumerForm.draft.description}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
