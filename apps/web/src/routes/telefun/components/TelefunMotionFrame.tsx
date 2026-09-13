import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const DEMO_STEPS = [
  "dial-1",
  "dial-5",
  "dial-7",
  "dial",
  "conversation",
] as const;

type DemoStep = (typeof DEMO_STEPS)[number];

const DEMO_STEP_DURATIONS: Record<DemoStep, number> = {
  "dial-1": 700,
  "dial-5": 700,
  "dial-7": 700,
  dial: 1100,
  conversation: 3200,
};

const KEYPAD_KEYS = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
] as const;

const DIAL_SEQUENCE = ["1", "5", "7"] as const;

const IN_CALL_CONTROLS = [
  {
    key: "mute",
    label: "bisukan",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3z"
          fill="white"
        />
        <path
          d="M19 10a7 7 0 01-14 0"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M12 17v3M8 21h8"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: "keypad",
    label: "papan tombol",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="7" cy="7" r="1.6" fill="white" />
        <circle cx="12" cy="7" r="1.6" fill="white" />
        <circle cx="17" cy="7" r="1.6" fill="white" />
        <circle cx="7" cy="12" r="1.6" fill="white" />
        <circle cx="12" cy="12" r="1.6" fill="white" />
        <circle cx="17" cy="12" r="1.6" fill="white" />
        <circle cx="7" cy="17" r="1.6" fill="white" />
        <circle cx="12" cy="17" r="1.6" fill="white" />
        <circle cx="17" cy="17" r="1.6" fill="white" />
      </svg>
    ),
  },
  {
    key: "speaker",
    label: "speaker",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M11 5L6 9H2v6h4l5 4V5z" fill="white" />
        <path
          d="M15 9a5 5 0 010 6M17.5 7a8 8 0 010 10"
          stroke="white"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    key: "add",
    label: "tambah",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 5v14M5 12h14"
          stroke="white"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: "facetime",
    label: "FaceTime",
    icon: (
      <svg width="18" height="13" viewBox="0 0 24 16" fill="none">
        <rect x="2" y="2" width="14" height="12" rx="2" fill="white" />
        <path d="M16 5l5-2v10l-5-2z" fill="white" />
      </svg>
    ),
  },
  {
    key: "contacts",
    label: "kontak",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.3" fill="white" />
        <path d="M5 19c0-3 2.7-5 7-5s7 2 7 5v1H5z" fill="white" />
      </svg>
    ),
  },
] as const;

