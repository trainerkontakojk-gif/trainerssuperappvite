import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ProfilerPeserta } from "@trainers/types";
import {
  Cake,
  ChevronDown,
  FileSpreadsheet,
  ListPlus,
  PenLine,
  Search,
  Settings2,
  UserPlus,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

import type { BirthdayEntry } from "../../utils/birthday";
import { ProfilerParticipantGrid } from "../table/ProfilerParticipantGrid";

/** Baris ulang tahun hanya muncul untuk yang jatuh dalam rentang ini. */
const BIRTHDAY_WINDOW_DAYS = 7;

const VIEW_LINKS = [
  { label: "Statistik", to: "/profiler/analytics" },
  { label: "Slide", to: "/profiler/slides" },
  { label: "Ekspor", to: "/profiler/export" },
  { label: "Tabel lengkap", to: "/profiler/table" },
] as const;

interface ProfilerBatchWorkspaceProps {
  batchName: string;
  teamName: string | null;
  peserta: ProfilerPeserta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isReadOnly: boolean;
  upcomingBirthdays: BirthdayEntry[];
  onShowBirthdays: () => void;
  onPickPeserta: () => void;
}

const noop = () => {};

export default function ProfilerBatchWorkspace({
  batchName,
  teamName,
  peserta,
  loading,
  error,
  onRetry,
  isReadOnly,
  upcomingBirthdays,
  onShowBirthdays,
  onPickPeserta,
}: ProfilerBatchWorkspaceProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const search = { batch: batchName };

  const visiblePeserta = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return peserta;
    return peserta.filter((p) => (p.nama ?? "").toLowerCase().includes(needle));
  }, [peserta, query]);

  const soonBirthdays = upcomingBirthdays.filter(
    (birthday) => birthday.days <= BIRTHDAY_WINDOW_DAYS,
  );

  const openTable = () => navigate({ to: "/profiler/table", search });

  return (
    <section
      aria-labelledby="profiler-batch-title"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {teamName && (
            <p className="truncate text-sm text-muted-foreground">{teamName}</p>
          )}
          <h1
            id="profiler-batch-title"
            className="break-words font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            {batchName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {loading || error ? "\u00a0" : `${peserta.length} peserta`}
          </p>
        </div>

        {!isReadOnly && (
          <div className="flex shrink-0 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11 flex-1 sm:flex-none"
                  />
                }
              >
                <UserPlus data-icon="inline-start" aria-hidden="true" />
                Tambah peserta
                <ChevronDown data-icon="inline-end" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={onPickPeserta} className="min-h-11">
                  <ListPlus aria-hidden="true" />
                  Pilih dari daftar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/profiler/add", search })}
                  className="min-h-11"
                >
                  <PenLine aria-hidden="true" />
                  Input manual
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/profiler/import", search })}
                  className="min-h-11"
                >
                  <FileSpreadsheet aria-hidden="true" />
                  Impor Excel
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/profiler/teams" })}
                  className="min-h-11"
                >
                  <Settings2 aria-hidden="true" />
                  Manajemen tim
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <nav
        aria-label="Tampilan batch"
        className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          <li>
            <span
              aria-current="page"
              className="inline-flex min-h-11 items-center border-b-2 border-foreground px-3 text-sm font-semibold text-foreground"
            >
              Peserta
            </span>
          </li>
          {VIEW_LINKS.map((view) => (
            <li key={view.to}>
              <Link
                to={view.to}
                search={search}
                className="inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {view.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {soonBirthdays.length > 0 && (
        <button
          type="button"
          onClick={onShowBirthdays}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Cake
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">Ulang tahun: </span>
            {soonBirthdays.slice(0, 2).map((birthday, index) => (
              <span key={`${birthday.nama}-${birthday.tglLahir}`}>
                {index > 0 && " · "}
                <span className="text-foreground">{birthday.nama}</span>{" "}
                <span
                  className={cn(
                    birthday.days === 0
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {birthday.days === 0
                    ? "hari ini"
                    : `${birthday.days} hari lagi`}
                </span>
              </span>
            ))}
            {soonBirthdays.length > 2 && (
              <span className="text-muted-foreground">
                {" "}
                +{soonBirthdays.length - 2} lainnya
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Lihat</span>
        </button>
      )}

      <div className="flex flex-col gap-4">
        {peserta.length > 0 && (
          <div className="relative sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama peserta"
              aria-label="Cari peserta"
              className="h-11 pl-9"
            />
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onRetry}
                className="min-h-11"
              >
                Coba lagi
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading ? (
          <div
            role="status"
            aria-label="Memuat peserta"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <ProfilerParticipantGrid
            displayList={visiblePeserta}
            sortMode={false}
            selectMode={false}
            selectedIds={new Set()}
            toggleSelect={noop}
            density="compact"
            isReadOnly={isReadOnly}
            hasActiveFilters={query.trim().length > 0}
            resetFilters={() => setQuery("")}
            setSelectedPeserta={openTable}
            onViewAnalysis={(id) =>
              navigate({ to: "/sidak/agents/$id", params: { id } })
            }
            onAddPeserta={onPickPeserta}
            dragIndex={null}
            dragOverIndex={null}
            handleDragStart={noop}
            handleDragOver={noop}
            handleDragLeave={noop}
            handleDragEnd={noop}
          />
        )}
      </div>
    </section>
  );
}
