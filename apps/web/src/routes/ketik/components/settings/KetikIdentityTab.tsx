import React from "react";
import { Fingerprint } from "lucide-react";
import { KetikAppSettings } from "@trainers/types";

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
    <div className="space-y-8 pb-10 mt-4">
      <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="flex items-start gap-6 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <Fingerprint className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-xl tracking-tighter">
              Identitas &amp; Greeting
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">
              Konfigurasi profil konsumen dan identitas agen untuk
              salam pembuka yang lebih personal.
            </p>
          </div>
        </div>
      </div>
      <div className="p-10 rounded-[2.5rem] border border-border/50 bg-card shadow-sm relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
              Nama Konsumen
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
              Nama Agen (Greeting)
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="Contoh: Fajar"
              value={identitySettings.signatureName || ""}
              onChange={(e) =>
                handleIdentityChange("signatureName", e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
              Nomor Telepon
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="Contoh: 0812..."
              value={identitySettings.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
              Kota Asal
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
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
