import React from "react";
import { Users, Check, Edit2, Trash2, Plus, X } from "lucide-react";
import { PdktConsumerType } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { type PdktAppSettings as AppSettings } from "../../pdktSettings";
import { normalizePdktConsumerDraft } from "./pdktDraftNormalizers";

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
    <div className="space-y-8 mt-4">
      <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl flex gap-5 items-start backdrop-blur-md">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h4 className="font-medium text-foreground uppercase tracking-wide text-[11px] mb-1">
            💡 Tips Simulasi
          </h4>
          <p className="text-sm text-muted-foreground font-medium leading-relaxed">
            Pilih tipe konsumen yang akan disimulasikan. Variasi
            tingkat kesulitan akan mempengaruhi gaya bahasa dan
            respon AI. Pilih{" "}
            <span className="text-primary font-bold">Acak</span>{" "}
            untuk tantangan yang berbeda setiap saat.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Random Option */}
        <div
          onClick={() => setGlobalConsumerTypeId("random")}
          className={`cursor-pointer p-6 rounded-xl border transition-all relative overflow-hidden group ${
            globalConsumerTypeId === "random"
              ? "bg-primary border-primary/30 shadow-xl shadow-primary/10"
              : "bg-card/40 border-border/50 hover:border-primary/20 hover:bg-card/60"
          }`}
        >
          {globalConsumerTypeId === "random" && (
            <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground/50" />
          )}
          <div className="flex justify-between items-start mb-4">
            <h4
              className={`font-semibold text-lg tracking-tight flex items-center gap-3 ${globalConsumerTypeId === "random" ? "text-primary-foreground" : "text-foreground"}`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${globalConsumerTypeId === "random" ? "bg-primary-foreground animate-pulse" : "bg-foreground/20"}`}
              />
              Acak (Random)
            </h4>
            {globalConsumerTypeId === "random" && (
              <div className="bg-primary-foreground/20 text-primary-foreground p-1.5 rounded-xl backdrop-blur-md">
                <Check className="w-4 h-4 stroke-[3px]" />
              </div>
            )}
          </div>
          <p
            className={`text-xs font-medium leading-relaxed ${globalConsumerTypeId === "random" ? "text-primary-foreground/60" : "text-muted-foreground"}`}
          >
            Sistem akan memilih tipe konsumen secara acak untuk
            setiap sesi simulasi untuk variasi maksimal.
          </p>
        </div>

        {consumerTypes.map((c) => (
          <div
            key={c.id}
            onClick={() => setGlobalConsumerTypeId(c.id)}
            className={`cursor-pointer p-6 rounded-xl border transition-all relative overflow-hidden group ${
              globalConsumerTypeId === c.id
                ? "bg-primary border-primary/30 shadow-xl shadow-primary/10"
                : "bg-card/40 border-border/50 hover:border-primary/20 hover:bg-card/60"
            }`}
          >
            {globalConsumerTypeId === c.id && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground/50" />
            )}
            <div className="flex justify-between items-start mb-4">
              <h4
                className={`font-semibold text-lg tracking-tight flex items-center gap-3 pr-8 ${globalConsumerTypeId === c.id ? "text-primary-foreground" : "text-foreground"}`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${globalConsumerTypeId === c.id ? "bg-primary-foreground" : "bg-foreground/20"}`}
                />
                {c.name}
              </h4>
              <div className="flex items-center gap-2 relative z-10">
                {globalConsumerTypeId === c.id && (
                  <div className="bg-primary-foreground/20 text-primary-foreground p-1.5 rounded-xl backdrop-blur-md mr-1">
                    <Check className="w-4 h-4 stroke-[3px]" />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(c);
                  }}
                  className={`p-2 rounded-xl transition-all border border-transparent ${
                    globalConsumerTypeId === c.id
                      ? "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                      : "bg-foreground/5 text-muted-foreground hover:text-primary hover:border-primary/20"
                  }`}
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConsumer(c.id);
                  }}
                  className={`p-2 rounded-xl transition-all border border-transparent ${
                    globalConsumerTypeId === c.id
                      ? "bg-primary-foreground/10 text-primary-foreground hover:bg-red-400"
                      : "bg-foreground/5 text-muted-foreground hover:text-red-500 hover:border-red-500/20"
                  }`}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <span
                className={`text-[9px] px-2.5 py-1 rounded-lg font-medium uppercase tracking-wide border ${
                  globalConsumerTypeId === c.id
                    ? "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground"
                    : "bg-foreground/5 border-border/50 text-muted-foreground"
                }`}
              >
                {c.difficulty}
              </span>
            </div>
            <p
              className={`text-xs font-medium leading-relaxed line-clamp-2 ${globalConsumerTypeId === c.id ? "text-primary-foreground/60" : "text-muted-foreground"}`}
            >
              {c.description}
            </p>
          </div>
        ))}
      </div>

      {!consumerForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-10 rounded-xl border-2 border-dashed border-border/50 bg-card/10 text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-3 group mt-4 shadow-inner"
        >
          <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
            <Plus className="w-7 h-7" />
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wide">
            Tambah Karakter Baru
          </span>
        </button>
      )}
      {consumerForm.isOpen && (
        <div
          id="consumer-form"
          className="bg-card/60 backdrop-blur-3xl rounded-xl border border-border/50 shadow-sm overflow-hidden mt-8 relative"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/50 to-primary/10" />
          <div className="px-8 py-6 border-b border-border/50 flex justify-between items-center">
            <h3 className="font-semibold text-foreground text-lg tracking-tight">
              {consumerForm.editingId ? "Edit Karakter" : "Tambah Karakter"}
            </h3>
            <button
              onClick={handleCancelConsumerForm}
              className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-8 grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Nama Karakter / Tipe
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10"
                placeholder="Contoh: Konsumen Milenial Galak"
                value={consumerForm.draft.name || ""}
                onChange={(e) => consumerForm.setDraft({ name: e.target.value })}
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Tingkat Kesulitan
              </label>
              <select
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium appearance-none"
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
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Tone Bicara / Keyword
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10"
                placeholder="Contoh: ketus, menggunakan 'saya', menuntut"
                value={consumerForm.draft.tone || ""}
                onChange={(e) => consumerForm.setDraft({ tone: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Deskripsi Karakteristik
              </label>
              <textarea
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none font-medium placeholder:text-foreground/10"
                rows={3}
                placeholder="Jelaskan detail perilaku karakter ini agar AI dapat menirunya..."
                value={consumerForm.draft.description || ""}
                onChange={(e) => consumerForm.setDraft({ description: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex justify-end gap-3 pt-6 border-t border-border/50">
              <button
                onClick={handleCancelConsumerForm}
                className="px-8 py-3 rounded-xl text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveConsumer}
                disabled={!consumerForm.draft.name || !consumerForm.draft.description}
                className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold text-[10px] uppercase tracking-widest shadow-sm transition-all"
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
