import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentHomeSummary } from "@trainers/types";
import { homeClient, unwrapResponse } from "../../../lib/api";
import { SERVICE_LABELS } from "../../../lib/scoring";
import QaStatePanel from "../../../components/ui/QaStatePanel";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";

const NUMBER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: AgentHomeSummary };
type Qa = NonNullable<AgentHomeSummary["qa"]>;

function QaResult({ qa }: { qa: Qa }) {
  const sentence =
    qa.gapToTarget === null
      ? `Skor QA ${qa.periodLabel} ${NUMBER.format(qa.score)}, sudah mencapai target ${qa.target}.`
      : `Skor QA ${qa.periodLabel} ${NUMBER.format(qa.score)}, ${NUMBER.format(qa.gapToTarget)} poin di bawah target ${qa.target}.`;
  const delta =
    qa.delta === null
      ? "Belum ada periode pembanding."
      : qa.delta > 0
        ? `Naik ${NUMBER.format(qa.delta)} dari ${qa.previousLabel}.`
        : qa.delta < 0
          ? `Turun ${NUMBER.format(-qa.delta)} dari ${qa.previousLabel}.`
          : `Sama dengan ${qa.previousLabel}.`;
  const x = (i: number) => 30 + (i * 240) / Math.max(1, qa.trend.length - 1);
  const y = (score: number) => 12 + (100 - score) * 0.8;
  const line = qa.trend
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`)
    .join(" ");
  return (
    <div className="home-panel space-y-6">
      <div className="grid min-w-0 gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[13px] text-fg2">
            {SERVICE_LABELS[qa.serviceType]} · audit terakhir yang tersedia
          </p>
          <p className="max-w-prose text-base font-semibold text-fg">
            {sentence}
          </p>
          <p className="text-[13px] text-fg2">{delta}</p>
          <h3 className="pt-2 text-[13px] font-semibold text-fg">
            Parameter yang paling sering jadi temuan
          </h3>
          {qa.topParameters.length ? (
            <ul className="space-y-2 text-[13px] text-fg">
              {qa.topParameters.map((p) => (
                <li key={p.name} className="flex justify-between gap-4">
                  <span>{p.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {p.count} temuan
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg2">
              Tidak ada temuan di {qa.periodLabel}.
            </p>
          )}
          {qa.recommendation && (
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-[13px] font-semibold text-fg">
                Saran latihan
              </h3>
              <p className="max-w-prose text-[13px] text-fg2">
                {qa.recommendation}
              </p>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <svg
            viewBox="0 0 300 110"
            className="h-32 w-full text-fg"
            role="img"
            aria-label="Grafik tren skor QA, skala 0 sampai 100"
          >
            {[0, 50, 100].map((score) => (
              <g key={score}>
                <line
                  x1="30"
                  x2="280"
                  y1={y(score)}
                  y2={y(score)}
                  stroke="var(--border)"
                />
                <text
                  x="24"
                  y={y(score) + 4}
                  textAnchor="end"
                  fill="var(--fg2)"
                  fontSize="12"
                >
                  {score}
                </text>
              </g>
            ))}
            <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
            {qa.trend.map((p, i) => (
              <circle
                key={p.periodLabel}
                cx={x(i)}
                cy={y(p.score)}
                r="3"
                fill="currentColor"
              />
            ))}
          </svg>
          <table className="w-full text-left text-[13px] tabular-nums">
            <caption className="pb-2 text-left font-semibold text-fg">
              Tren skor QA
            </caption>
            <thead className="text-fg2">
              <tr>
                <th scope="col" className="py-2 font-medium">
                  Periode
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Skor / 100
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {qa.trend.map((p) => (
                <tr key={p.periodLabel}>
                  <td className="py-2 text-fg2">{p.periodLabel}</td>
                  <td className="py-2 text-right text-fg">
                    {NUMBER.format(p.score)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[12px] text-fg2">
            Maksimal 6 periode yang memiliki audit pada layanan yang sama.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Independent self-only RPC; an unavailable summary never blocks practice. */
export function AgentQaSummary() {
  const [state, setState] = useState<State>({ status: "loading" });
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setState({ status: "loading" });
    try {
      const data = await unwrapResponse(
        await homeClient["agent-summary"].$get(),
      );
      if (request === generation.current) setState({ status: "ready", data });
    } catch {
      if (request === generation.current) setState({ status: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  return (
    <section aria-labelledby="home-agent-qa-title" className="home-section">
      <div className="home-section-head">
        <h2 id="home-agent-qa-title" className="home-section-title">
          Skor QA saya
        </h2>
      </div>
      {state.status === "loading" && (
        <div className="home-panel space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <span className="sr-only">Memuat ringkasan QA</span>
        </div>
      )}
      {state.status === "error" && (
        <QaStatePanel
          type="error"
          compact
          title="Ringkasan QA belum dapat dimuat"
          description="Latihan tetap tersedia. Coba lagi untuk melihat data QA Anda."
          action={
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => void load()}
            >
              Coba lagi
            </Button>
          }
        />
      )}
      {state.status === "ready" &&
        (!state.data.linked ? (
          <QaStatePanel
            type="empty"
            compact
            title="Data QA Anda belum tersambung"
            description="Hubungi trainer untuk menautkan akun. Latihan tetap tersedia."
          />
        ) : state.data.qa ? (
          <QaResult qa={state.data.qa} />
        ) : (
          <QaStatePanel
            type="empty"
            compact
            title="Belum ada audit QA"
            description="Akun sudah tertaut. Ringkasan akan tampil setelah audit tersedia; latihan tetap bisa dilakukan."
          />
        ))}
    </section>
  );
}
