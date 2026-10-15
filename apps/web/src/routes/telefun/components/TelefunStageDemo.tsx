import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import "./TelefunStageDemo.css";

const ASPECTS = [
  { label: "Artikulasi", value: 8.8, color: "bg-chart-green" },
  { label: "Filler", value: 5.2, color: "bg-chart-orange" },
] as const;

const WAVE_BARS = [30, 60, 85, 45, 60, 30, 85, 60, 45, 30, 60, 85, 45, 60];

/**
 * Ilustrasi alur Telefun di halaman awal: konsumen bicara, transkrip muncul,
 * panggilan diakhiri, lalu hasil telaah suara naik dari bawah dan filler
 * tersorot. Isinya contoh (`aria-hidden`); yang dibaca pembaca layar adalah
 * `figcaption`. Animasi berulang, jadi ada tombol jeda.
 */
export function TelefunStageDemo() {
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <figure
      data-testid="telefun-stage-demo"
      data-paused={paused}
      data-static={paused || Boolean(reduceMotion)}
      className="telefun-demo m-0 w-full min-w-0"
    >
      <figcaption className="sr-only">
        Contoh latihan Telefun: konsumen menelepon, agen menjawab, panggilan
        diakhiri, lalu hasil telaah suara muncul dan filler disorot.
      </figcaption>
      <div className="relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface-elevated pr-1 pl-4">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-module-telefun/10 text-xs font-bold text-foreground"
          >
            RS
          </span>
          <span
            aria-hidden="true"
            className="flex-1 text-[13px] font-semibold text-foreground"
          >
            Rina Susanti{" "}
            <span className="font-normal text-muted-foreground">· 02.14</span>
          </span>
          <span
            aria-hidden="true"
            className="relative inline-grid text-xs font-semibold"
          >
            <span
              data-anim="label-call"
              className="col-start-1 row-start-1 rounded-full bg-foreground px-2.5 py-0.5 text-center text-background"
            >
              Panggilan
            </span>
            <span
              data-anim="label-telaah"
              className="col-start-1 row-start-1 rounded-full bg-foreground px-2.5 py-0.5 text-center text-background"
            >
              Telaah
            </span>
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

        <div
          aria-hidden="true"
          className="flex min-h-0 flex-1 flex-col items-center gap-3 px-4 pt-5 pb-40 text-[13px] leading-5"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-module-telefun/10 font-display text-lg font-bold text-foreground">
            RS
          </span>
          <span data-anim="wave" className="flex h-8 items-center gap-[3px]">
            {WAVE_BARS.map((height, index) => (
              <i
                key={index}
                className="telefun-demo-bar block w-1 rounded-full bg-module-telefun"
                style={{
                  height: `${height}%`,
                  animationDelay: `${(index % 4) * 0.2}s`,
                }}
              />
            ))}
          </span>
          <div className="flex w-full flex-col gap-1.5">
            <p
              data-anim="l1"
              className="grid grid-cols-[40px_1fr] gap-2 text-fg2"
            >
              <span className="font-mono text-xs text-muted-foreground">
                00.04
              </span>
              Halo, kok klaim asuransi saya ditolak?
            </p>
            <p
              data-anim="l2"
              className="grid grid-cols-[40px_1fr] gap-2 text-foreground"
            >
              <span className="font-mono text-xs text-muted-foreground">
                00.11
              </span>
              Selamat siang Ibu, dengan Kontak OJK 157.
            </p>
            <p
              data-anim="l3"
              className="grid grid-cols-[40px_1fr] gap-2 text-foreground"
            >
              <span className="font-mono text-xs text-muted-foreground">
                00.36
              </span>
              <span>
                <span data-anim="mark" className="telefun-demo-mark">
                  Eee
                </span>
                , baik Bu, saya cek dulu ya.
              </span>
            </p>
          </div>
          <span data-anim="end" className="text-xs text-muted-foreground">
            Panggilan diakhiri · 4 mnt 12 dtk
          </span>
        </div>

        <div
          aria-hidden="true"
          data-anim="review"
          className="absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-border bg-surface-elevated px-4 py-3"
        >
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-[28px] leading-none font-extrabold tracking-tight text-foreground">
              7,6
            </span>
            <span className="text-xs text-muted-foreground">
              dari 10 · telaah suara
            </span>
          </p>
          {ASPECTS.map((aspect) => (
            <span
              key={aspect.label}
              className="grid grid-cols-[88px_1fr_28px] items-center gap-2 text-xs text-fg2"
            >
              {aspect.label}
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  data-anim="bar"
                  className={`block h-full origin-left rounded-full ${aspect.color}`}
                  style={{ width: `${aspect.value * 10}%` }}
                />
              </span>
              <span className="text-right font-mono font-bold text-foreground">
                {String(aspect.value).replace(".", ",")}
              </span>
            </span>
          ))}
          <span className="text-xs text-foreground">
            7 filler, terbanyak &ldquo;eee&rdquo;. Coba jeda singkat sebelum
            menjawab.
          </span>
        </div>
      </div>
    </figure>
  );
}
