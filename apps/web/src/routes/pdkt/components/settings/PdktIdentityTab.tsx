import React from "react";
import { User, Settings, Trash2 } from "lucide-react";

type ConsumerNameMentionPattern = "random" | "upfront" | "middle" | "late" | "none";

interface PdktIdentityTabProps {
  customSenderName: string;
  setCustomSenderName: (val: string) => void;
  customBodyName: string;
  setCustomBodyName: (val: string) => void;
  customEmail: string;
  setCustomEmail: (val: string) => void;
  customCity: string;
  setCustomCity: (val: string) => void;
  consumerNameMentionPattern: ConsumerNameMentionPattern;
  setConsumerNameMentionPattern: (val: ConsumerNameMentionPattern) => void;
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
    <div className="space-y-6 mt-4">
      {/* Header Banner */}
      <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
        <div className="absolute top-1/2 -translate-y-1/2 right-4 text-primary/5 group-hover:scale-110 transition-transform pointer-events-none">
          <User className="w-24 h-24" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h3 className="text-sm font-bold text-foreground tracking-tight mb-0.5">
            Personalisasi Identitas
          </h3>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Atur detail identitas Anda yang akan muncul dalam simulasi email. Data ini akan digunakan AI untuk menyapa dan menandatangani balasan secara otomatis.
          </p>
        </div>
      </div>

      {/* Grid Inputs Group */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/10 p-5 rounded-xl border border-border/40">
        {/* Personal Data */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Data Personal
            </h4>
          </div>

          <div className="space-y-3">
            <div className="group">
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Nama Pengirim (Header)
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium placeholder:text-muted-foreground/30 transition-all"
                placeholder="Contoh: Ahmad Fauzi"
                value={customSenderName}
                onChange={(e) => setCustomSenderName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Nama Panggilan (Body)
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium placeholder:text-muted-foreground/30 transition-all"
                placeholder="Contoh: Fauzi"
                value={customBodyName}
                onChange={(e) => setCustomBodyName(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Additional Config */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Settings className="w-4 h-4 text-primary" />
            </div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Konfigurasi Tambahan
            </h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Email Kantor
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium placeholder:text-muted-foreground/30 transition-all"
                placeholder="fauzi@ojk.go.id"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Kota Tugas
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium placeholder:text-muted-foreground/30 transition-all"
                placeholder="Contoh: Jakarta"
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Pola Penyebutan Nama Konsumen
              </label>
              <div className="relative">
                <select
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium transition-all appearance-none cursor-pointer"
                  value={consumerNameMentionPattern}
                  onChange={(e) =>
                    setConsumerNameMentionPattern(
                      e.target.value as ConsumerNameMentionPattern,
                    )
                  }
                >
                  <option value="random">Acak</option>
                  <option value="upfront">Nama disebut di awal</option>
                  <option value="middle">Nama disebut di tengah</option>
                  <option value="late">Nama disebut di akhir</option>
                  <option value="none">Tidak menyebut nama</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg
                    width="8"
                    height="5"
                    viewBox="0 0 10 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              <p className="mt-1.5 ml-1 text-[10px] text-muted-foreground font-medium leading-relaxed">
                Mengatur kapan nama konsumen boleh muncul di email awal simulasi.
              </p>
            </div>
          </div>
        </div>

        {/* Reset Module PDKT Section */}
        <div className="col-span-1 md:col-span-2 pt-5 border-t border-border/40 mt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-sm tracking-tight">
                  Hapus Semua Data
                </h4>
                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                  Kembalikan semua skenario dan karakter ke bawaan sistem.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg text-xs font-semibold transition-all border border-red-500/20 cursor-pointer shadow-sm"
            >
              Reset Module PDKT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
