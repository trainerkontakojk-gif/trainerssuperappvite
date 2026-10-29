import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminClient, unwrapResponse } from "../../../lib/api";
import QaStatePanel from "../../../components/ui/QaStatePanel";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";

interface ActivityLog {
  id: number | string;
  user_name?: string | null;
  action?: string | null;
  created_at: string;
}

const RELATIVE = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

function formatTimeAgo(dateString: string): string {
  const seconds = Math.round(
    (new Date(dateString).getTime() - Date.now()) / 1000,
  );
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size)
      return RELATIVE.format(Math.round(seconds / size), unit);
  return RELATIVE.format(Math.min(-1, seconds), "second");
}

function normalizeActionText(action: string | null | undefined): string {
  if (!action) return "";
  return action
    .replace(/QA Analyzer/gi, "SIDAK")
    .replace(/Sidak/gi, "SIDAK")
    .replace(/Profiler/gi, "KTP");
}

/** Aktivitas terakhir, hanya baca; halaman lengkap tersedia di `/kegiatan`. */
export function ActivityFeed() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; logs: ActivityLog[] }
  >({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const logs = (await unwrapResponse(
        await (adminClient["activity-logs"] as any).$get(),
      )) as ActivityLog[];
      setState({ status: "ready", logs: (logs ?? []).slice(0, 5) });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="home-activity-title" className="home-section">
      <div className="home-section-head home-section-head-row">
        <h2 id="home-activity-title" className="home-section-title">
          Aktivitas terakhir
        </h2>
        <Link to="/kegiatan" className="home-link">
          Lihat semua<span className="sr-only"> aktivitas</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      {state.status === "loading" && (
        <div className="home-panel flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
          <span className="sr-only">Memuat aktivitas</span>
        </div>
      )}
      {state.status === "error" && (
        <QaStatePanel
          type="error"
          compact
          title="Aktivitas belum dapat dimuat"
          description="Periksa koneksi Anda, lalu coba lagi."
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
        (state.logs.length === 0 ? (
          <QaStatePanel
            type="empty"
            compact
            title="Belum ada aktivitas"
            description="Aktivitas pengguna akan tampil di sini."
          />
        ) : (
          <ul className="home-rows">
            {state.logs.map((log) => {
              const name = log.user_name || "Pengguna internal";
              return (
                <li key={log.id} className="home-activity-row">
                  <span className="home-avatar" aria-hidden="true">
                    {name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-fg">
                      {name}
                    </p>
                    <p className="truncate text-[13px] text-fg2">
                      {normalizeActionText(log.action)}
                    </p>
                  </div>
                  <time
                    dateTime={log.created_at}
                    className="home-activity-time"
                  >
                    {formatTimeAgo(log.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
