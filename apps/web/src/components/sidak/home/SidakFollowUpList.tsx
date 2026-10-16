import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { AgentDirectoryEntry } from "@trainers/types";
import {
  SIDAK_QA_TARGET,
  SIDAK_SCORE_FILL,
  SIDAK_SCORE_TEXT,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../../utils/sidakScoreStatus";
import {
  SidakHomeNote,
  SidakHomeProblem,
  SidakHomeSection,
  type SidakHomeLoadState,
} from "./SidakHomeSection";

/** Batas baris di beranda; sisanya dibuka di halaman Agen. */
const MAX_ROWS = 8;

function changeLabel(agent: AgentDirectoryEntry): string | null {
  if (agent.trendValue === null || agent.trend === "none") return null;
  if (agent.trendValue === 0) return "Sama dengan periode sebelumnya";
  return `${agent.trendValue > 0 ? "Naik" : "Turun"} ${Math.abs(agent.trendValue).toFixed(1)} poin`;
}

/**
 * Agen di bawah target 95, skor terendah dulu. Definisi sama dengan item
 * "agen di bawah target" di Beranda aplikasi.
 */
export function SidakFollowUpList({
  agents,
  state,
  onRetry,
}: {
  agents: AgentDirectoryEntry[];
  state: SidakHomeLoadState;
  onRetry: () => void;
}) {
  const visible = agents.slice(0, MAX_ROWS);
  return (
    <SidakHomeSection
      id="sidak-home-follow-up"
      title="Perlu tindak lanjut"
      className="flex-[999_1_520px]"
      meta={
        state === "ready" && agents.length > 0 ? (
          <span className="text-sm text-fg2">
            {agents.length} agen di bawah target {SIDAK_QA_TARGET}
          </span>
        ) : null
      }
    >
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
        {state === "error" ? (
          <SidakHomeProblem
            message="Daftar agen belum bisa dimuat."
            onRetry={onRetry}
          />
        ) : state === "loading" ? (
          <SidakHomeNote>Memuat daftar agen…</SidakHomeNote>
        ) : agents.length === 0 ? (
          <SidakHomeNote>
            Semua agen memenuhi target {SIDAK_QA_TARGET} di audit terakhirnya.
          </SidakHomeNote>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {visible.map((agent) => {
                const score = agent.avgScore ?? 0;
                const tone = sidakScoreTone(score);
                const change = changeLabel(agent);
                return (
                  <li key={agent.id}>
                    <Link
                      to="/sidak/agents/$id"
                      params={{ id: agent.id }}
                      className="flex min-h-[44px] items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          SIDAK_SCORE_FILL[tone],
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-semibold text-foreground">
                          {agent.nama}
                        </span>
                        <span className="truncate text-xs text-fg2">
                          {[agent.tim, agent.batch_name]
                            .filter(Boolean)
                            .join(" · ")}
                          {change ? ` · ${change}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-mono text-base font-bold text-foreground tabular-nums">
                          {score.toFixed(1)}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            SIDAK_SCORE_TEXT[tone],
                          )}
                        >
                          {sidakScoreLabel(score)}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-fg3"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {agents.length > visible.length ? (
              <div className="border-t border-border px-5 py-3">
                <Link
                  to="/sidak/agents"
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Lihat {agents.length - visible.length} agen lain di halaman
                  Agen
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
      <p className="text-xs text-fg2">
        Skor dari periode audit terakhir tiap agen. Arah per agen ada di{" "}
        <Link
          to="/sidak/forecast"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Forecast
        </Link>
        .
      </p>
    </SidakHomeSection>
  );
}
