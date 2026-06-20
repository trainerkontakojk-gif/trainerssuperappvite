import React from "react";
import { ArrowLeft, Edit2, Trash2, Plus } from "lucide-react";
import { KetikAppSettings, KetikConsumerType } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeKetikConsumerDraft } from "./ketikDraftNormalizers";

interface KetikConsumersTabProps {
  consumerTypes: KetikConsumerType[];
  activeConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<KetikConsumerType>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
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

  const handleAddClick = () => {
    consumerForm.openAdd();
  };

  const handleEditClick = (consumer: KetikConsumerType) => {
    consumerForm.openEdit(consumer);
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
      <div className="space-y-6 pb-10">
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={handleCancelConsumerForm}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Daftar Karakter
          </button>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden relative">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.01]">
            <h3 className="font-bold text-foreground text-base tracking-tight">
              {consumerForm.editingId ? "Edit Karakter" : "Tambah Karakter Baru"}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Nama Karakter
              </label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
                value={consumerForm.draft.name || ""}
                onChange={(e) => consumerForm.setDraft({ name: e.target.value })}
                placeholder="Contoh: Pelanggan Marah"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Tingkat Kesulitan
              </label>
              <div className="relative">
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none appearance-none transition-colors"
                  value={consumerForm.draft.difficulty || "Sedang"}
                  onChange={(e) =>
                    consumerForm.setDraft({
                      difficulty: e.target.value as KetikConsumerType["difficulty"],
                    })
                  }
                >
                  <option value="Mudah">Mudah</option>
                  <option value="Sedang">Sedang</option>
                  <option value="Sulit">Sulit</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Deskripsi / AI Prompt
              </label>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors placeholder:text-muted-foreground/30"
                rows={4}
                value={consumerForm.draft.description || ""}
                onChange={(e) => consumerForm.setDraft({ description: e.target.value })}
                placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button
                onClick={handleCancelConsumerForm}
                className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveConsumer}
                disabled={!consumerForm.draft.name || !consumerForm.draft.description}
                className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="border-b border-border pb-4">
        <h3 className="font-bold text-foreground text-lg tracking-tight">
          Pilih Karakter Pelanggan
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini akan digunakan untuk <span className="text-foreground font-medium">semua skenario</span> yang aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => handleSelectConsumerType("random")}
          className={`cursor-pointer p-5 rounded-xl border transition-all flex flex-col justify-between ${
            activeConsumerTypeId === "random"
              ? "border-primary bg-primary/5"
              : "border-border bg-card/45 hover:bg-foreground/[0.02]"
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-foreground tracking-tight text-sm">
              Acak
            </h4>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${activeConsumerTypeId === "random" ? "border-primary" : "border-border"}`}>
              {activeConsumerTypeId === "random" && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            Sistem akan memilih salah satu karakter secara acak setiap kali sesi simulasi dimulai.
          </p>
        </div>

        {consumerTypes.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSelectConsumerType(c.id)}
            className={`cursor-pointer p-5 rounded-xl border transition-all relative group flex flex-col justify-between ${
              activeConsumerTypeId === c.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card/45 hover:bg-foreground/[0.02]"
            }`}
          >
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="flex flex-col gap-1 min-w-0">
                <h4 className="font-semibold text-foreground tracking-tight text-sm truncate">
                  {c.name}
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${
                      c.difficulty === "Mudah"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : c.difficulty === "Sedang"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }`}
                  >
                    {c.difficulty}
                  </span>
                </div>
              </div>
              <div className="flex items-center shrink-0">
                {activeConsumerTypeId === c.id ? (
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${activeConsumerTypeId === c.id ? "border-primary" : "border-border"}`}>
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(c);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-border"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConsumer(c.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              {c.description}
            </p>
          </div>
        ))}
      </div>

      {!consumerForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">Buat Karakteristik Baru</span>
        </button>
      )}
    </div>
  );
}
