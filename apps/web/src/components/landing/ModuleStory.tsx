import { useEffect, useRef, useState } from "react";
import { Check, Mic, Phone, Send, User } from "lucide-react";
import { prefersReducedMotion } from "./reducedMotion";
import { SplitFlapBoard } from "./SplitFlapBoard";
import "./ModuleStory.css";
import {
  LANDING_MODULES,
  channelStyle,
  cssVars,
  type LandingModuleId,
} from "./landingModules";

const SIDAK_SCORE = 92.4;
const formatScore = (value: number) => value.toFixed(1).replace(".", ",");

/**
 * Active step = the last step whose centre has reached the middle of the area
 * left visible beside (desktop) or below (mobile, sticky stage on top) the
 * stage.
 */
function useActiveStep(
  stepsRef: React.RefObject<HTMLOListElement | null>,
  stageRef: React.RefObject<HTMLDivElement | null>,
) {
  const [active, setActive] = useState<LandingModuleId>("ketik");

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 900px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const steps =
        stepsRef.current?.querySelectorAll<HTMLElement>("[data-step]");
      const stage = stageRef.current;
      if (!steps?.length || !stage) return;
      const stageBottom = narrow.matches
        ? stage.getBoundingClientRect().bottom
        : 0;
      const line = stageBottom + (window.innerHeight - stageBottom) / 2;
      let next = steps[0].dataset.step as LandingModuleId;
      for (const step of steps) {
        const box = step.getBoundingClientRect();
        if (box.top + box.height / 2 <= line + 1)
          next = step.dataset.step as LandingModuleId;
      }
      setActive(next);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, [stepsRef, stageRef]);

  return active;
}

function CallClock({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <span>
      {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
    </span>
  );
}

function ScoreValue({ running }: { running: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!running || !element || prefersReducedMotion()) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      element.textContent = formatScore(SIDAK_SCORE * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      element.textContent = formatScore(SIDAK_SCORE);
    };
  }, [running]);
  return (
    <span ref={ref} className="score-value">
      {formatScore(SIDAK_SCORE)}
    </span>
  );
}

const WAVE = [
  [18, 520],
  [30, 460],
  [44, 610],
  [26, 380],
  [56, 540],
  [38, 420],
  [22, 500],
  [48, 360],
  [60, 580],
  [34, 440],
  [52, 520],
  [28, 400],
  [42, 600],
  [20, 470],
  [36, 390],
  [14, 550],
] as const;

const ROSTER = [
  ["A", "Tim Layanan 1", "150ms"],
  ["B", "Tim Layanan 2", "280ms"],
  ["C", "Tim Layanan 1", "410ms"],
  ["D", "Tim Layanan 3", "540ms"],
] as const;

const BARS = [
  ["Mei", "40%"],
  ["Jun", "52%"],
  ["Jul", "45%"],
  ["Agu", "65%"],
  ["Sep", "56%"],
  ["Okt", "62%"],
] as const;

const PLAN = [
  ["Validasi temuan kualitas", "Dari hasil audit SIDAK", "150ms", "500ms"],
  ["Petakan kebutuhan pelatihan", "Per agen dan tim", "250ms", "1100ms"],
  [
    "Susun rencana pelatihan",
    "Siap dijalankan lewat simulasi",
    "350ms",
    "1700ms",
  ],
] as const;

