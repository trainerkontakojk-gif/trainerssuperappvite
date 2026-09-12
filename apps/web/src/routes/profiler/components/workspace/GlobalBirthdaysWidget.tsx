import { useEffect, useState } from "react";
import { Cake, RefreshCw, X } from "lucide-react";
import type { ProfilerUpcomingBirthday } from "@trainers/types";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

import { profilerApi } from "../../../../lib/profilerService";
import { formatDate } from "../../utils/birthday";

type Status = "loading" | "error" | "ready";

interface GlobalBirthdaysWidgetProps {
  className?: string;
}

export default function GlobalBirthdaysWidget({
  className,
}: GlobalBirthdaysWidgetProps) {
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
      .catch((err: unknown) => {
        setErrorMsg(
          err instanceof Error ? err.message : "Gagal memuat data ulang tahun.",
        );
        setStatus("error");
      });
  };

  useEffect(() => {
    load();
  }, []);

  const nearest = data[0];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
        aria-label="Lihat ulang tahun terdekat"
        className={cn(
          "h-auto min-h-24 w-full justify-start gap-3 p-3.5 text-left whitespace-normal",
          className,
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Cake aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">
            Ulang Tahun Terdekat
          </span>
          <span className="text-[11px] text-muted-foreground">
            Seluruh data
          </span>
          {status === "loading" && <Skeleton className="mt-1 h-4 w-2/3" />}
          {status === "error" && (
            <span className="mt-1 max-w-full truncate text-xs font-medium text-destructive">
              {errorMsg}
            </span>
          )}
          {status === "ready" &&
            (nearest ? (
              <span className="mt-1 flex min-w-0 flex-col items-start">
                <span className="max-w-full truncate font-outfit text-sm font-semibold tracking-tight text-foreground">
                  {nearest.nama}
                </span>
                <span className="text-xs text-muted-foreground">
                  {nearest.daysUntil === 0
                    ? "Hari ini!"
                    : `${nearest.daysUntil} hari lagi`}
                </span>
              </span>
            ) : (
              <span className="mt-1 text-xs text-muted-foreground">
                No data available
              </span>
            ))}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="relative border-b border-border p-5 pr-16 sm:p-6 sm:pr-16">
            <DialogTitle className="flex items-center gap-2 font-outfit text-lg font-bold">
              <Cake aria-hidden="true" />
              Ulang Tahun Terdekat
            </DialogTitle>
            <DialogDescription>
              Acara mendatang dari seluruh data peserta.
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() => setOpen(false)}
              aria-label="Tutup daftar ulang tahun"
              title="Tutup"
              className="absolute top-3 right-3 min-h-11 min-w-11"
            >
              <X aria-hidden="true" />
            </Button>
          </DialogHeader>

          <div className="max-h-[min(70vh,24rem)] overflow-y-auto p-4 custom-scrollbar sm:p-5">
            {status === "loading" && (
              <div
                className="flex flex-col gap-3"
                role="status"
                aria-label="Memuat ulang tahun"
              >
                {[0, 1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Skeleton className="size-10 shrink-0 rounded-lg" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <AlertDescription className="flex flex-col items-start gap-3">
                  <span>{errorMsg}</span>
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
                </AlertDescription>
              </Alert>
            )}

            {status === "ready" && data.length === 0 && (
              <Empty className="min-h-48 p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Cake aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Tidak ada data ulang tahun.</EmptyTitle>
                  <EmptyDescription>
                    Data ulang tahun peserta akan muncul di sini.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {status === "ready" && data.length > 0 && (
              <div className="flex flex-col gap-2">
                {data.map((birthday) => {
                  const isToday = birthday.daysUntil === 0;
                  return (
                    <div
                      key={birthday.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3",
                        isToday
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/20",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          isToday
                            ? "bg-primary-foreground/15"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Cake aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm font-semibold",
                            isToday
                              ? "text-primary-foreground"
                              : "text-foreground",
                          )}
                        >
                          {birthday.nama}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-xs",
                            isToday
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatDate(birthday.tgl_lahir)} · {birthday.age}{" "}
                          tahun
                        </span>
                        <span
                          className={cn(
                            "block truncate text-xs",
                            isToday
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground",
                          )}
                        >
                          {birthday.batch_name}
                        </span>
                      </span>
                      <Badge
                        variant={isToday ? "secondary" : "outline"}
                        className="shrink-0"
                      >
                        {isToday
                          ? "HARI INI"
                          : `${birthday.daysUntil} HARI LAGI`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {status === "ready" && data.length > 0 && (
            <div className="border-t border-border px-5 py-3">
              <p className="text-center text-xs text-muted-foreground">
                Menampilkan 5 data terdekat
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
