import { motion, useReducedMotion } from "framer-motion";

export function TelefunMotionFrame() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="relative flex h-full min-h-[380px] items-center justify-center overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6 backdrop-blur-xl lg:min-h-[520px] lg:p-8 dark:from-violet-950/30 dark:via-card dark:to-indigo-950/20"
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-violet-200/40 blur-3xl dark:bg-violet-800/20" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-800/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-100/50 blur-2xl dark:bg-violet-900/10" />

      <motion.div
        animate={shouldReduceMotion ? undefined : { y: [-6, 6, -6] }}
        transition={shouldReduceMotion ? undefined : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <motion.div
          animate={shouldReduceMotion ? undefined : { rotate: [-2.5, -4, -2.5] }}
          transition={shouldReduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
          style={{ rotate: "-3deg" }}
        >
          <div className="absolute bottom-0 left-1/2 h-6 w-[180px] -translate-x-1/2 rounded-full bg-black/10 blur-xl" />
          <div className="relative flex h-[448px] w-[250px] flex-col rounded-[2.2rem] border-[7px] border-slate-900 bg-slate-900 p-1.5 shadow-2xl shadow-black/20 sm:h-[468px] sm:w-[268px]">
            <div className="absolute left-1/2 top-0 z-20 h-5 w-20 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="absolute left-1/2 top-2 z-20 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-700" />

            {/* iPhone / Samsung caller screen - plek */}
            <div className="flex h-full flex-col overflow-hidden rounded-[1.9rem] bg-[#0a0a14]">
              {/* wallpaper blur */}
              <div className="pointer-events-none absolute inset-[7px] overflow-hidden rounded-[1.9rem]">
                <div className="absolute inset-0 bg-gradient-to-b from-[#1e1238] via-[#1a1030] to-[#0f0a1e]" />
                <div className="absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-violet-600/25 blur-3xl" />
                <div className="absolute bottom-20 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-indigo-600/15 blur-2xl" />
              </div>

              <div className="relative flex h-full flex-col">
                {/* status bar - iPhone style */}
                <div className="flex items-center justify-between px-5 pt-3.5">
                  <span className="text-[11px] font-semibold tabular-nums text-white">09:41</span>
                  <div className="flex items-center gap-1">
                    <span className="flex gap-[2px]">
                      <span className="h-[7px] w-[2.5px] rounded-full bg-white" />
                      <span className="h-[7px] w-[2.5px] rounded-full bg-white" />
                      <span className="h-[7px] w-[2.5px] rounded-full bg-white" />
                      <span className="h-[7px] w-[2.5px] rounded-full bg-white/35" />
                    </span>
                    <svg width="14" height="8" viewBox="0 0 14 8" fill="none" className="ml-1"><path d="M1 4h3M5 2.5h3M9 1h3" stroke="white" strokeWidth="1.1" strokeLinecap="round"/></svg>
                    <div className="ml-1 flex h-[10px] w-[18px] items-center rounded-[3px] border border-white/40 p-[1.5px]">
                      <div className="h-full w-[72%] rounded-[1.5px] bg-white" />
                    </div>
                  </div>
                </div>

                {/* caller */}
                <div className="flex flex-1 flex-col items-center px-5 pt-5">
                  <motion.p
                    initial={shouldReduceMotion ? undefined : { opacity: 0, y: 4 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? undefined : { delay: 0.15, duration: 0.3 }}
                    className="text-[11px] font-medium tracking-wide text-white/55"
                  >
                    Kontak OJK 157
                  </motion.p>

                  <motion.div
                    initial={shouldReduceMotion ? undefined : { scale: 0.9, opacity: 0 }}
                    animate={shouldReduceMotion ? undefined : { scale: 1, opacity: 1 }}
                    transition={shouldReduceMotion ? undefined : { delay: 0.2, duration: 0.35 }}
                    className="relative mt-3"
                  >
                    <motion.div
                      animate={shouldReduceMotion ? undefined : { scale: [1, 1.2, 1], opacity: [0.18, 0, 0.18] }}
                      transition={shouldReduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                      className="pointer-events-none absolute inset-0 rounded-full border border-white/15"
                      style={{ margin: -8 }}
                    />
                    <motion.div
                      animate={shouldReduceMotion ? undefined : { scale: [1, 1.35, 1], opacity: [0.1, 0, 0.1] }}
                      transition={shouldReduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                      className="pointer-events-none absolute inset-0 rounded-full border border-white/10"
                      style={{ margin: -16 }}
                    />
                    <div className="relative flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 shadow-2xl shadow-black/30 ring-1 ring-white/10">
                      <span className="text-[24px] font-semibold tracking-tight text-white">157</span>
                    </div>
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white shadow-md ring-2 ring-[#0a0a14]">HD</span>
                  </motion.div>

                  <motion.p
                    animate={shouldReduceMotion ? undefined : { opacity: [0.9, 1, 0.9] }}
                    transition={shouldReduceMotion ? undefined : { duration: 1.2, repeat: Infinity }}
                    className="mt-2 text-center text-[13px] font-medium tabular-nums tracking-wide text-white/90"
                  >
                    00:24
                  </motion.p>
                </div>

                {/* controls - iOS style 6 buttons */}
                <div className="px-5 pb-3 pt-1">
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
                    {[
                      { k: "mute", label: "bisukan", icon: (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3z" fill="white"/><path d="M19 10a7 7 0 01-14 0" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/><path d="M12 17v3M8 21h8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      )},
                      { k: "keypad", label: "papan tombol", icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="7" cy="7" r="1.6" fill="white"/><circle cx="12" cy="7" r="1.6" fill="white"/><circle cx="17" cy="7" r="1.6" fill="white"/><circle cx="7" cy="12" r="1.6" fill="white"/><circle cx="12" cy="12" r="1.6" fill="white"/><circle cx="17" cy="12" r="1.6" fill="white"/><circle cx="7" cy="17" r="1.6" fill="white"/><circle cx="12" cy="17" r="1.6" fill="white"/><circle cx="17" cy="17" r="1.6" fill="white"/></svg>
                      )},
                      { k: "speaker", label: "speaker", icon: (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="white"/><path d="M15 9a5 5 0 010 6M17.5 7a8 8 0 010 10" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none"/></svg>
                      )},
                      { k: "add", label: "tambah", icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="1.9" strokeLinecap="round"/></svg>
                      )},
                      { k: "facetime", label: "FaceTime", icon: (
                        <svg width="18" height="13" viewBox="0 0 24 16" fill="none"><rect x="2" y="2" width="14" height="12" rx="2" fill="white"/><path d="M16 5l5-2v10l-5-2z" fill="white"/></svg>
                      )},
                      { k: "contacts", label: "kontak", icon: (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.3" fill="white"/><path d="M5 19c0-3 2.7-5 7-5s7 2 7 5v1H5z" fill="white"/></svg>
                      )},
                    ].map((b) => (
                      <div key={b.k} className="flex flex-col items-center gap-1.5">
                        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white/14 backdrop-blur">
                          {b.icon}
                        </div>
                        <span className="text-center text-[10px] font-normal leading-none text-white/85">{b.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col items-center justify-center gap-1">
                    <motion.button
                      type="button"
                      tabIndex={-1}
                      animate={shouldReduceMotion ? undefined : { scale: [1, 1.02, 1] }}
                      transition={shouldReduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-lg shadow-black/20"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12 1.33.43 2.62.92 3.84a2 2 0 01-.58 2.11l-1.27 1.27a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.58c1.22.49 2.5.8 3.85.92A2 2 0 0122 16.92z" fill="white" transform="rotate(135 12 12)"/>
                      </svg>
                    </motion.button>
                    <span className="text-[10px] font-medium text-white/85">akhiri</span>
                  </div>
                </div>

                <div className="flex justify-center pb-2 pt-1">
                  <div className="h-1 w-[96px] rounded-full bg-white" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
