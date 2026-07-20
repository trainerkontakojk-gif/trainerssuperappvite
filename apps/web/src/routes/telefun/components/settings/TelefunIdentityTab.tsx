import React from "react";
import { User } from "lucide-react";
import { normalizeTelefunLiveModelSelection } from "@trainers/types";
import {
  TelefunAppSettings as AppSettings,
  TelefunIdentitySettings as ConsumerIdentitySettings,
} from "../../telefunSettings";
import { getVoicesForModel } from "../../telefunVoiceRegistry";

interface TelefunIdentityTabProps {
  identitySettings: ConsumerIdentitySettings;
  telefunModelId: string;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunIdentityTab: React.FC<TelefunIdentityTabProps> = ({
  identitySettings,
  telefunModelId,
  setLocalSettings,
}) => {
  const selectedModel =
    normalizeTelefunLiveModelSelection(telefunModelId).model;
  const selectedGender = identitySettings?.gender || "random";
  const voiceSelectionDisabled = selectedGender === "random";
  const voiceOptions =
    selectedGender === "random"
      ? []
      : getVoicesForModel(selectedModel.id, selectedGender);

  const handleIdentityChange = <K extends keyof ConsumerIdentitySettings>(
    field: K,
    value: ConsumerIdentitySettings[K],
  ) => {
    setLocalSettings((prev: AppSettings) => {
      const updatedSettings = {
        ...prev.identitySettings,
        [field]: value,
      };
      if (field === "gender") {
        updatedSettings.voiceName = "";
      }
      return {
        ...prev,
        identitySettings: updatedSettings,
      };
    });
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex max-w-2xl items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="mb-0.5 text-sm font-bold tracking-tight text-foreground">
              Atur Identitas Simulasi
            </h3>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Konfigurasi identitas persona dan suara untuk model Telefun yang
              dipilih.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border/40 bg-muted/10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Nama Konsumen (Lengkap)
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings?.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Jenis Kelamin
            </label>
            <div className="relative group">
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors appearance-none cursor-pointer"
                value={selectedGender}
                onChange={(e) =>
                  handleIdentityChange(
                    "gender",
                    e.target.value as ConsumerIdentitySettings["gender"],
                  )
                }
              >
                <option value="random">Acak</option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
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
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Pilihan Suara
            </label>
            <div className="relative group">
              <select
                className={`w-full appearance-none rounded-md border p-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  voiceSelectionDisabled
                    ? "cursor-not-allowed border-border/50 bg-background/50 text-muted-foreground"
                    : "cursor-pointer border-border bg-background text-foreground focus:border-foreground"
                }`}
                value={identitySettings?.voiceName || ""}
                onChange={(e) =>
                  handleIdentityChange("voiceName", e.target.value)
                }
                disabled={voiceSelectionDisabled}
              >
                <option value="">Acak (Sesuai Gender)</option>
                {voiceOptions.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
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
            {voiceSelectionDisabled ? (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Suara akan diacak otomatis sesuai hasil penentuan gender saat
                simulasi.
              </p>
            ) : null}
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Nomor Telepon Konsumen
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: 0812..."
              value={identitySettings?.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Kota Konsumen
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: Jakarta"
              value={identitySettings?.city || ""}
              onChange={(e) => handleIdentityChange("city", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
