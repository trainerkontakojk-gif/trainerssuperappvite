import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const OJK_LOGO_URL = "https://ojk.go.id/SiteAssets/logo2.png?rev=44";
const WHATSAPP_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const DEMO_STEP_DURATIONS = [2200, 2300, 1200, 3000, 550] as const;

export function KetikMotionFrame() {
  const shouldReduceMotion = useReducedMotion();
  const [demoStep, setDemoStep] = useState(0);
  const [hasOjkLogo, setHasOjkLogo] = useState(true);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const stepDuration = DEMO_STEP_DURATIONS[demoStep];
    const timeoutId = window.setTimeout(() => {
      setDemoStep((currentStep) => (currentStep + 1) % 5);
    }, stepDuration);

    return () => window.clearTimeout(timeoutId);
  }, [demoStep, shouldReduceMotion]);

  const visibleStep = shouldReduceMotion ? 3 : demoStep;

  return (
    <div
      aria-hidden="true"
      className="relative flex h-full min-h-[380px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-module-ketik/5 p-6 lg:min-h-[520px] lg:p-8 dark:bg-module-ketik/10"
    >
      <motion.div
        animate={shouldReduceMotion ? undefined : { y: [-6, 6, -6] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
        }
        className="relative"
      >
        {/* Posisi HP dipertahankan seperti mockup sebelumnya. */}
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
          <div className="relative flex h-[420px] w-[244px] flex-col overflow-hidden rounded-[2rem] border-[7px] border-foreground bg-foreground p-2 shadow-xl shadow-black/20 sm:h-[440px] sm:w-[260px]">
            {/* notch */}
            <div className="absolute left-1/2 top-0 z-20 h-5 w-20 -translate-x-1/2 rounded-b-2xl bg-foreground" />
            {/* speaker */}
            <div className="absolute left-1/2 top-2 z-20 h-1 w-8 -translate-x-1/2 rounded-full bg-muted-foreground" />

            {/* layar */}
            <div className="flex h-full flex-col overflow-hidden rounded-[1.7rem] bg-background">
              {/* header chat */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-border/70 bg-card px-3.5 py-3">
                <div className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1">
                  {hasOjkLogo ? (
                    <img
                      src={OJK_LOGO_URL}
                      alt="Logo OJK"
                      className="max-h-full max-w-full object-contain"
                      decoding="async"
                      loading="eager"
                      onError={() => setHasOjkLogo(false)}
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-module-ketik">
                      OJK
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-none text-foreground">
                    Kontak OJK 157
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-none text-module-ketik">
                    <span className="h-1.5 w-1.5 rounded-full bg-module-ketik" />
                    Online
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">09:41</span>
              </div>

              {/* area chat */}
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/50 px-3 py-3">
                <p className="shrink-0 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Hari ini
                </p>

                <div className="relative min-h-0 flex-1 overflow-hidden pt-2">
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {visibleStep <= 3 && (
                        <motion.div
                          key="agent-intro"
                          layout="position"
                          initial={
                            shouldReduceMotion ? false : { opacity: 0, y: 10 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          exit={
                            shouldReduceMotion
                              ? undefined
                              : { opacity: 0, y: -6 }
                          }
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.36, ease: WHATSAPP_EASE }
                          }
                          className="flex justify-end"
                        >
                          <div className="max-w-[86%] rounded-2xl rounded-br-md bg-module-ketik px-3.5 py-2.5 shadow-sm">
                            <p className="text-[11px] leading-relaxed text-white">
                              Anda telah terhubung dengan Layanan Kontak OJK
                              157. Selamat pagi. Saya
                              <span className="font-semibold text-white">
                                {" "}
                                Rojak
                              </span>{" "}
                              dengan senang hati memberikan informasi yang
                              Bapak/Ibu butuhkan seputar Sektor Jasa Keuangan.
                              Perihal apa yang dapat kami bantu?
                            </p>
                            <p className="mt-1 flex items-center justify-end gap-1 text-right text-[9px] text-white/75">
                              09:41 <span className="text-[10px]">✓✓</span>
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {visibleStep >= 1 && visibleStep <= 3 && (
                        <motion.div
                          key="consumer-message"
                          layout="position"
                          initial={
                            shouldReduceMotion ? false : { opacity: 0, y: 10 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          exit={
                            shouldReduceMotion
                              ? undefined
                              : { opacity: 0, y: -6 }
                          }
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.36, ease: WHATSAPP_EASE }
                          }
                          className="flex justify-start"
                        >
                          <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 shadow-sm">
                            <p className="text-[11px] leading-relaxed text-foreground">
                              Pagi kak Rojak, saya butuh bantuan terkait
                              pinjaman online saya. Saya tiba-tiba ditagih
                              padahal sudah lunas.
                            </p>
                            <p className="mt-1 text-right text-[9px] text-muted-foreground">
                              09:42
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {visibleStep === 2 && (
                        <motion.div
                          key="typing-indicator"
                          layout="position"
                          initial={
                            shouldReduceMotion ? false : { opacity: 0, y: 8 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          exit={
                            shouldReduceMotion
                              ? undefined
                              : { opacity: 0, y: -6 }
                          }
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.28, ease: WHATSAPP_EASE }
                          }
                          className="flex justify-end"
                        >
                          <div className="flex items-center gap-1 rounded-full border border-module-ketik/30 bg-module-ketik/10 px-3 py-2">
                            {[0, 1, 2].map((dot) => (
                              <motion.span
                                key={dot}
                                animate={
                                  shouldReduceMotion
                                    ? undefined
                                    : { y: [0, -2, 0] }
                                }
                                transition={
                                  shouldReduceMotion
                                    ? undefined
                                    : {
                                        repeat: Infinity,
                                        duration: 0.7,
                                        delay: dot * 0.14,
                                      }
                                }
                                className="size-1.5 rounded-full bg-module-ketik"
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {visibleStep === 3 && (
                        <motion.div
                          key="agent-reply"
                          layout="position"
                          initial={
                            shouldReduceMotion ? false : { opacity: 0, y: 10 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.36, ease: WHATSAPP_EASE }
                          }
                          className="flex justify-end"
                        >
                          <div className="max-w-[86%] rounded-2xl rounded-br-md bg-module-ketik px-3.5 py-2.5 shadow-sm">
                            <p className="text-[11px] leading-relaxed text-white">
                              Baik, saya bantu cek dulu status pelunasannya.
                              Mohon kirim nama pinjaman online yang dimaksud.
                            </p>
                            <p className="mt-1 flex items-center justify-end gap-1 text-right text-[9px] text-white/75">
                              09:43 <span className="text-[10px]">✓✓</span>
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* input bar */}
              <div className="flex shrink-0 items-center gap-2 border-t border-border/70 bg-card px-3 py-2.5">
                <div className="flex flex-1 items-center rounded-full bg-muted px-3.5 py-2">
                  <span className="text-[12px] text-muted-foreground">
                    Ketik pesan...
                  </span>
                  <motion.span
                    animate={
                      shouldReduceMotion ? undefined : { opacity: [1, 0, 1] }
                    }
                    transition={
                      shouldReduceMotion
                        ? undefined
                        : { duration: 0.9, repeat: Infinity }
                    }
                    className="ml-0.5 text-muted-foreground"
                  >
                    |
                  </motion.span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-module-ketik text-white">
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M22 2L11 13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M22 2L15 22L11 13L2 9L22 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* home indicator */}
              <div className="flex shrink-0 justify-center bg-card pb-2 pt-1">
                <div className="h-1 w-12 rounded-full bg-border" />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
