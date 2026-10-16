import { Link } from "@tanstack/react-router";
import type { SidakHomeParameter } from "../../../utils/sidakHomeSummary";
import { SIDAK_SCORE_TEXT } from "../../../utils/sidakScoreStatus";
import {
  SidakHomeNote,
  SidakHomeProblem,
  SidakHomeSection,
  type SidakHomeLoadState,
} from "./SidakHomeSection";

/** Tiga parameter dengan temuan terbanyak di cakupan aktif (Pareto). */
export function SidakTopParameters({
  parameters,
  state,
  onRetry,
}: {
  parameters: SidakHomeParameter[];
  state: SidakHomeLoadState;
  onRetry: () => void;
}) {
  return (
    <SidakHomeSection
      id="sidak-home-parameters"
      title="Parameter teratas"
      className="flex-[1_1_300px]"
      meta={
        <Link
          to="/sidak/dashboard"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Buka Dashboard
        </Link>
      }
    >
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
        {state === "error" ? (
          <SidakHomeProblem
            message="Parameter belum bisa dimuat."
            onRetry={onRetry}
          />
        ) : state === "loading" ? (
          <SidakHomeNote>Memuat parameter…</SidakHomeNote>
        ) : parameters.length === 0 ? (
          <SidakHomeNote>Belum ada temuan di cakupan ini.</SidakHomeNote>
        ) : (
          <>
            <ol className="divide-y divide-border">
              {parameters.map((parameter, index) => (
                <li
                  key={parameter.name}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_3rem] items-baseline gap-x-3 px-5 py-3 text-sm"
                >
                  <span className="font-mono text-fg2 tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 font-medium text-foreground">
                    {parameter.name}
                    {parameter.critical ? (
                      <span
                        className={`ml-1.5 text-xs font-semibold ${SIDAK_SCORE_TEXT.bad}`}
                      >
                        kritikal
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right font-mono font-semibold text-foreground tabular-nums">
                    {parameter.count}
                  </span>
                  <span className="text-right text-fg2 tabular-nums">
                    {parameter.share}%
                  </span>
                </li>
              ))}
            </ol>
            <p className="border-t border-border px-5 py-3 text-xs text-fg2">
              {parameters.length} parameter ini mencakup{" "}
              {parameters.reduce((sum, parameter) => sum + parameter.share, 0)}%
              temuan di cakupan ini.
            </p>
          </>
        )}
      </div>
    </SidakHomeSection>
  );
}
