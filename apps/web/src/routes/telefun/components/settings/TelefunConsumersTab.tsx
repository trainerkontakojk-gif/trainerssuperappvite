import React from 'react';
import { Users, Check, Edit2, Trash2, Plus } from 'lucide-react';
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
    setTimeout(() => {
      document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleEditClick = (consumer: ConsumerType) => {
    consumerForm.openEdit(consumer);
    setTimeout(() => {
      document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Pilih Karakter Pelanggan</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini akan digunakan untuk <strong>semua skenario</strong> masalah yang telah Anda pilih.
            </p>
          </div>
        </div>
      </div>

      {/* Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Random Option */}
        <div
          onClick={() => handleSelectConsumerType('random')}
          className={`cursor-pointer p-6 rounded-2xl border-2 transition-all relative ${
            preferredConsumerTypeId === 'random'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
              : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
          }`}
        >
          <div className="flex justify-between items-start">
            <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              🎲 Karakteristik Random
            </h4>
            {preferredConsumerTypeId === 'random' && (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Sistem akan memilih salah satu karakter secara acak setiap kali sesi simulasi dimulai.
          </p>
        </div>

        {/* Defined Types */}
        {consumerTypes.map(c => (
          <div
            key={c.id}
            onClick={() => handleSelectConsumerType(c.id)}
            className={`cursor-pointer p-6 rounded-2xl border-2 transition-all relative group ${
              preferredConsumerTypeId === c.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {c.name}
              </h4>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${
                  c.difficulty === ConsumerDifficulty.Easy ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                  c.difficulty === ConsumerDifficulty.Medium ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                  'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                }`}>
                  {c.difficulty}
                </span>
                {preferredConsumerTypeId === c.id ? (
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditClick(c); }}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteConsumer(c.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {c.description}
            </p>
          </div>
        ))}
      </div>

      {/* Add New Type Button */}
      {!consumerForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-4 flex items-center justify-center gap-2 bg-white dark:bg-[#1C1C1E] border border-dashed border-gray-300 dark:border-white/10 rounded-2xl text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500/30 dark:hover:border-blue-400/30 transition-all font-bold text-sm shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Buat Karakteristik Baru</span>
        </button>
      )}

      {/* Form for Add/Edit Consumer */}
      {consumerForm.isOpen && (
        <div id="consumer-form" className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#2C2C2E]/50">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              {consumerForm.editingId ? 'Edit Karakter' : 'Tambah Karakter'}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase mb-2 text-gray-500 dark:text-gray-400">Nama</label>
              <input
                className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={consumerForm.draft.name || ''}
                onChange={e => consumerForm.setDraft({ name: e.target.value })}
                placeholder="Contoh: Pelanggan Marah"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-2 text-gray-500 dark:text-gray-400">Kesulitan</label>
              <div className="relative">
                <select
                  className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                  value={consumerForm.draft.difficulty || ConsumerDifficulty.Medium}
                  onChange={e => consumerForm.setDraft({ difficulty: e.target.value as ConsumerType["difficulty"] })}
                >
                  <option value={ConsumerDifficulty.Easy}>Mudah</option>
                  <option value={ConsumerDifficulty.Medium}>Sedang</option>
                  <option value={ConsumerDifficulty.Hard}>Sulit</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-2 text-gray-500 dark:text-gray-400">Deskripsi/Prompt</label>
              <textarea
                className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={3}
                value={consumerForm.draft.description || ''}
                onChange={e => consumerForm.setDraft({ description: e.target.value })}
                placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={handleCancelConsumerForm} className="px-6 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-all">Batal</button>
              <button
                onClick={handleSaveConsumer}
                disabled={!consumerForm.draft.name || !consumerForm.draft.description}
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
