import { useEffect, useState } from "react";
import { Cake, RefreshCw } from "lucide-react";
import { profilerApi } from "../../../../lib/profilerService";
import type { ProfilerUpcomingBirthday } from "@trainers/types";
import { formatDate } from "../../utils/birthday";

type Status = "loading" | "error" | "ready";

export default function GlobalBirthdaysWidget() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ProfilerUpcomingBirthday[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [open, setOpen] = useState(false);

  const load = () => {
    setStatus("loading");
    profilerApi
      .getUpcomingBirthdays(5)
      .then((res) => {
        setData(res ?? []);
        setStatus("ready");
      })
      .catch((err: any) => {
        setErrorMsg(err?.message || "Gagal memuat data ulang tahun.");
        setStatus("error");
      });
  };

  useEffect(() => {
    load();
  }, []);

  const nearest = data[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left transition-all duration-150 hover:border-fg3 hover:bg-surface/80"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-fg2 transition-colors duration-150">
          <Cake size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">
            Ulang Tahun Terdekat
          </span>
          <p className="mt-0.5 text-[10px] font-medium text-fg3">
            Seluruh data
          </p>
          {status === "loading" && (
            <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-surface" />
          )}
          {status === "error" && (
            <p className="mt-1 truncate text-xs font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          {status === "ready" &&
            (nearest ? (
              <div className="mt-0.5">
                <p className="truncate text-sm font-outfit font-semibold tracking-tight text-fg">
                  {nearest.nama}
                </p>
                <p className="text-[11px] text-fg2">
                  {nearest.daysUntil === 0
                    ? "Hari ini!"
                    : `${nearest.daysUntil} hari lagi`}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-fg3">No data available</p>
            ))}
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6 backdrop-blur-md"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border p-6">
              <h3 className="flex items-center gap-2 font-outfit text-lg font-bold text-fg">
                <Cake size={20} className="text-fg" />
                Ulang Tahun Terdekat
              </h3>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-fg3">
                Acara mendatang · Seluruh data
              </p>
            </div>

            <div className="max-h-[300px] space-y-2 overflow-y-auto p-4 custom-scrollbar">
              {status === "loading" && (
                <>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                    >
                      <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-surface" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-surface" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface" />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {status === "error" && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <p className="text-xs font-medium text-destructive">
                    {errorMsg}
                  </p>
                  <button
                    onClick={load}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-fg2 transition-colors hover:bg-surface hover:text-fg"
                  >
                    <RefreshCw size={12} />
                    Coba lagi
                  </button>
                </div>
              )}

              {status === "ready" && data.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-fg3">
                    <Cake size={18} />
                  </div>
                  <p className="text-xs font-medium italic text-fg3">
                    Tidak ada data ulang tahun.
                  </p>
                </div>
              )}

              {status === "ready" &&
                data.map((b) => {
                  const isToday = b.daysUntil === 0;
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                        isToday
                          ? "border-transparent bg-inv-bg text-inv-fg"
                          : "border-border bg-background"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                          isToday
                            ? "border-transparent bg-inv-fg/15 text-inv-fg"
                            : "border-border bg-surface text-fg2"
                        }`}
                      >
                        <Cake size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${
                            isToday ? "text-inv-fg" : "text-fg"
                          }`}
                        >
                          {b.nama}
                        </p>
                        <p
                          className={`mt-0.5 truncate text-[10px] ${
                            isToday ? "text-inv-fg/80" : "text-fg3"
                          }`}
                        >
                          {formatDate(b.tgl_lahir)} · {b.age} TAHUN
                        </p>
                        <p
                          className={`truncate text-[10px] font-medium ${
                            isToday ? "text-inv-fg/70" : "text-fg3"
                          }`}
                        >
                          {b.batch_name}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-[10px] font-medium tracking-wide ${
                            isToday ? "animate-pulse text-inv-fg" : "text-fg3"
                          }`}
                        >
                          {isToday ? "HARI INI" : `${b.daysUntil} HARI LAGI`}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>

            {status === "ready" && data.length > 0 && (
              <div className="border-t border-border px-6 pb-4 pt-3">
                <p className="text-center text-[10px] font-medium text-fg3">
                  Menampilkan 5 data terdekat
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
