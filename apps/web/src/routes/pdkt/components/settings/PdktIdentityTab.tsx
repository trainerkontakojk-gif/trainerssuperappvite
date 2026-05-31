import React from "react";
import { User, Settings, Trash2 } from "lucide-react";

interface PdktIdentityTabProps {
  customSenderName: string;
  setCustomSenderName: (val: string) => void;
  customBodyName: string;
  setCustomBodyName: (val: string) => void;
  customEmail: string;
  setCustomEmail: (val: string) => void;
  customCity: string;
  setCustomCity: (val: string) => void;
  consumerNameMentionPattern: "random" | "upfront" | "middle" | "late" | "none";
  setConsumerNameMentionPattern: (val: any) => void;
  handleResetDefaults: () => void;
}

export function PdktIdentityTab({
  customSenderName,
  setCustomSenderName,
  customBodyName,
  setCustomBodyName,
  customEmail,
  setCustomEmail,
  customCity,
  setCustomCity,
  consumerNameMentionPattern,
  setConsumerNameMentionPattern,
  handleResetDefaults,
}: PdktIdentityTabProps) {
  return (
    <div className="space-y-8 mt-4">
      <div className="bg-primary/5 border border-primary/20 p-8 rounded-xl relative overflow-hidden group backdrop-blur-md">
        <div className="absolute top-0 right-0 p-8 text-primary/10 group-hover:scale-125 transition-transform">
          <User className="w-32 h-32" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h3 className="text-2xl font-semibold text-foreground tracking-tight mb-2">
            Personalisasi Identitas
          </h3>
          <p className="text-sm text-muted-foreground font-medium leading-relaxed">
            Atur detail identitas Anda yang akan muncul dalam
            simulasi email. Data ini akan digunakan AI untuk menyapa
            dan menandatangani balasan secara otomatis.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-card/40 p-10 rounded-xl border border-border/50 backdrop-blur-xl">
        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Data Personal
            </h4>
          </div>

          <div className="space-y-4">
            <div className="group">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                Nama Pengirim (Header)
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all group-focus-within:bg-foreground/10"
                placeholder="Contoh: Ahmad Fauzi"
                value={customSenderName}
                onChange={(e) => setCustomSenderName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                Nama Panggilan (Body)
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all focus:bg-foreground/10"
                placeholder="Contoh: Fauzi"
                value={customBodyName}
                onChange={(e) => setCustomBodyName(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Konfigurasi Tambahan
            </h4>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                Email Kantor
              </label>
              <input
                type="email"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all focus:bg-foreground/10"
                placeholder="fauzi@ojk.go.id"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                Kota Tugas
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all focus:bg-foreground/10"
                placeholder="Contoh: Jakarta"
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                Pola Penyebutan Nama Konsumen
              </label>
              <select
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium transition-all focus:bg-foreground/10"
                value={consumerNameMentionPattern}
                onChange={(e) => setConsumerNameMentionPattern(e.target.value as any)}
              >
                <option value="random">Acak</option>
                <option value="upfront">Nama disebut di awal</option>
                <option value="middle">Nama disebut di tengah</option>
                <option value="late">Nama disebut di akhir</option>
                <option value="none">Tidak menyebut nama</option>
              </select>
              <p className="mt-2 ml-2 text-xs text-muted-foreground font-medium leading-relaxed">
                Mengatur kapan nama konsumen boleh muncul di email
                awal simulasi.
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-2 pt-10 border-t border-border/50 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-base tracking-tight">
                  Hapus Semua Data
                </h4>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Kembalikan semua skenario dan karakter ke bawaan
                  sistem.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-8 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-[10px] font-medium uppercase tracking-widest transition-all border border-red-500/20 shadow-lg shadow-red-500/5"
            >
              Reset Module PDKT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
