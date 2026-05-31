import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Edit2, Trash2, Plus, X } from 'lucide-react';
import { TelefunScenario as Scenario } from '../../telefunSettings';
import { useCrudForm } from '../../../../hooks/useCrudForm';
import { applyCollectionDraft } from '../../../../hooks/useCollectionDraft';

interface TelefunScenariosTabProps {
  scenarios: Scenario[];
  scenarioForm: ReturnType<typeof useCrudForm<Scenario>>;
  handleSelectAll: () => void;
  handleUnselectAll: () => void;
  handleToggleScenario: (id: string) => void;
  handleDeleteScenario: (id: string) => void;
  setLocalSettings: React.Dispatch<React.SetStateAction<any>>;
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
    setTimeout(() => {
      document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleEditClick = (scenario: Scenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category || '');
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
    setTimeout(() => {
      document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSaveScenario = () => {
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
    if (!scenarioForm.draft.title || !scenarioForm.draft.instruction || !category) return;

    const draftScript = isScenarioScriptEnabled ? scenarioForm.draft.script : '';

    // Save draft to local settings
    setLocalSettings((prev: any) => ({
      ...prev,
      scenarios: applyCollectionDraft<Scenario>({
        items: prev.scenarios,
        draft: { ...scenarioForm.draft, category, script: draftScript },
        editingId: scenarioForm.editingId,
        idPrefix: "s",
        extraDefaults: { isActive: true },
      }),
    }));

    scenarioForm.close();
  };

  const handleCancelScenarioForm = () => {
    if (scenarioForm.isDirty(scenarios)) {
      if (!window.confirm('Skenario belum disimpan. Buang perubahan?')) return;
    }
    scenarioForm.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">
            Daftar Skenario
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {activeCount} dari {totalScenarios} skenario dipilih
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="px-4 py-2 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="px-4 py-2 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
            className={`flex items-start p-5 rounded-2xl border transition-all ${
              scenario.isActive
                ? 'bg-white dark:bg-[#1C1C1E] border-blue-500/30 shadow-md'
                : 'bg-gray-50 dark:bg-[#1C1C1E]/50 border-gray-200 dark:border-white/5 opacity-70'
            }`}
          >
            {/* Checkbox */}
            <div className="pt-1 mr-4">
              <button
                onClick={() => handleToggleScenario(scenario.id)}
                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  scenario.isActive
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 bg-transparent'
                }`}
              >
                {scenario.isActive && <Check className="w-4 h-4" />}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-gray-100 dark:bg-[#2C2C2E] text-gray-600 dark:text-gray-300">
                  {scenario.category}
                </span>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                {scenario.instruction}
              </p>
            </div>

            {/* Action */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => handleEditClick(scenario)}
                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-all"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Button */}
      {!scenarioForm.isOpen ? (
        <button
          onClick={handleAddClick}
          className="w-full py-4 flex items-center justify-center gap-2 bg-white dark:bg-[#1C1C1E] border border-dashed border-gray-300 dark:border-white/10 rounded-2xl text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500/30 dark:hover:border-blue-400/30 transition-all font-bold text-sm shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Tambah Skenario Baru</span>
        </button>
      ) : (
        /* Edit Form */
        <div id="scenario-form" className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#2C2C2E]/50">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              {scenarioForm.editingId ? 'Edit Skenario' : 'Tambah Skenario Baru'}
            </h3>
          </div>
          <div className="p-6 grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Kategori</label>
              {!isNewCategoryInput ? (
                <div className="relative">
                  <select
                    className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
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
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Kategori Baru"
                    value={newScenarioCategory}
                    onChange={(e) => {
                      setNewScenarioCategory(e.target.value);
                      scenarioForm.setDraft({ category: e.target.value });
                    }}
                  />
                  <button onClick={() => setIsNewCategoryInput(false)} className="px-4 text-xs text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all">Batal</button>
                </div>
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Judul Masalah</label>
              <input
                type="text"
                className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Contoh: Gagal Transfer"
                value={scenarioForm.draft.title || ''}
                onChange={(e) => scenarioForm.setDraft({ title: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Deskripsi Masalah</label>
              <textarea
                className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={3}
                value={scenarioForm.draft.instruction || ''}
                onChange={(e) => scenarioForm.setDraft({ instruction: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between gap-4 mb-2">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Skrip Percakapan</label>
                <button
                  type="button"
                  onClick={() => setIsScenarioScriptEnabled((prev) => !prev)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${
                    isScenarioScriptEnabled
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                      : 'bg-gray-50 dark:bg-[#2C2C2E] text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/10'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      isScenarioScriptEnabled
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 bg-transparent text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                  {isScenarioScriptEnabled ? 'Ikuti Skrip' : 'Sangat Kreatif'}
                </button>
              </div>
              <textarea
                className={`w-full rounded-xl border p-3 text-sm outline-none resize-none transition-all ${
                  isScenarioScriptEnabled
                    ? 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                    : 'border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-[#1C1C1E]/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
                rows={12}
                value={scenarioForm.draft.script || ''}
                onChange={(e) => scenarioForm.setDraft({ script: e.target.value })}
                disabled={!isScenarioScriptEnabled}
                placeholder={`Contoh format 1 - Dialog:
Agent: Selamat pagi, ada yang bisa saya bantu?
Konsumen: Mas saya ada masalah transaksi.
Agent: Baik, transaksi seperti apa ya?
Konsumen: Tadi pagi ada transaksi kartu kredit yang saya tidak kenal.

Contoh format 2 - Alur:
Awal:
- Konsumen membuka telepon dengan nada panik dan singkat.
- Menyebut ada transaksi kartu kredit yang tidak dikenali.

Jika agen bertanya detail:
- Konsumen menyebut transaksi terjadi tadi pagi.
- Nilai transaksi sekitar Rp3.250.000.
- Konsumen tidak pernah memberikan OTP ke siapa pun.

Jika agen memberi arahan pemblokiran:
- Konsumen mulai sedikit tenang.
- Lalu bertanya apakah dana masih bisa diselamatkan.

Akhir:
- Konsumen berterima kasih setelah mendapat langkah lanjut.`}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Checklist <span className="font-bold text-gray-900 dark:text-white">Ikuti Skrip</span> untuk mengaktifkan kolom ini. Saat tidak dicentang, konsumen akan dibiarkan lebih bebas dan kreatif mengikuti konteks skenario. Saat dicentang, AI akan berusaha mengikuti skrip sebagai panduan alur.
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Anda bisa menulis skrip dalam format dialog seperti <span className="font-bold text-gray-900 dark:text-white">Agent:</span> /
                <span className="font-bold text-gray-900 dark:text-white"> Konsumen:</span> atau dalam format poin alur seperti
                <span className="font-bold text-gray-900 dark:text-white"> Awal</span>, <span className="font-bold text-gray-900 dark:text-white">Jika agen bertanya</span>,
                dan <span className="font-bold text-gray-900 dark:text-white">Akhir</span>. AI akan tetap menjawab secara natural sesuai pertanyaan agen dan situasi percakapan.
              </p>
            </div>
            <div className="col-span-2 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
              <button onClick={handleCancelScenarioForm} className="px-6 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-all">Batal</button>
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioForm.draft.title || !scenarioForm.draft.instruction || !(isNewCategoryInput ? newScenarioCategory : scenarioForm.draft.category)}
                className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