export function TelefunMotionFrame() {
  const shouldReduceMotion = useReducedMotion();
  const [demoStep, setDemoStep] = useState<DemoStep>(DEMO_STEPS[0]);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const timeoutId = window.setTimeout(() => {
      setDemoStep((currentStep) => {
        const currentIndex = DEMO_STEPS.indexOf(currentStep);
        return DEMO_STEPS[(currentIndex + 1) % DEMO_STEPS.length];
      });
    }, DEMO_STEP_DURATIONS[demoStep]);

    return () => window.clearTimeout(timeoutId);
  }, [demoStep, shouldReduceMotion]);

  const visibleStep: DemoStep = shouldReduceMotion ? "conversation" : demoStep;
  const isConversation = visibleStep === "conversation";
  const isDialing = visibleStep === "dial";
  const dialedNumber =
    visibleStep === "dial-1" ? "1" : visibleStep === "dial-5" ? "15" : "157";
  const pressedDigit =
    visibleStep === "dial-1"
      ? "1"
      : visibleStep === "dial-5"
        ? "5"
        : visibleStep === "dial-7"
          ? "7"
          : null;
  const enteredDigits: readonly string[] =
    visibleStep === "dial-1"
      ? ["1"]
      : visibleStep === "dial-5"
        ? ["1", "5"]
        : visibleStep === "dial-7" || isDialing
          ? DIAL_SEQUENCE
          : [];

  return (
    <div
      aria-hidden="true"
      data-testid="telefun-motion-frame"
      data-demo-step={visibleStep}
      className="relative flex h-full min-h-[380px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-module-telefun/5 p-6 lg:min-h-[520px] lg:p-8 dark:bg-module-telefun/10"
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
          <div className="absolute bottom-0 left-1/2 h-6 w-[180px] -translate-x-1/2 rounded-full bg-black/10 blur-xl" />
          <div
            data-testid="telefun-motion-phone"
            data-call-state={isConversation ? "connected" : "idle"}
            className="relative flex h-[448px] w-[250px] flex-col rounded-[2.2rem] border-[7px] border-slate-900 bg-slate-900 p-1.5 shadow-2xl shadow-black/20 sm:h-[468px] sm:w-[268px]"
          >
            <div className="absolute left-1/2 top-0 z-20 h-5 w-20 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="absolute left-1/2 top-2 z-20 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-700" />

            {/* iPhone / Samsung caller screen - plek */}
            <div className="relative flex h-full flex-col overflow-hidden rounded-[1.9rem] bg-[#0a0a14]">
              {/* wallpaper blur */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.9rem]">
                <div className="absolute inset-0 bg-gradient-to-b from-[#1e1238] via-[#1a1030] to-[#0f0a1e]" />
                <div className="absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-violet-600/25 blur-3xl" />
                <div className="absolute bottom-20 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-indigo-600/15 blur-2xl" />
              </div>

              <div className="relative flex h-full flex-col">
                <PhoneStatusBar />

                <div className="flex min-h-0 flex-1 flex-col">
                  {isConversation ? (
                    <ConversationScreen
                      shouldReduceMotion={!!shouldReduceMotion}
                    />
                  ) : (
                    <DialerScreen
                      dialedNumber={dialedNumber}
                      enteredDigits={enteredDigits}
                      isDialing={isDialing}
                      pressedDigit={pressedDigit}
                      shouldReduceMotion={!!shouldReduceMotion}
                    />
                  )}
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

function PhoneStatusBar() {
  return (
    <div className="flex shrink-0 items-center justify-between px-5 pt-3.5">
      <span className="text-[11px] font-semibold tabular-nums text-white">
        09:41
      </span>
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="flex gap-[2px]">
          <span className="h-[7px] w-[2.5px] rounded-full bg-white" />
          <span className="h-[7px] w-[2.5px] rounded-full bg-white" />
          <span className="h-[7px] w-[2.5px] rounded-full bg-white" />
          <span className="h-[7px] w-[2.5px] rounded-full bg-white/35" />
        </span>
        <svg
          width="14"
          height="8"
          viewBox="0 0 14 8"
          fill="none"
          className="ml-1"
        >
          <path
            d="M1 4h3M5 2.5h3M9 1h3"
            stroke="white"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
        <div className="ml-1 flex h-[10px] w-[18px] items-center rounded-[3px] border border-white/40 p-[1.5px]">
          <div className="h-full w-[72%] rounded-[1.5px] bg-white" />
        </div>
      </div>
    </div>
  );
}

type DialerScreenProps = {
  dialedNumber: string;
  enteredDigits: readonly string[];
  isDialing: boolean;
  pressedDigit: string | null;
  shouldReduceMotion: boolean;
};

function DialerScreen({
  dialedNumber,
  enteredDigits,
  isDialing,
  pressedDigit,
  shouldReduceMotion,
}: DialerScreenProps) {
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
      className="flex h-full flex-col px-5 pb-2 pt-2"
    >
      <div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-white/55">
        <span>Kontak OJK 157</span>
        <span>{isDialing ? "Menghubungkan" : "Panggilan baru"}</span>
      </div>

      <div className="flex flex-1 flex-col items-center pt-2">
        <motion.p
          key={dialedNumber}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
          className="h-9 text-[30px] font-semibold tracking-[0.14em] tabular-nums text-white"
        >
          {dialedNumber}
        </motion.p>
        <p className="mt-0.5 text-[10px] text-white/45">Nomor tujuan</p>

        <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1.5">
          {KEYPAD_KEYS.map(({ digit, letters }) => {
            const isPressed = pressedDigit === digit;
            const isEntered = enteredDigits.includes(digit);

            return (
              <motion.div
                key={digit}
                animate={
                  isPressed && !shouldReduceMotion
                    ? { scale: [1, 0.84, 1] }
                    : { scale: 1 }
                }
                transition={
                  isPressed && !shouldReduceMotion
                    ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                    : { duration: 0.15 }
                }
                className="flex justify-center"
              >
                <div
                  className={`flex h-[46px] w-[46px] flex-col items-center justify-center rounded-full backdrop-blur transition-colors ${
                    isPressed
                      ? "bg-emerald-500 text-white"
                      : isEntered
                        ? "bg-white/20 text-white ring-1 ring-emerald-400/70"
                        : "bg-white/12 text-white"
                  }`}
                >
                  <span className="text-[15px] font-medium leading-none">
                    {digit}
                  </span>
                  {letters && (
                    <span className="mt-0.5 text-[6px] font-medium leading-none tracking-[0.12em] opacity-70">
                      {letters}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          animate={
            isDialing && !shouldReduceMotion
              ? { scale: [1, 1.06, 1] }
              : { scale: 1 }
          }
          transition={
            isDialing && !shouldReduceMotion
              ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.15 }
          }
          className="mt-auto flex flex-col items-center gap-1"
        >
          <div
            className={`flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-lg shadow-black/25 transition-colors ${
              isDialing ? "bg-emerald-400" : "bg-emerald-500"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12 1.33.43 2.62.92 3.84a2 2 0 01-.58 2.11l-1.27 1.27a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.58c1.22.49 2.5.8 3.85.92A2 2 0 0122 16.92z"
                fill="white"
              />
            </svg>
          </div>
          <span className="text-[10px] font-medium text-white/85">
            {isDialing ? "Memanggil..." : "Panggil"}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

type ConversationScreenProps = {
  shouldReduceMotion: boolean;
};

function ConversationScreen({ shouldReduceMotion }: ConversationScreenProps) {
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24 }}
      className="flex h-full flex-col"
    >
      {/* caller */}
      <div className="flex flex-1 flex-col items-center px-5 pt-4">
        <motion.p
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 4 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            shouldReduceMotion ? undefined : { delay: 0.15, duration: 0.3 }
          }
          className="text-[11px] font-medium tracking-wide text-white/55"
        >
          Kontak OJK 157
        </motion.p>

        <motion.div
          initial={shouldReduceMotion ? undefined : { scale: 0.9, opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={
            shouldReduceMotion ? undefined : { delay: 0.2, duration: 0.35 }
          }
          className="relative mt-3"
        >
          <motion.div
            animate={
              shouldReduceMotion
                ? undefined
                : { scale: [1, 1.2, 1], opacity: [0.18, 0, 0.18] }
            }
            transition={
              shouldReduceMotion
                ? undefined
                : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
            }
            className="pointer-events-none absolute inset-0 rounded-full border border-white/15"
            style={{ margin: -8 }}
          />
          <motion.div
            animate={
              shouldReduceMotion
                ? undefined
                : { scale: [1, 1.35, 1], opacity: [0.1, 0, 0.1] }
            }
            transition={
              shouldReduceMotion
                ? undefined
                : {
                    duration: 2.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.4,
                  }
            }
            className="pointer-events-none absolute inset-0 rounded-full border border-white/10"
            style={{ margin: -16 }}
          />
          <div className="relative flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 shadow-2xl shadow-black/30 ring-1 ring-white/10">
            <span className="text-[24px] font-semibold tracking-tight text-white">
              157
            </span>
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white shadow-md ring-2 ring-[#0a0a14]">
            HD
          </span>
        </motion.div>

        <motion.p
          animate={shouldReduceMotion ? undefined : { opacity: [0.9, 1, 0.9] }}
          transition={
            shouldReduceMotion ? undefined : { duration: 1.2, repeat: Infinity }
          }
          className="mt-2 text-center text-[13px] font-medium tabular-nums tracking-wide text-white/90"
        >
          00:24
        </motion.p>
      </div>

      {/* controls - iOS style 6 buttons */}
      <div className="px-5 pb-3 pt-1">
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          {IN_CALL_CONTROLS.map((control) => (
            <div
              key={control.key}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white/14 backdrop-blur">
                {control.icon}
              </div>
              <span className="text-center text-[10px] font-normal leading-none text-white/85">
                {control.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center justify-center gap-1">
          <motion.button
            type="button"
            tabIndex={-1}
            animate={shouldReduceMotion ? undefined : { scale: [1, 1.02, 1] }}
            transition={
              shouldReduceMotion
                ? undefined
                : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
            }
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-lg shadow-black/20"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12 1.33.43 2.62.92 3.84a2 2 0 01-.58 2.11l-1.27 1.27a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.58c1.22.49 2.5.8 3.85.92A2 2 0 0122 16.92z"
                fill="white"
                transform="rotate(135 12 12)"
              />
            </svg>
          </motion.button>
          <span className="text-[10px] font-medium text-white/85">akhiri</span>
        </div>
      </div>
    </motion.div>
  );
}
