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

  const handleIdentityChange = <K extends keyof ConsumerIdentitySettings>(
    field: K,
    value: ConsumerIdentitySettings[K],
  ) => {
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
    <div className="space-y-6 mt-4">
      {/* Header Banner */}
      <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
        <div className="absolute top-1/2 -translate-y-1/2 right-4 text-primary/5 group-hover:scale-110 transition-transform pointer-events-none">
          <User className="w-24 h-24" />
        </div>
        <div className="relative z-10 max-w-2xl flex gap-4 items-start">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">Atur Identitas Simulasi</h3>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Konfigurasi nama konsumen dan data lainnya.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border/40 bg-muted/10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Nama Konsumen (Lengkap)</label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings?.displayName || ''}
              onChange={(e) => handleIdentityChange('displayName', e.target.value)}
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Jenis Kelamin</label>
            <div className="relative group">
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors appearance-none cursor-pointer"
                value={identitySettings?.gender || 'random'}
                onChange={(e) =>
                  handleIdentityChange(
                    'gender',
                    e.target.value as ConsumerIdentitySettings["gender"],
                  )
                }
              >
                <option value="random">Acak</option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Pilihan Suara</label>
            <div className="relative group">
              <select
                className={`w-full rounded-md border p-2 text-sm outline-none appearance-none transition-colors cursor-pointer ${
                  (!identitySettings?.gender || identitySettings?.gender === 'random')
                    ? 'border-border/50 bg-background/50 text-muted-foreground/50 cursor-not-allowed'
                    : 'border-border bg-background text-foreground focus:border-foreground'
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
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            {(!identitySettings?.gender || identitySettings?.gender === 'random') && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Suara akan diacak otomatis sesuai hasil penentuan gender saat simulasi.
              </p>
            )}
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Nomor Telepon Konsumen</label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: 0812..."
              value={identitySettings?.phoneNumber || ''}
              onChange={(e) => handleIdentityChange('phoneNumber', e.target.value)}
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Kota Konsumen</label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
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
