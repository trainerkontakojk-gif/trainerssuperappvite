import React from "react";
import { Users, Check, Edit2, Trash2, Plus } from "lucide-react";
import { KetikConsumerType } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";

interface KetikConsumersTabProps {
  consumerTypes: KetikConsumerType[];
  activeConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<KetikConsumerType>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<any>>;
}

export function KetikConsumersTab({
  consumerTypes,
  activeConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: KetikConsumersTabProps) {

  const handleSelectConsumerType = (id: string) =>
    setLocalSettings((prev: any) => ({ ...prev, activeConsumerTypeId: id }));

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakteristik ini?")) {
      setLocalSettings((prev: any) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c: any) => c.id !== id),
        activeConsumerTypeId:
          prev.activeConsumerTypeId === id
            ? "random"
            : prev.activeConsumerTypeId,
      }));
    }
  };

  const handleAddClick = () => {
    consumerForm.openAdd();
    setTimeout(() => {
      document.getElementById("consumer-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleEditClick = (consumer: KetikConsumerType) => {
    consumerForm.openEdit(consumer);
    setTimeout(() => {
      document.getElementById("consumer-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSaveConsumer = () => {
    if (!consumerForm.draft.name || !consumerForm.draft.description) return;

    setLocalSettings((prev: any) => {
      let updatedTypes = prev.consumerTypes;
      if (consumerForm.editingId) {
        updatedTypes = prev.consumerTypes.map((c: any) =>
          c.id === consumerForm.editingId
            ? { ...c, ...consumerForm.draft }
            : c
        );
      } else {
        updatedTypes = [
          ...prev.consumerTypes,
          {
            id: `c-${Date.now()}`,
            ...consumerForm.draft,
            isCustom: true,
          },
        ];
      }
      return { ...prev, consumerTypes: updatedTypes };
    });

    consumerForm.close();
  };

  const handleCancelConsumerForm = () => {
    if (consumerForm.isDirty(consumerTypes)) {
      if (!window.confirm("Karakter belum disimpan. Buang perubahan?")) return;
    }
    consumerForm.close();
  };

  return (
    <div className="space-y-8 pb-10 mt-4">
      <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="flex items-start gap-6 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
            <Users className="w-7 h-7 text-orange-500" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-xl tracking-tighter">
              Pilih Karakter Pelanggan
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">
              Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini akan digunakan untuk{" "}
              <span className="text-foreground font-black">semua skenario</span> yang aktif.
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => handleSelectConsumerType("random")}
          className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all ${activeConsumerTypeId === "random" ? "border-primary bg-primary/5" : "border-transparent bg-card border-border/50 hover:bg-foreground/5"}`}
        >
          <div className="flex justify-between items-start">
            <h4 className="font-black text-foreground tracking-tight flex items-center gap-2 text-lg">
              Acak
            </h4>
            {activeConsumerTypeId === "random" && (
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-3 font-medium leading-relaxed">
            Sistem akan memilih salah satu karakter secara acak setiap kali sesi simulasi dimulai.
          </p>
        </div>
        {consumerTypes.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSelectConsumerType(c.id)}
            className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all relative group ${activeConsumerTypeId === c.id ? "border-primary bg-primary/5" : "border-transparent bg-card border-border/50 hover:bg-foreground/5"}`}
          >
            <div className="flex justify-between items-start mb-3">
              <h4 className="font-black text-foreground tracking-tight text-lg">
                {c.name}
              </h4>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-widest border ${c.difficulty === "Mudah" ? "bg-green-500/10 text-green-500 border-green-500/20" : c.difficulty === "Sedang" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}
                >
                  {c.difficulty}
                </span>
                {activeConsumerTypeId === c.id ? (
                  <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(c);
                      }}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all border border-border/50"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConsumer(c.id);
                      }}
                      className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-border/50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
              {c.description}
            </p>
          </div>
        ))}
      </div>
      {!consumerForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 border border-dashed border-border/50 rounded-[2.5rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest group"
        >
          <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <span>Buat Karakteristik Baru</span>
        </button>
      )}
      {consumerForm.isOpen && (
        <div
          id="consumer-form"
          className="bg-card border border-border/50 rounded-[2.5rem] shadow-3xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
            <h3 className="font-black text-foreground text-lg tracking-tighter">
              {consumerForm.editingId
                ? "Edit Karakter"
                : "Tambah Karakter Baru"}
            </h3>
          </div>
          <div className="p-8 space-y-6 relative z-10">
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Nama Karakter
              </label>
              <input
                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                value={consumerForm.draft.name || ""}
                onChange={(e) => consumerForm.setDraft({ name: e.target.value })}
                placeholder="Contoh: Pelanggan Marah"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Tingkat Kesulitan
              </label>
              <select
                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                value={consumerForm.draft.difficulty || "Sedang"}
                onChange={(e) =>
                  consumerForm.setDraft({ difficulty: e.target.value as any })
                }
              >
                <option value="Mudah">Mudah</option>
                <option value="Sedang">Sedang</option>
                <option value="Sulit">Sulit</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Deskripsi / AI Prompt
              </label>
              <textarea
                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all"
                rows={3}
                value={consumerForm.draft.description || ""}
                onChange={(e) => consumerForm.setDraft({ description: e.target.value })}
                placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
              <button
                onClick={handleCancelConsumerForm}
                className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveConsumer}
                disabled={!consumerForm.draft.name || !consumerForm.draft.description}
                className="px-8 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
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
