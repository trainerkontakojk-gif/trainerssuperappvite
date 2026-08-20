import { motion, useReducedMotion } from "framer-motion";

export function KetikMotionFrame() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="relative flex h-full min-h-[380px] items-center justify-center overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 backdrop-blur-xl lg:min-h-[520px] lg:p-8 dark:from-emerald-950/30 dark:via-card dark:to-teal-950/20"
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-800/20" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-teal-200/30 blur-3xl dark:bg-teal-800/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/50 blur-2xl dark:bg-emerald-900/10" />

      <motion.div
        animate={shouldReduceMotion ? undefined : { y: [-6, 6, -6] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
        }
        className="relative"
      >
        {/* HP miring */}
        <motion.div
          animate={
            shouldReduceMotion ? undefined : { rotate: [-2.5, -4, -2.5] }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }
          className="relative"
          style={{ rotate: "-3deg" }}
        >
          {/* shadow bawah HP */}
          <div className="absolute bottom-0 left-1/2 h-6 w-[180px] -translate-x-1/2 rounded-full bg-black/10 blur-xl" />

          {/* body HP */}
          <div className="relative flex h-[420px] w-[244px] flex-col rounded-[2.2rem] border-[7px] border-slate-900 bg-slate-900 p-2 shadow-2xl shadow-black/20 sm:h-[440px] sm:w-[260px]">
            {/* notch */}
            <div className="absolute left-1/2 top-0 z-20 h-5 w-20 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            {/* speaker */}
            <div className="absolute left-1/2 top-2 z-20 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-700" />

            {/* layar */}
            <div className="flex h-full flex-col overflow-hidden rounded-[1.7rem] bg-[#f8fafc]">
              {/* header chat */}
              <div className="flex items-center gap-2.5 bg-white px-3.5 py-3 shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                  OJK
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold leading-none text-slate-900">
                    Kontak OJK 157
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-none text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Online
                  </p>
                </div>
                <span className="text-[10px] text-slate-400">09:41</span>
              </div>

              {/* area chat */}
              <div className="flex-1 space-y-3 overflow-hidden bg-[#eef2f7] px-3 py-4">
                <p className="text-center text-[9px] font-medium uppercase tracking-widest text-slate-400">
                  Hari ini
                </p>

                {/* bubble Rojak - kanan */}
                <motion.div
                  initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={shouldReduceMotion ? undefined : { delay: 0.3, duration: 0.4 }}
                  className="flex justify-end"
                >
                  <div className="max-w-[86%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2.5 shadow-sm">
                    <p className="text-[11px] leading-relaxed text-white">
                      Anda telah terhubung dengan Layanan Kontak OJK 157. Selamat pagi. Saya
                      <span className="font-semibold text-white"> Rojak</span> dengan senang hati
                      memberikan informasi yang Bapak/Ibu butuhkan seputar Sektor Jasa Keuangan.
                      Perihal apa yang dapat kami bantu?
                    </p>
                    <p className="mt-1 flex items-center justify-end gap-1 text-right text-[9px] text-emerald-100">
                      09:41 <span className="text-[10px]">✓✓</span>
                    </p>
                  </div>
                </motion.div>

                {/* bubble konsumen - kiri */}
                <motion.div
                  initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={shouldReduceMotion ? undefined : { delay: 0.7, duration: 0.4 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm">
                    <p className="text-[11px] leading-relaxed text-slate-700">
                      Pagi kak Rojak, saya butuh bantuan terkait pinjaman online saya. Saya
                      tiba-tiba ditagih padahal sudah lunas.
                    </p>
                    <p className="mt-1 text-right text-[9px] text-slate-400">09:42</p>
                  </div>
                </motion.div>

                {/* typing indicator - Rojak lagi ngetik */}
                <motion.div
                  initial={shouldReduceMotion ? undefined : { opacity: 0 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1 }}
                  transition={shouldReduceMotion ? undefined : { delay: 1.1, duration: 0.3 }}
                  className="flex justify-end"
                >
                  <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-2 shadow-sm">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                  </div>
                </motion.div>
              </div>

              {/* input bar */}
              <div className="flex items-center gap-2 bg-white px-3 py-2.5">
                <div className="flex flex-1 items-center rounded-full bg-slate-100 px-3.5 py-2">
                  <span className="text-[11px] text-slate-400">Ketik pesan...</span>
                  <motion.span
                    animate={shouldReduceMotion ? undefined : { opacity: [1, 0, 1] }}
                    transition={
                      shouldReduceMotion ? undefined : { duration: 0.9, repeat: Infinity }
                    }
                    className="ml-0.5 text-slate-400"
                  >
                    |
                  </motion.span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M22 2L11 13"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M22 2L15 22L11 13L2 9L22 2Z"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* home indicator */}
              <div className="flex justify-center bg-white pb-2 pt-1">
                <div className="h-1 w-12 rounded-full bg-slate-300" />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
