import { Link } from "@tanstack/react-router";
import type {
  KetikHistorySummaryItem,
  PdktSessionHistory,
  PracticeQuotaStatus,
} from "@trainers/types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { buildNavModel } from "../../../components/layout/nav-config";
import QaStatePanel from "../../../components/ui/QaStatePanel";
import { Button, buttonVariants } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { pdktClient, unwrapResponse } from "../../../lib/api";
import { HomeHeader } from "./HomeHeader";
import { ketikApi } from "../../ketik/ketikApi";
import {
  getTelefunSessions,
  mapTelefunSessionRow,
  type TelefunSessionRow,
} from "../../telefun/telefunApi";
import { useApi } from "../../../hooks/useApi";
import { QuotaLine } from "../../../components/simulation/QuotaLine";
import { AgentQaSummary } from "./AgentQaSummary";

const SESSION_LIMIT = 5;
const DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

type Session = {
  id: string;
  module: "KETIK" | "PDKT" | "Telefun";
  scale: 100 | 10;
  date: string;
  scenario: string;
  score: number | null;
  status: string | null;
};

type PdktHistoryRow = Pick<PdktSessionHistory, "id" | "timestamp"> & {
  config?: { scenarios?: { title?: string }[] } | null;
  evaluation?: { score?: number } | null;
  evaluation_status?: string | null;
};

const REVIEW_STATUS: Record<string, string> = {
  pending: "Menunggu ulasan",
  processing: "Sedang dinilai",
  not_started: "Belum dinilai",
  failed: "Penilaian gagal",
};

function fromKetik(item: KetikHistorySummaryItem): Session {
  return {
    id: `ketik-${item.id}`,
    module: "KETIK",
    scale: 100,
    date: item.date,
    scenario: item.scenarioTitle,
    score: typeof item.finalScore === "number" ? item.finalScore : null,
    status: item.reviewStatus ?? null,
  };
}

function fromPdkt(item: PdktHistoryRow): Session {
  return {
    id: `pdkt-${item.id}`,
    module: "PDKT",
    scale: 100,
    date: item.timestamp,
    scenario: item.config?.scenarios?.[0]?.title ?? "Simulasi email",
    score:
      typeof item.evaluation?.score === "number" ? item.evaluation.score : null,
    status: item.evaluation_status ?? null,
  };
}

function fromTelefun(row: TelefunSessionRow): Session {
  const item = mapTelefunSessionRow(row);
  return {
    id: `telefun-${item.id}`,
    module: "Telefun",
    scale: 10,
    date: item.date,
    scenario: item.scenarioTitle || "Simulasi telepon",
    score: item.score ?? null,
    status: item.scoringStatus ?? null,
  };
}

const SCORE = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

function PracticeQuota({
  status,
}: {
  status: PracticeQuotaStatus | undefined;
}) {
  if (!status)
    return <p className="text-[12px] text-fg2">Kuota modul belum tersedia.</p>;
  return status.limit === null ? (
    <p className="text-[12px] text-fg2">Tanpa batas harian</p>
  ) : (
    <QuotaLine status={status} />
  );
}

type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; sessions: Session[]; failed: string[] };

