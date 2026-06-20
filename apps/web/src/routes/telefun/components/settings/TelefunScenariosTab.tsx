import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Edit2, Trash2, Plus, ArrowLeft } from 'lucide-react';
import { TelefunAppSettings as AppSettings, TelefunScenario as Scenario } from '../../telefunSettings';
import { useCrudForm } from '../../../../hooks/useCrudForm';
import { normalizeTelefunScenarioDraft } from './telefunDraftNormalizers';

interface TelefunScenariosTabProps {
  scenarios: Scenario[];
  scenarioForm: ReturnType<typeof useCrudForm<Scenario>>;
  handleSelectAll: () => void;
  handleUnselectAll: () => void;
  handleToggleScenario: (id: string) => void;
  handleDeleteScenario: (id: string) => void;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunScenariosTab: React.FC<TelefunScenariosTabProps> = ({
  scenarios,
  scenarioForm,
  handleSelectAll,
  handleUnselectAll,
  handleToggleScenario,
  handleDeleteScenario,
  setLocalSettings,
}) => {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState('');
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);

  const categories = Array.from(new Set(scenarios.map(s => s.category)));
  const activeCount = scenarios.filter(s => s.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleAddClick = () => {
    scenarioForm.openAdd();
    setNewScenarioCategory('');
    setIsNewCategoryInput(false);
    setIsScenarioScriptEnabled(false);
  };

  const handleEditClick = (scenario: Scenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category || '');
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
  };

  const handleSaveScenario = () => {
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
    if (!scenarioForm.draft.title || !scenarioForm.draft.instruction || !category) return;

    const draftScript = isScenarioScriptEnabled ? scenarioForm.draft.script : '';

    const normalizedDraft = normalizeTelefunScenarioDraft({
      ...scenarioForm.draft,
      category,
      script: draftScript,
    });

    setLocalSettings((prev) => ({
      ...prev,
      scenarios: scenarioForm.save(prev.scenarios, normalizedDraft),
    }));

    scenarioForm.close();
  };

  const handleCancelScenarioForm = () => {
    if (scenarioForm.isDirty(scenarios)) {
      if (!window.confirm('Skenario belum disimpan. Buang perubahan?')) return;
    }
    scenarioForm.close();
  };

  if (scenarioForm.isOpen) {
    return (
      <div className="space-y-6 pb-10 mt-2">
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={handleCancelScenarioForm}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Daftar Skenario
          </button>
        </div>

        {/* Edit Form */}
        <div id="scenario-form" className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.01]">
            <h3 className="font-bold text-foreground text-sm tracking-tight">
              {scenarioForm.editingId ? 'Edit Skenario' : 'Tambah Skenario Baru'}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Kategori</label>
              {!isNewCategoryInput ? (
                <div className="relative group">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors appearance-none cursor-pointer"
                    value={scenarioForm.draft.category || ''}
                    onChange={(e) => {
                      if (e.target.value === 'NEW') {
                        setIsNewCategoryInput(true);
                        setNewScenarioCategory('');
                        scenarioForm.setDraft({ category: '' });
                      } else {
                        setNewScenarioCategory(e.target.value);
                        scenarioForm.setDraft({ category: e.target.value });
                      }
                    }}
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="NEW">+ Tambah Kategori Lainnya</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors"
                    placeholder="Kategori Baru"
                    value={newScenarioCategory}
                    onChange={(e) => {
                      setNewScenarioCategory(e.target.value);
                      scenarioForm.setDraft({ category: e.target.value });
                    }}
                  />
                  <button onClick={() => setIsNewCategoryInput(false)} className="px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer">Batal</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Judul Masalah</label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
                placeholder="Contoh: Gagal Transfer"
                value={scenarioForm.draft.title || ''}
                onChange={(e) => scenarioForm.setDraft({ title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Deskripsi Masalah</label>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors placeholder:text-muted-foreground/30"
                rows={3}
                placeholder="Jelaskan konteks masalah..."
                value={scenarioForm.draft.instruction || ''}
                onChange={(e) => scenarioForm.setDraft({ instruction: e.target.value })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">Skrip Percakapan</label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Centang "Ikuti Skrip" agar AI menggunakan draf dialog/alur yang Anda tentukan di bawah.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsScenarioScriptEnabled((prev) => {
                      if (prev) {
                        scenarioForm.setDraft({ script: '' });
                      }
                      return !prev;
                    });
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                    isScenarioScriptEnabled
                      ? 'bg-primary/5 text-primary border-primary/20'
                      : 'bg-transparent text-muted-foreground border-border hover:bg-foreground/5 hover:text-foreground'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      isScenarioScriptEnabled
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-transparent text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                  {isScenarioScriptEnabled ? 'Ikuti Skrip' : 'Sangat Kreatif'}
                </button>
              </div>
              <textarea
                className={`w-full rounded-md border p-3 text-sm outline-none resize-none transition-all ${
                  isScenarioScriptEnabled
                    ? 'border-border bg-background text-foreground focus:border-foreground'
                    : 'border-border/50 bg-background/50 text-muted-foreground/50 cursor-not-allowed'
                }`}
                rows={8}
                value={scenarioForm.draft.script || ''}
                onChange={(e) => scenarioForm.setDraft({ script: e.target.value })}
                disabled={!isScenarioScriptEnabled}
                placeholder={`Contoh format 1 - Dialog:
Agent: Selamat pagi, ada yang bisa saya bantu?
Konsumen: Mas saya ada masalah transaksi.

Contoh format 2 - Alur:
Awal:
- Konsumen membuka telepon dengan nada panik.`}
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button onClick={handleCancelScenarioForm} className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors cursor-pointer">Batal</button>
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioForm.draft.title || !scenarioForm.draft.instruction || !(isNewCategoryInput ? newScenarioCategory : scenarioForm.draft.category)}
                className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="font-bold text-foreground text-lg tracking-tight">
            Daftar Skenario
          </h3>
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary mt-0.5">
            {activeCount} / {totalScenarios} AKTIF
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Hapus Semua
          </button>
        </div>
      </div>

      {/* Scenario List */}
      <div className="grid grid-cols-1 gap-3">
        {scenarios.map(scenario => (
          <motion.div
            layout
            key={scenario.id}
            className={`flex items-start p-4 rounded-xl border transition-all relative overflow-hidden ${
              scenario.isActive
                ? 'bg-card border-border/80'
                : 'bg-card/40 border-border/30 opacity-85 hover:opacity-100'
            }`}
          >
            {/* Checkbox */}
            <div className="pt-0.5 mr-3 shrink-0">
              <button
                onClick={() => handleToggleScenario(scenario.id)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                  scenario.isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border hover:border-foreground/30 bg-transparent text-transparent"
                }`}
              >
                {scenario.isActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium">
                  {scenario.category}
                </span>
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {scenario.instruction}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 ml-3 shrink-0">
              <button
                onClick={() => handleEditClick(scenario)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border cursor-pointer"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20 cursor-pointer"
                title="Hapus"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <button
        onClick={handleAddClick}
        className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">Tambah Skenario Baru</span>
      </button>
    </div>
  );
};
