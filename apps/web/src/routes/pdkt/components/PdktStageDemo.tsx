import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Lightbulb, Mail, Pause, Play, Reply, Send } from "lucide-react";
import "./PdktStageDemo.css";

const STAGES = [
  { anim: "tab-a", number: "01", label: "Pahami" },
  { anim: "tab-b", number: "02", label: "Tanggapi" },
  { anim: "tab-c", number: "03", label: "Telaah" },
] as const;

const BARS = [
  { label: "Kejelasan", value: 90, color: "bg-foreground/70" },
  { label: "Kualitas OJK", value: 64, color: "bg-chart-orange" },
  { label: "Ejaan", value: 92, color: "bg-foreground/70" },
] as const;

/**
 * Ilustrasi alur PDKT di halaman awal: email masuk dibaca, balasan ditulis,
 * lalu hasil telaah muncul. Isinya contoh (`aria-hidden`); yang dibaca pembaca
 * layar adalah `figcaption`. Animasi berulang, jadi ada tombol jeda.
 */
export function PdktStageDemo() {
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <figure
      data-testid="pdkt-stage-demo"
      data-paused={paused}
      data-static={paused || Boolean(reduceMotion)}
      className="pdkt-demo m-0 w-full min-w-0"
    >
      <figcaption className="sr-only">
        Contoh tiga tahap PDKT: email konsumen dibaca, balasan ditulis lalu
        dikirim, kemudian hasil telaah AI muncul.
      </figcaption>
      <div className="flex h-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-background pl-4 pr-1">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </span>
          <span className="flex-1 text-center text-xs font-medium text-muted-foreground">
            Kotak masuk PDKT
          </span>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? "Putar animasi" : "Jeda animasi"}
            className="flex size-[44px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            {paused ? (
              <Play aria-hidden="true" className="size-4" />
            ) : (
              <Pause aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>

        <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex h-11 shrink-0 border-b border-border text-[13px] font-semibold">
            {STAGES.map((stage) => (
              <span
                key={stage.anim}
                data-anim={stage.anim}
                className="flex flex-1 items-center justify-center gap-2 text-foreground"
              >
                <span className="font-mono text-xs">{stage.number}</span>
                {stage.label}
              </span>
            ))}
            <span className="absolute bottom-[-1px] left-0 h-0.5 w-1/3">
              <span
                data-anim="indicator"
                className="block h-0.5 w-full bg-module-pdkt"
              />
            </span>
          </div>

          <div className="relative min-h-0 flex-1 text-sm">
            <div
              data-anim="stage-a"
              className="absolute inset-0 flex flex-col gap-4 px-7 py-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[13px] font-bold text-foreground/80">
                  BS
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-foreground">
                    Budi Santoso
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Baru saja
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-module-pdkt/10 px-2.5 py-0.5 text-xs font-semibold text-module-pdkt">
                  <Mail className="size-3.5" />
                  Email baru
                </span>
              </div>
              <span
                data-anim="line"
                className="font-display text-xl leading-7 font-bold tracking-tight text-foreground"
              >
                Pinjaman sudah lunas, kenapa masih ditagih?
              </span>
              <p className="m-0 flex flex-col leading-6 text-foreground/85">
                <span data-anim="line">
                  Saya sudah{" "}
                  <span data-anim="highlight">
                    melunasi pinjaman sejak 2 September
                  </span>
                  , tetapi sampai hari ini
                </span>
                <span data-anim="line">
                  penagih masih menelepon setiap hari.{" "}
                  <span data-anim="highlight">
                    Tolong perbaiki status pinjaman saya.
                  </span>
                </span>
              </p>
              <span data-anim="line" className="text-foreground/85">
                Salam, Budi
              </span>
            </div>

            <div data-anim="stage-b" className="absolute inset-0 flex flex-col">
              <div className="flex flex-col gap-0.5 border-b border-border px-7 py-3.5 text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Reply className="size-3.5 text-module-pdkt" />
                  Membalas Budi Santoso
                </span>
                <span className="font-semibold text-foreground">
                  Re: Pinjaman sudah lunas, kenapa masih ditagih?
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 overflow-hidden px-7 py-5 leading-6 text-foreground">
                <span data-anim="type-1" className="whitespace-nowrap">
                  Bapak Budi yang kami hormati,
                </span>
                <span data-anim="type-2" className="whitespace-nowrap">
                  terima kasih sudah menyampaikan masalah ini.
                </span>
                <span data-anim="type-3" className="whitespace-nowrap">
                  Kami mengerti tagihan tersebut sangat mengganggu.
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border px-7 py-3">
                <span className="text-xs text-muted-foreground">
                  Ditulis sendiri, tanpa templat
                </span>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">
                  Kirim balasan
                  <Send className="size-3.5" />
                </span>
              </div>
            </div>

            <div
              data-anim="stage-c"
              className="absolute inset-0 flex flex-col gap-4 px-7 py-5"
            >
              <div className="flex items-center gap-6">
                <div className="relative size-[88px] shrink-0">
                  <svg width="88" height="88" viewBox="0 0 104 104">
                    <circle
                      cx="52"
                      cy="52"
                      r="42"
                      fill="none"
                      stroke="var(--demo-track)"
                      strokeWidth="9"
                    />
                    <circle
                      data-anim="ring"
                      cx="52"
                      cy="52"
                      r="42"
                      fill="none"
                      stroke="var(--demo-accent)"
                      strokeWidth="9"
                      strokeLinecap="round"
                      transform="rotate(-90 52 52)"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold text-foreground">
                    82
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Hasil telaah AI
                  </span>
                  <span className="font-display text-xl leading-7 font-bold tracking-tight text-foreground">
                    Sudah baik, tinggal dipertajam.
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 text-xs">
                {BARS.map((bar) => (
                  <div key={bar.label} className="flex items-center gap-3">
                    <span className="w-[104px] text-foreground/80">
                      {bar.label}
                    </span>
                    <span className="h-2 flex-1 rounded-full bg-surface-sunken">
                      <span
                        data-anim="bar"
                        className={`block h-2 rounded-full ${bar.color}`}
                        style={{ width: `${bar.value}%` }}
                      />
                    </span>
                    <span className="w-6 text-right font-mono font-bold text-foreground">
                      {bar.value}
                    </span>
                  </div>
                ))}
              </div>
              <div
                data-anim="tip"
                className="flex gap-2.5 rounded-lg border border-chart-orange/40 bg-chart-orange/10 px-3.5 py-3 text-xs leading-[18px] text-foreground"
              >
                <Lightbulb className="mt-px size-4 shrink-0 text-chart-orange" />
                <span>
                  <strong>Saran:</strong> sampaikan kapan status pinjaman
                  diperbarui, supaya konsumen tahu harus menunggu sampai kapan.
                </span>
              </div>
            </div>
          </div>

          <div className="relative h-10 shrink-0 border-t border-border bg-background text-xs text-foreground/80">
            <span
              data-anim="cap-a"
              className="absolute inset-0 flex items-center px-7"
            >
              Baca sampai tuntas. Temukan inti keluhannya sendiri.
            </span>
            <span
              data-anim="cap-b"
              className="absolute inset-0 flex items-center px-7"
            >
              Tulis balasan dengan kata-kata Anda sendiri.
            </span>
            <span
              data-anim="cap-c"
              className="absolute inset-0 flex items-center px-7"
            >
              Lihat skor dan apa yang bisa dibuat lebih baik.
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
