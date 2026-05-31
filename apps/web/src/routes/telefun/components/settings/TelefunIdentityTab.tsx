import React from 'react';
import { User } from 'lucide-react';
import {
  TelefunAppSettings as AppSettings,
  TelefunIdentitySettings as ConsumerIdentitySettings,
  MALE_VOICES,
  FEMALE_VOICES
} from '../../telefunSettings';

interface TelefunIdentityTabProps {
  identitySettings: ConsumerIdentitySettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunIdentityTab: React.FC<TelefunIdentityTabProps> = ({
  identitySettings,
  setLocalSettings,
}) => {

  const handleIdentityChange = (field: keyof ConsumerIdentitySettings, value: string) => {
    setLocalSettings((prev: AppSettings) => {
      const updatedSettings = {
        ...prev.identitySettings,
        [field]: value
      };
      if (field === 'gender') {
        updatedSettings.voiceName = '';
      }
      return {
        ...prev,
        identitySettings: updatedSettings
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Atur Identitas Simulasi</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              Konfigurasi nama konsumen dan data lainnya.
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 rounded-[2.5rem] border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Nama Konsumen (Lengkap)</label>
            <input
              type="text"
              className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings?.displayName || ''}
              onChange={(e) => handleIdentityChange('displayName', e.target.value)}
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Jenis Kelamin</label>
            <div className="relative">
              <select
                className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                value={identitySettings?.gender || 'random'}
                onChange={(e) => handleIdentityChange('gender', e.target.value as any)}
              >
                <option value="random">Acak</option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <svg width="12" height="8" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Pilihan Suara</label>
            <div className="relative">
              <select
                className={`w-full rounded-2xl border-gray-200 dark:border-white/10 p-4 text-base outline-none appearance-none transition-all ${
                  (!identitySettings?.gender || identitySettings?.gender === 'random')
                    ? 'bg-gray-100 dark:bg-[#1C1C1E]/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-50 dark:bg-[#2C2C2E] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                }`}
                value={identitySettings?.voiceName || ''}
                onChange={(e) => handleIdentityChange('voiceName', e.target.value)}
                disabled={!identitySettings?.gender || identitySettings?.gender === 'random'}
              >
                <option value="">Acak (Sesuai Gender)</option>
                {(identitySettings?.gender === 'male' ? MALE_VOICES : identitySettings?.gender === 'female' ? FEMALE_VOICES : []).map((v: string) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <svg width="12" height="8" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            {(!identitySettings?.gender || identitySettings?.gender === 'random') && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 ml-1">
                Suara akan diacak otomatis sesuai hasil penentuan gender saat simulasi.
              </p>
            )}
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Nomor Telepon Konsumen</label>
            <input
              type="text"
              className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Contoh: 0812..."
              value={identitySettings?.phoneNumber || ''}
              onChange={(e) => handleIdentityChange('phoneNumber', e.target.value)}
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Kota Konsumen</label>
            <input
              type="text"
              className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Contoh: Jakarta"
              value={identitySettings?.city || ''}
              onChange={(e) => handleIdentityChange('city', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
