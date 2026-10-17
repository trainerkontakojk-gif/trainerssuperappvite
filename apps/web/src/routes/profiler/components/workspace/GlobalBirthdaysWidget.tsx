import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ProfilerUpcomingBirthday } from "@trainers/types";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

import { profilerApi } from "../../../../lib/profilerService";
import { formatDate } from "../../utils/birthday";

type Status = "loading" | "error" | "ready";

/** Jumlah ulang tahun terdekat yang ditampilkan di ringkasan tahun. */
const LIMIT = 5;

interface GlobalBirthdaysWidgetProps {
  className?: string;
}

/** Daftar ulang tahun terdekat dari seluruh data, sejajar dengan tabel folder. */
export default function GlobalBirthdaysWidget({
  className,
}: GlobalBirthdaysWidgetProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ProfilerUpcomingBirthday[]>([]);

  const load = () => {
    setStatus("loading");
    profilerApi
      .getUpcomingBirthdays(LIMIT)
      .then((res) => {
        setData(res ?? []);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section
      aria-labelledby="profiler-birthdays-title"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2
          id="profiler-birthdays-title"
          className="text-sm font-semibold text-foreground"
        >
          Ulang tahun terdekat
        </h2>
        <span className="text-xs text-muted-foreground">Seluruh data</span>
      </div>

      {status === "loading" ? (
        <div
          role="status"
          aria-label="Memuat ulang tahun"
          className="flex flex-col gap-2 p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p role="alert" className="text-sm text-destructive">
            Gagal memuat ulang tahun.
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={load}
            className="min-h-11"
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      ) : data.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Belum ada data tanggal lahir.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((birthday) => {
            const isToday = birthday.daysUntil === 0;
            return (
              <li
                key={birthday.id}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {birthday.nama}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDate(birthday.tgl_lahir)} · {birthday.age} tahun ·{" "}
                    {birthday.batch_name}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm tabular-nums",
                    isToday
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {isToday ? "Hari ini" : `${birthday.daysUntil} hari lagi`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