/** Illustrative scenes; the stage is decorative and hidden from AT. */
function StageScenes({ active }: { active: LandingModuleId }) {
  const scene = (id: LandingModuleId, extra = "") =>
    `scene${extra ? ` ${extra}` : ""}${active === id ? " is-on" : ""}`;
  return (
    <div className="stage-body">
      <div className={scene("ketik")} data-scene="ketik">
        <div className="scene-meta a-in">
          <span className="avatar">
            <User className="icon" />
          </span>
          <div>
            <strong>Konsumen</strong>
            <small>Simulasi chat · data ilustrasi</small>
          </div>
        </div>
        <p className="bubble a-in" style={cssVars({ "--d": "250ms" })}>
          Selamat siang, saya ingin melaporkan petugas penagih yang mengancam
          saya.
        </p>
        <span className="typing">
          <i />
          <i />
          <i />
        </span>
        <p className="bubble reply a-in" style={cssVars({ "--d": "2200ms" })}>
          Baik, Bapak/Ibu. Saya memahami kekhawatirannya. Bisa diceritakan
          kronologinya?
        </p>
        <div className="feedback a-in" style={cssVars({ "--d": "3000ms" })}>
          <Check className="icon" />
          <span>
            <strong>Umpan balik:</strong> tanggapan mengakui kekhawatiran
            sebelum menggali kronologi.
          </span>
        </div>
      </div>

      <div className={scene("pdkt")} data-scene="pdkt">
        <div className="email-meta a-in">
          <span>Kepada</span>
          <strong>Konsumen · contoh penerima</strong>
        </div>
        <div className="email-meta a-in" style={cssVars({ "--d": "120ms" })}>
          <span>Subjek</span>
          <strong>Tindak lanjut pengaduan konsumen</strong>
        </div>
        <div className="email-copy">
          <p className="wipe" style={cssVars({ "--d": "400ms" })}>
            Yth. Bapak/Ibu Konsumen,
          </p>
          <p className="wipe" style={cssVars({ "--d": "900ms" })}>
            Terima kasih telah menyampaikan pengaduan. Kami memahami
            kekhawatiran Bapak/Ibu dan akan membantu menjelaskan langkah tindak
            lanjutnya.
          </p>
          <p className="wipe" style={cssVars({ "--d": "1700ms" })}>
            Hormat kami, Tim Layanan
          </p>
        </div>
        <div className="email-foot">
          <span className="sent a-in" style={cssVars({ "--d": "2900ms" })}>
            <Check className="icon" />
            Draf terkirim
          </span>
          <span className="send">
            <Send className="icon" />
            Kirim
          </span>
        </div>
      </div>

      <div className={scene("telefun", "call")} data-scene="telefun">
        <span className="call-avatar a-in">
          <User className="icon" />
        </span>
        <h4 className="a-in" style={cssVars({ "--d": "150ms" })}>
          Konsumen
        </h4>
        <p className="call-time a-in" style={cssVars({ "--d": "200ms" })}>
          <CallClock running={active === "telefun"} /> · Berlangsung
        </p>
        <div className="wave">
          {WAVE.map(([height, duration], index) => (
            <i
              key={index}
              style={cssVars({ "--h": `${height}px`, "--t": `${duration}ms` })}
            />
          ))}
        </div>
        <div className="call-actions a-in" style={cssVars({ "--d": "300ms" })}>
          <span>
            <Mic className="icon" />
          </span>
          <span className="end">
            <Phone className="icon" />
          </span>
        </div>
      </div>

      <div className={scene("ktp")} data-scene="ktp">
        <div className="roster-head a-in">
          <strong>Peserta · Batch contoh</strong>
          <span>Data ilustrasi</span>
        </div>
        <ul className="roster">
          {ROSTER.map(([initial, team, delay], index) => (
            <li
              key={initial}
              className={index === 1 ? "pick" : undefined}
              style={cssVars({ "--d": delay })}
            >
              <span className="initial">{initial}</span>
              <span>
                Peserta {initial}
                <small>{team}</small>
              </span>
              <span className="state">Aktif</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={scene("sidak")} data-scene="sidak">
        <div className="score-row a-in">
          <div>
            <span className="score-label">Skor audit · contoh agen</span>
            <ScoreValue running={active === "sidak"} />
          </div>
          <div className="score-status">
            <strong>Di bawah target</strong>
            <span>Target 95</span>
          </div>
        </div>
        <div className="chart">
          <div className="target">
            <span>95</span>
          </div>
          {BARS.map(([month, value], index) => (
            <div
              key={month}
              className={index === BARS.length - 1 ? "bar now" : "bar"}
              style={cssVars({ "--v": value, "--d": `${100 + index * 80}ms` })}
            >
              <i />
              <small>{month}</small>
            </div>
          ))}
        </div>
      </div>

      <div className={scene("tna")} data-scene="tna">
        <h4 className="plan-title a-in">Rencana pelatihan · contoh</h4>
        <ul className="plan">
          {PLAN.map(([title, note, rowDelay, checkDelay]) => (
            <li
              key={title}
              className="a-in"
              style={cssVars({ "--d": rowDelay })}
            >
              <span className="box" style={cssVars({ "--d": checkDelay })}>
                <Check className="icon" />
              </span>
              <span>
                {title}
                <small>{note}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className="progress a-in" style={cssVars({ "--d": "200ms" })}>
          <span>3 dari 3 langkah</span>
          <span className="progress-track">
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

/** "Enam modul" section: departure board, scroll-driven steps, sticky stage. */
export function ModuleStory() {
  const stepsRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const active = useActiveStep(stepsRef, stageRef);
  const activeIndex = LANDING_MODULES.findIndex((item) => item.id === active);
  const total = String(LANDING_MODULES.length).padStart(2, "0");

  return (
    <section
      className="lp-container"
      id="modul"
      aria-labelledby="modules-title"
    >
      <div className="section-heading">
        <h2 id="modules-title">
          Enam modul.
          <br />
          Satu alur kerja.
        </h2>
        <p>
          Dari latihan komunikasi hingga rencana pelatihan berbasis temuan.
          Ketersediaan modul mengikuti hak akses.
        </p>
      </div>

      <div className="departures-wrap">
        <div className="departures-head" aria-hidden="true">
          <span>Kode</span>
          <span>Modul</span>
          <span>Fungsi</span>
        </div>
        <ol className="departures">
          {LANDING_MODULES.map((item, index) => (
            <li key={item.id} style={channelStyle(item.id)}>
              <span className="dep-code">
                <span className="sr-only">{item.code}</span>
                <SplitFlapBoard
                  lines={[item.code]}
                  cols={7}
                  ink="var(--channel)"
                  delay={index * 120}
                />
              </span>
              <span className="dep-name">{item.fullName}</span>
              <span className="dep-use">{item.use}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="story">
        <ol className="steps" ref={stepsRef}>
          {LANDING_MODULES.map((item, index) => (
            <li
              key={item.id}
              id={`modul-${item.id}`}
              data-step={item.id}
              className={active === item.id ? "step is-active" : "step"}
              style={channelStyle(item.id)}
            >
              <span className="step-index">
                {String(index + 1).padStart(2, "0")} / {total}
              </span>
              <h3>{item.code}</h3>
              <p className="step-full">{item.fullName}</p>
              <p className="step-desc">{item.description}</p>
            </li>
          ))}
        </ol>

        <div className="stage-col">
          <div
            ref={stageRef}
            className="stage"
            data-active={active}
            aria-hidden="true"
          >
            <div className="stage-head">
              <span className="stage-name">
                <i className="dot" />
                <span key={active} className="stage-label swap">
                  {LANDING_MODULES[activeIndex].code}
                </span>
                <small>Contoh tampilan</small>
              </span>
              <span className="rail">
                {LANDING_MODULES.map((item, index) => (
                  <i
                    key={item.id}
                    className={index === activeIndex ? "on" : undefined}
                  />
                ))}
              </span>
            </div>
            <StageScenes active={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
