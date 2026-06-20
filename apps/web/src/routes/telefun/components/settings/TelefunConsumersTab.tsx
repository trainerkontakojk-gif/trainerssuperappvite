import React from 'react';
import { Users, Edit2, Trash2, Plus, ArrowLeft } from 'lucide-react';
import { TelefunAppSettings as AppSettings, TelefunConsumerType as ConsumerType, ConsumerDifficulty } from '../../telefunSettings';
import { useCrudForm } from '../../../../hooks/useCrudForm';
import { normalizeTelefunConsumerDraft } from './telefunDraftNormalizers';

interface TelefunConsumersTabProps {
  consumerTypes: ConsumerType[];
  preferredConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<ConsumerType>>;
  handleSelectConsumerType: (id: string) => void;
  handleDeleteConsumer: (id: string) => void;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunConsumersTab: React.FC<TelefunConsumersTabProps> = ({
  consumerTypes,
  preferredConsumerTypeId,
  consumerForm,
  handleSelectConsumerType,
  handleDeleteConsumer,
  setLocalSettings,
}) => {

  const handleAddClick = () => {
    consumerForm.openAdd();
  };

  const handleEditClick = (consumer: ConsumerType) => {
    consumerForm.openEdit(consumer);
  };

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
      if (!window.confirm('Karakter belum disimpan. Buang perubahan?')) return;
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
              {consumerForm.editingId ? 'Edit Karakter' : 'Tambah Karakter Baru'}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Nama Karakter / Tipe</label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
                value={consumerForm.draft.name || ''}
                onChange={e => consumerForm.setDraft({ name: e.target.value })}
                placeholder="Contoh: Pelanggan Marah"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Tingkat Kesulitan</label>
              <div className="relative group">
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors appearance-none cursor-pointer"
                  value={consumerForm.draft.difficulty || ConsumerDifficulty.Medium}
                  onChange={e => consumerForm.setDraft({ difficulty: e.target.value as ConsumerType["difficulty"] })}
                >
                  <option value={ConsumerDifficulty.Easy}>Mudah</option>
                  <option value={ConsumerDifficulty.Medium}>Sedang</option>
                  <option value={ConsumerDifficulty.Hard}>Sulit</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Deskripsi / Prompt AI</label>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors placeholder:text-muted-foreground/30"
                rows={4}
                value={consumerForm.draft.description || ''}
                onChange={e => consumerForm.setDraft({ description: e.target.value })}
                placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button onClick={handleCancelConsumerForm} className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors cursor-pointer">Batal</button>
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
          <h4 className="font-semibold text-foreground text-xs mb-0.5">💡 Tips Simulasi</h4>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Pilih tipe konsumen yang akan disimulasikan. Variasi tingkat kesulitan akan mempengaruhi gaya bahasa dan respons AI. Pilih <span className="text-primary font-bold">Acak</span> untuk tantangan yang berbeda setiap saat.
          </p>
        </div>
      </div>

      {/* Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Random Option */}
        <div
          onClick={() => handleSelectConsumerType('random')}
          className={`cursor-pointer p-4 rounded-xl border transition-colors flex flex-col justify-between ${
            preferredConsumerTypeId === 'random'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card/45 hover:bg-foreground/[0.02]'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-semibold text-foreground tracking-tight text-sm">
              🎲 Acak (Random)
            </h4>
            <div className="flex items-center shrink-0">
              {preferredConsumerTypeId === 'random' ? (
                <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed mt-1.5">
            Sistem akan memilih salah satu karakter secara acak setiap kali sesi simulasi dimulai.
          </p>
        </div>

        {/* Defined Types */}
        {consumerTypes.map(c => {
          const isSelected = preferredConsumerTypeId === c.id;
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
            <div
              key={c.id}
              onClick={() => handleSelectConsumerType(c.id)}
              className={`group cursor-pointer p-4 rounded-xl border transition-colors flex flex-col justify-between ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card/45 hover:bg-foreground/[0.02] opacity-85 hover:opacity-100'
              }`}
            >
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <h4 className="font-semibold text-foreground tracking-tight text-sm truncate">
                    {c.name}
                  </h4>
                  <div className="flex gap-2 flex-wrap mt-0.5">
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${badgeClass}`}
                    >
                      {c.difficulty}
                    </span>
                  </div>
                </div>
                <div className="flex items-center shrink-0 gap-2">
                  {isSelected ? (
                    <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditClick(c); }}
                        className="p-1.5 rounded-lg bg-background border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteConsumer(c.id); }}
                        className="p-1.5 rounded-lg bg-background border border-border hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed mt-1.5">
                {c.description}
              </p>
            </div>
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
};
