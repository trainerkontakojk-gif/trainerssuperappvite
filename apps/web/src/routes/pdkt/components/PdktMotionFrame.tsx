import { motion, useReducedMotion } from "framer-motion";

export function PdktMotionFrame() {
  const shouldReduceMotion = useReducedMotion();

  const emails = [
    {
      id: 1,
      initial: "BR",
      color: "bg-violet-600",
      sender: "Budi Raharjo",
      time: "09:41",
      subject: "Keluhan tagihan kartu kredit",
      preview: "Saya ditagih biaya tahunan padahal sudah tutup kartu...",
      unread: true,
    },
    {
      id: 2,
      initial: "SA",
      color: "bg-emerald-600",
      sender: "Siti Aminah",
      time: "09:28",
      subject: "Permohonan restrukturisasi",
      preview: "Mohon bantuan penjadwalan ulang cicilan KPR saya...",
      unread: true,
    },
    {
      id: 3,
      initial: "AP",
      color: "bg-amber-600",
      sender: "Andi Pratama",
      time: "Kemarin",
      subject: "Dugaan investasi bodong",
      preview: "Saya tertipu investasi dengan imbal hasil tidak wajar...",
      unread: false,
    },
  ];

  return (
    <div
      aria-hidden="true"
      className="relative flex h-full min-h-[380px] items-center justify-center overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-br from-purple-50 via-white to-violet-50 p-6 backdrop-blur-xl lg:min-h-[520px] lg:p-8 dark:from-purple-950/30 dark:via-card dark:to-violet-950/20"
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-800/20" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-violet-200/30 blur-3xl dark:bg-violet-800/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-100/50 blur-2xl dark:bg-purple-900/10" />

      <motion.div
        animate={shouldReduceMotion ? undefined : { y: [-6, 6, -6] }}
        transition={
          shouldReduceMotion ? undefined : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
        }
        className="relative"
      >
        <motion.div
          animate={shouldReduceMotion ? undefined : { rotate: [-2.5, -4, -2.5] }}
          transition={
            shouldReduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }
          className="relative"
          style={{ rotate: "-3deg" }}
        >
          <div className="absolute bottom-0 left-1/2 h-6 w-[180px] -translate-x-1/2 rounded-full bg-black/10 blur-xl" />

          <div className="relative flex h-[440px] w-[244px] flex-col rounded-[2.2rem] border-[7px] border-slate-900 bg-slate-900 p-2 shadow-2xl shadow-black/20 sm:h-[460px] sm:w-[260px]">
            <div className="absolute left-1/2 top-0 z-20 h-5 w-20 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="absolute left-1/2 top-2 z-20 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-700" />

            {/* layar email */}
            <div className="flex h-full flex-col overflow-hidden rounded-[1.7rem] bg-[#f8fafc]">
              {/* status bar tipis */}
              <div className="flex items-center justify-between bg-white px-3.5 py-1.5">
                <span className="text-[10px] font-semibold tabular-nums text-slate-900">09:41</span>
                <div className="flex items-center gap-1">
                  <span className="flex gap-[2px]">
                    <span className="h-[6px] w-[2px] rounded-full bg-slate-900" />
                    <span className="h-[6px] w-[2px] rounded-full bg-slate-900" />
                    <span className="h-[6px] w-[2px] rounded-full bg-slate-900" />
                    <span className="h-[6px] w-[2px] rounded-full bg-slate-300" />
                  </span>
                  <div className="ml-1 flex h-[9px] w-[16px] items-center rounded-[2px] border border-slate-300 p-[1px]">
                    <div className="h-full w-[68%] rounded-[1px] bg-slate-900" />
                  </div>
                </div>
              </div>

              {/* header inbox */}
              <div className="bg-white px-3.5 pb-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="1.7" />
                        <path d="M2.5 5l9.5 8 9.5-8" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold leading-none text-slate-900">Kotak Masuk</p>
                      <p className="mt-0.5 text-[10px] leading-none text-slate-500">konsumen@ojk.go.id</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                    3 baru
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                    <circle cx="11" cy="11" r="7" stroke="#94a3b8" strokeWidth="1.7" />
                    <path d="M16 16l4 4" stroke="#94a3b8" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <span className="text-[11px] text-slate-400">Cari email</span>
                </div>

                <div className="mt-2.5 flex gap-1.5">
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">Semua</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">Belum dibaca</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">Ditandai</span>
                </div>
              </div>

              {/* list email */}
              <div className="flex-1 overflow-hidden bg-[#eef2f7] px-2 py-2">
                <div className="space-y-2">
                  {emails.map((mail, idx) => (
                    <motion.div
                      key={mail.id}
                      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
                      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                      transition={shouldReduceMotion ? undefined : { delay: 0.2 + idx * 0.15, duration: 0.35 }}
                      className={`relative rounded-2xl border bg-white px-3 py-3 shadow-sm ${
                        mail.unread ? "border-purple-200" : "border-slate-100"
                      }`}
                    >
                      {mail.unread && (
                        <span className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-purple-600" />
                      )}
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${mail.color}`}
                        >
                          {mail.initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-semibold text-slate-900">{mail.sender}</p>
                            <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{mail.time}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] font-medium leading-none text-slate-700">
                            {mail.subject}
                          </p>
                          <p className="mt-1 line-clamp-1 text-[10px] leading-relaxed text-slate-500">
                            {mail.preview}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1 text-[9px] text-slate-400">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                              <path d="M4 8l8 6 8-6" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#94a3b8" strokeWidth="1.3" />
                            </svg>
                            <span className="truncate">Ke: konsumen@ojk.go.id</span>
                            {mail.unread && (
                              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-purple-600" aria-hidden />
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* indicator ngetik - konsumen sedang menulis balasan */}
                <motion.div
                  initial={shouldReduceMotion ? undefined : { opacity: 0 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1 }}
                  transition={shouldReduceMotion ? undefined : { delay: 0.95, duration: 0.3 }}
                  className="mt-3 flex justify-center"
                >
                  <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-sm">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                    <span className="ml-1 text-[9px] font-medium text-slate-500">memuat pratinjau...</span>
                  </div>
                </motion.div>
              </div>

              {/* bottom bar - compose */}
              <div className="flex items-center justify-between bg-white px-3 py-2.5">
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  3 email menunggu balasan
                </div>
                <div className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-purple-600 px-3 text-white shadow-md">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-[11px] font-semibold">Tulis</span>
                </div>
              </div>

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