/** Beranda agent: Latihan yang diizinkan, lalu riwayat sesi terakhir. */
export function AgentHome({
  role,
  displayName,
}: {
  role: string | null | undefined;
  displayName: string;
}) {
  const practice =
    buildNavModel(role).groups.find((group) => group.id === "latihan")?.items ??
    [];
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const generation = useRef(0);
  const quota = useApi<PracticeQuotaStatus[]>("/me/practice-quota");

  const load = useCallback(async () => {
    const request = ++generation.current;
    setHistory({ status: "loading" });
    const [ketik, pdkt, telefun] = await Promise.allSettled([
      ketikApi.getHistory({ limit: SESSION_LIMIT }),
      (async () =>
        (await unwrapResponse(
          await pdktClient.history.$get(),
        )) as PdktHistoryRow[])(),
      getTelefunSessions(),
    ]);
    if (request !== generation.current) return;
    if (
      ketik.status === "rejected" &&
      pdkt.status === "rejected" &&
      telefun.status === "rejected"
    ) {
      setHistory({ status: "error" });
      return;
    }
    const sessions = [
      ...(ketik.status === "fulfilled" ? ketik.value.items.map(fromKetik) : []),
      ...(pdkt.status === "fulfilled" ? (pdkt.value ?? []).map(fromPdkt) : []),
      ...(telefun.status === "fulfilled" ? telefun.value.map(fromTelefun) : []),
    ]
      .sort(
        (a, b) =>
          Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id),
      )
      .slice(0, SESSION_LIMIT);
    const failed = [
      ...(ketik.status === "rejected" ? ["KETIK"] : []),
      ...(pdkt.status === "rejected" ? ["PDKT"] : []),
      ...(telefun.status === "rejected" ? ["Telefun"] : []),
    ];
    setHistory({ status: "ready", sessions, failed });
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const retry = (
    <Button
      type="button"
      variant="outline"
      className="min-h-[44px]"
      onClick={() => void load()}
    >
      Coba lagi
    </Button>
  );

  return (
    <div className="home-page">
      <HomeHeader displayName={displayName}>
        {practice.some((item) => item.id === "ketik") && (
          <Link
            to="/ketik"
            className={buttonVariants({ className: "min-h-[44px]" })}
          >
            Lanjutkan KETIK
          </Link>
        )}
      </HomeHeader>

      <AgentQaSummary />

      <section aria-labelledby="home-practice-title" className="home-section">
        <div className="home-section-head">
          <h2 id="home-practice-title" className="home-section-title">
            Latihan
          </h2>
          <p className="home-section-sub">
            Modul simulasi yang bisa Anda pakai
          </p>
        </div>
        {quota.loading && (
          <p role="status" className="pb-3 text-[13px] text-fg2">
            Memuat kuota latihan…
          </p>
        )}
        {quota.error && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px] text-fg2">
            <p>Kuota latihan belum dapat dimuat. Latihan tetap tersedia.</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => void quota.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        )}
        <ul className="home-attention">
          {practice.map((item) => (
            <li key={item.id}>
              <Link
                to={item.href as any}
                className="home-attention-row min-h-[64px] hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
                style={{ "--mc": item.moduleColor } as CSSProperties}
              >
                <item.icon
                  className="nav-icon"
                  style={{ color: item.moduleColor }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[13px] font-semibold text-fg">
                    {item.label}
                  </span>
                  <span className="text-[12px] text-fg2">
                    {item.description}
                  </span>
                  {!quota.loading && !quota.error && (
                    <PracticeQuota
                      status={quota.data?.find(
                        (entry) => entry.module === item.id,
                      )}
                    />
                  )}
                </div>
                <span
                  className={buttonVariants({
                    variant: "outline",
                    className: "pointer-events-none min-h-[44px] shrink-0",
                  })}
                >
                  Mulai latihan
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="home-history-title" className="home-section">
        <div className="home-section-head">
          <h2 id="home-history-title" className="home-section-title">
            Riwayat sesi
          </h2>
          <p className="home-section-sub">Sesi latihan terakhir Anda</p>
        </div>

        {history.status === "loading" && (
          <div className="home-panel flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
            <span className="sr-only">Memuat riwayat sesi</span>
          </div>
        )}

        {history.status === "error" && (
          <QaStatePanel
            type="error"
            compact
            title="Riwayat sesi belum dapat dimuat"
            description="Periksa koneksi Anda, lalu coba lagi."
            action={retry}
          />
        )}

        {history.status === "ready" && history.sessions.length === 0 && (
          <QaStatePanel
            type={history.failed.length ? "warning" : "empty"}
            compact
            title={
              history.failed.length
                ? `Riwayat ${history.failed.join(" dan ")} belum dapat dimuat`
                : "Belum ada sesi latihan"
            }
            description={
              history.failed.length
                ? "Coba lagi untuk memuat riwayat yang belum tampil."
                : "Sesi yang Anda selesaikan akan tampil di sini."
            }
            action={history.failed.length ? retry : undefined}
          />
        )}

        {history.status === "ready" && history.sessions.length > 0 && (
          <>
            <div className="home-panel overflow-x-auto p-0">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-fg2">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-3 font-medium">
                      Waktu
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Modul
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Skenario
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-medium"
                    >
                      Skor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-fg2">
                        <time dateTime={session.date}>
                          {DATE.format(new Date(session.date))}
                        </time>
                      </td>
                      <td className="px-3 py-3 font-medium text-fg">
                        {session.module}
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-3 text-fg">
                        {session.scenario}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {session.score !== null ? (
                          <span className="font-semibold tabular-nums text-fg">
                            {SCORE.format(session.score)} / {session.scale}
                          </span>
                        ) : (
                          <span className="text-[12px] text-fg2">
                            {REVIEW_STATUS[session.status ?? ""] ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.failed.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-fg2">
                <p>
                  Riwayat {history.failed.join(" dan ")} belum dapat dimuat.
                </p>
                {retry}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
