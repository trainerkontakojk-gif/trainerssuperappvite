import { Check } from "lucide-react";

const pill =
  "inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-medium";
const marker =
  "inline-flex size-5 items-center justify-center rounded-full text-[12px] font-bold";

/**
 * Navigasi tahap KETIK di halaman Telaah: Chat sudah selesai, Telaah aktif.
 * Selama chat berjalan navigasi ini sengaja tidak tampil, supaya peserta tidak
 * melihat apa pun tentang alur penilaian.
 */
export function KetikStageNav() {
  return (
    <nav aria-label="Tahap latihan">
      <ol className="flex items-center gap-2">
        <li>
          <span className={`${pill} border border-border text-fg2`}>
            <span
              aria-hidden="true"
              className={`${marker} bg-muted text-foreground`}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            Chat
            <span className="sr-only"> (selesai)</span>
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-px w-5 bg-border max-sm:hidden"
          />
          <span
            aria-current="step"
            className={`${pill} bg-foreground font-semibold text-background`}
          >
            <span
              aria-hidden="true"
              className={`${marker} bg-background text-foreground`}
            >
              2
            </span>
            Telaah
          </span>
        </li>
      </ol>
    </nav>
  );
}
