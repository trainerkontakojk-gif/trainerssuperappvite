import React from "react";

interface KetikIdentityTabProps {
  identitySettings: {
    displayName: string;
    signatureName: string;
    phoneNumber: string;
    city: string;
  };
  handleIdentityChange: (field: string, value: string) => void;
}

export function KetikIdentityTab({
  identitySettings,
  handleIdentityChange,
}: KetikIdentityTabProps) {
  return (
    <div className="space-y-6 pb-10 mt-2">
      <div className="border-b border-border pb-4">
        <h3 className="font-bold text-foreground text-lg tracking-tight">
          Identitas &amp; Greeting
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Konfigurasi profil konsumen dan identitas agen untuk salam pembuka yang lebih personal.
        </p>
      </div>

      <div className="p-6 rounded-xl border border-border bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Nama Konsumen
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Nama Agen (Greeting)
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: Fajar"
              value={identitySettings.signatureName || ""}
              onChange={(e) =>
                handleIdentityChange("signatureName", e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Nomor Telepon
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: 0812..."
              value={identitySettings.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Kota Asal
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
              placeholder="Contoh: Jakarta"
              value={identitySettings.city || ""}
              onChange={(e) =>
                handleIdentityChange("city", e.target.value)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
