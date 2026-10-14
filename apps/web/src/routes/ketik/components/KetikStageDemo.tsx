import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import "./KetikStageDemo.css";

const ASPECTS = [
  { label: "Empati", value: 86, color: "bg-chart-green" },
  { label: "Resolusi", value: 58, color: "bg-chart-orange" },
] as const;

function Typing({ anim }: { anim: string }) {
  return (
    <span
      data-anim={anim}
      className="ketik-demo-typing self-start rounded-2xl rounded-tl-sm border border-border bg-surface-elevated px-3"
    >
      <span className="flex gap-1">
        <i className="size-1.5 rounded-full bg-muted-foreground" />
        <i className="size-1.5 rounded-full bg-muted-foreground" />
        <i className="size-1.5 rounded-full bg-muted-foreground" />
      </span>
    </span>
  );
}

/**
 * Ilustrasi alur KETIK di halaman awal: chat konsumen masuk, agen membalas,
 * chat diakhiri, lalu hasil telaah naik dari bawah dan kata yang salah eja
 * tersorot. Isinya contoh (`aria-hidden`); yang dibaca pembaca layar adalah
 * `figcaption`. Animasi berulang, jadi ada tombol jeda.
 */
export function KetikStageDemo() {
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <figure
      data-testid="ketik-stage-demo"
      data-paused={paused}
      data-static={paused || Boolean(reduceMotion)}
      className="ketik-demo m-0 w-full min-w-0"
    >
      <figcaption className="sr-only">
        Contoh latihan KETIK: konsumen mengirim chat, agen membalas, lalu
        setelah chat diakhiri AI menelaah balasan dan menandai kata yang salah
        eja.
      </figcaption>
      <div className="relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface-elevated pr-1 pl-4">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-module-ketik/10 text-xs font-bold text-foreground"
          >
            BH
          </span>
          <span
            aria-hidden="true"
            className="flex-1 text-[13px] font-semibold text-foreground"
          >
            Budi Hartono
          </span>
          <span
            aria-hidden="true"
            className="relative inline-grid text-xs font-semibold"
          >
            <span
              data-anim="label-chat"
              className="col-start-1 row-start-1 rounded-full bg-foreground px-2.5 py-0.5 text-center text-background"
            >
              Chat
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
          className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-4 pb-40 text-[13px] leading-5"
        >
          <p
            data-anim="c1"
            className="max-w-[80%] self-start rounded-2xl rounded-tl-sm border border-border bg-surface-elevated px-3 py-2 text-foreground"
          >
            Saya diteror penagih pinjol, padahal ga pernah pinjem
          </p>
          <Typing anim="t1" />
          <p
            data-anim="a1"
            className="max-w-[80%] self-end rounded-2xl rounded-tr-sm bg-module-ketik px-3 py-2 text-module-ketik-foreground"
          >
            Mohon maaf atas ketidaknyamanannya, Bapak. Saya bantu cek ya.
          </p>
          <Typing anim="t2" />
          <p
            data-anim="c2"
            className="max-w-[80%] self-start rounded-2xl rounded-tl-sm border border-border bg-surface-elevated px-3 py-2 text-foreground"
          >
            Namanya DanaKilat, nomornya ganti tiap hari
          </p>
          <p
            data-anim="a2"
            className="max-w-[80%] self-end rounded-2xl rounded-tr-sm bg-module-ketik px-3 py-2 text-module-ketik-foreground"
          >
            Boleh saya tahu sejak kapan{" "}
            <span data-anim="mark" className="ketik-demo-mark">
              pinjamanya
            </span>{" "}
            muncul?
          </p>
          <span
            data-anim="end"
            className="self-center text-xs text-muted-foreground"
          >
            Chat diakhiri
          </span>
        </div>

        <div
          aria-hidden="true"
          data-anim="review"
          className="absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-border bg-surface-elevated px-4 py-3"
        >
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-[28px] leading-none font-extrabold tracking-tight text-foreground">
              74
            </span>
            <span className="text-xs text-muted-foreground">
              Skor akhir · telaah AI
            </span>
          </p>
          {ASPECTS.map((aspect) => (
            <span
              key={aspect.label}
              className="grid grid-cols-[72px_1fr_28px] items-center gap-2 text-xs text-fg2"
            >
              {aspect.label}
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  data-anim="bar"
                  className={`block h-full origin-left rounded-full ${aspect.color}`}
                  style={{ width: `${aspect.value}%` }}
                />
              </span>
              <span className="text-right font-mono font-bold text-foreground">
                {aspect.value}
              </span>
            </span>
          ))}
          <span className="text-xs text-foreground">
            Pesan 4: &ldquo;pinjamanya&rdquo; →{" "}
            <strong className="font-semibold">&ldquo;pinjamannya&rdquo;</strong>
          </span>
        </div>
      </div>
    </figure>
  );
}
