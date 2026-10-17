import { lazy, Suspense, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerYear,
} from "@trainers/types";
import {
  Cake,
  ChevronDown,
  FileSpreadsheet,
  ListPlus,
  PenLine,
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

import type { BirthdayEntry } from "../../utils/birthday";
import type { ProfilerBatchView } from "./batch-views";
import ProfilerParticipantDetail from "../detail/ProfilerParticipantDetail";
import ProfilerPesertaPanel, {
  type ProfilerPesertaLayout,
} from "./ProfilerPesertaPanel";

/** Baris ulang tahun hanya muncul untuk yang jatuh dalam rentang ini. */
const BIRTHDAY_WINDOW_DAYS = 7;

const VIEW_TABS: { label: string; view: ProfilerBatchView | null }[] = [
  { label: "Peserta", view: null },
  { label: "Statistik", view: "statistik" },
  { label: "Slide", view: "slide" },
  { label: "Ekspor", view: "ekspor" },
];

// Panel berat (recharts, ekspor PPTX/PDF, canvas slide) dimuat saat tabnya dibuka.
const ProfilerStatsPanel = lazy(() => import("./panels/ProfilerStatsPanel"));
const ProfilerSlidesPanel = lazy(() => import("./panels/ProfilerSlidesPanel"));
const ProfilerExportPanel = lazy(() => import("./panels/ProfilerExportPanel"));

interface ProfilerBatchWorkspaceProps {
  batchName: string;
  teamName: string | null;
  /** Tab aktif dari `?view=`; `null` = daftar peserta. */
  view: ProfilerBatchView | null;
  participantId: string | null;
  /** `?layout=tabel` di tab Peserta. */
  layout: ProfilerPesertaLayout;
  /** `?edit=1`: form edit peserta `participantId`. */
  editing: boolean;
  peserta: ProfilerPeserta[];
  folders: ProfilerFolder[];
  years: ProfilerYear[];
  onPesertaChange: (next: ProfilerPeserta[]) => void;
  onMoved: (ids: string[], targetFolder: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isReadOnly: boolean;
  upcomingBirthdays: BirthdayEntry[];
  onShowBirthdays: () => void;
  onPickPeserta: () => void;
  onOpenTeams: () => void;
}

export default function ProfilerBatchWorkspace({
  batchName,
  teamName,
  view,
  participantId,
  layout,
  editing,
  peserta,
  folders,
  years,
  onPesertaChange,
  onMoved,
  loading,
  error,
  onRetry,
  isReadOnly,
  upcomingBirthdays,
  onShowBirthdays,
  onPickPeserta,
  onOpenTeams,
}: ProfilerBatchWorkspaceProps) {
  const navigate = useNavigate();
  const search = { batch: batchName };
  const layoutSearch = layout === "tabel" ? { layout } : {};

  const soonBirthdays = upcomingBirthdays.filter(
    (birthday) => birthday.days <= BIRTHDAY_WINDOW_DAYS,
  );

  // Profil peserta hanya di tab Peserta; tab Slide memakai `participant` sendiri.
  const profileId = view ? null : participantId;
  const profile =
    profileId && !loading
      ? (peserta.find((p) => p.id === profileId) ?? null)
      : null;
  const staleProfile = Boolean(profileId) && !loading && !error && !profile;

  const openProfile = (
    id: string | null,
    options: { edit?: boolean; replace?: boolean } = {},
  ) =>
    navigate({
      to: "/profiler",
      search: id
        ? { ...search, ...layoutSearch, participant: id, ...(options.edit ? { edit: 1 } : {}) }
        : { ...search, ...layoutSearch },
      replace: options.replace,
    });

  useEffect(() => {
    if (staleProfile) openProfile(null, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleProfile]);

  if (profile) {
    return (
      <ProfilerParticipantDetail
        batchName={batchName}
        peserta={peserta}
        participant={profile}
        editing={editing}
        isReadOnly={isReadOnly}
        folders={folders}
        years={years}
        onNavigate={(id, options) => openProfile(id, options)}
        onPesertaChange={onPesertaChange}
        onMoved={onMoved}
      />
    );
  }

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
                  Pilih dari folder lain
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    navigate({
                      to: "/profiler",
                      search: { ...search, view: "tambah" },
                    })
                  }
                  className="min-h-11"
                >
                  <PenLine aria-hidden="true" />
                  Isi manual
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    navigate({
                      to: "/profiler",
                      search: { ...search, view: "impor" },
                    })
                  }
                  className="min-h-11"
                >
                  <FileSpreadsheet aria-hidden="true" />
                  Impor dari Excel
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenTeams} className="min-h-11">
                  <Settings2 aria-hidden="true" />
                  Kelola daftar tim
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
          {VIEW_TABS.map((tab) => {
            const isActive = tab.view === view;
            return (
              <li key={tab.label}>
                <Link
                  to="/profiler"
                  search={tab.view ? { ...search, view: tab.view } : search}
                  // TanStack memberi aria-current ke link aktif; "Peserta" harus
                  // cocok persis agar tidak ikut aktif di tab lain, sedangkan
                  // tab lain cocok parsial (Slide membawa `participant`).
                  activeOptions={{ exact: tab.view === null }}
                  className={cn(
                    "inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-foreground font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

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
      ) : view ? (
        <Suspense fallback={<PanelFallback />}>
          {view === "statistik" ? (
            <ProfilerStatsPanel peserta={peserta} />
          ) : view === "slide" ? (
            <ProfilerSlidesPanel
              batchName={batchName}
              peserta={peserta}
              participantId={participantId}
              onParticipantChange={(id) =>
                navigate({
                  to: "/profiler",
                  search: id
                    ? { ...search, view: "slide", participant: id }
                    : { ...search, view: "slide" },
                  replace: true,
                })
              }
            />
          ) : (
            <ProfilerExportPanel batchName={batchName} peserta={peserta} />
          )}
        </Suspense>
      ) : (
        <>
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
                <span className="font-medium text-foreground">
                  Ulang tahun:{" "}
                </span>
                {soonBirthdays.slice(0, 2).map((birthday, index) => (
                  <span key={`${birthday.nama}-${birthday.tglLahir}`}>
                    {index > 0 && " · "}
                    <span className="text-foreground">
                      {birthday.nama}
                    </span>{" "}
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
              <span className="shrink-0 text-xs text-muted-foreground">
                Lihat
              </span>
            </button>
          )}

          <ProfilerPesertaPanel
            batchName={batchName}
            peserta={peserta}
            layout={layout}
            isReadOnly={isReadOnly}
            folders={folders}
            years={years}
            onLayoutChange={(next) =>
              navigate({
                to: "/profiler",
                search: next === "tabel" ? { ...search, layout: next } : search,
                replace: true,
              })
            }
            onOpenProfile={(id, options) => openProfile(id, options)}
            onAddPeserta={onPickPeserta}
            onPesertaChange={onPesertaChange}
            onMoved={onMoved}
          />
        </>
      )}
    </section>
  );
}

function PanelFallback() {
  return (
    <div role="status" aria-label="Memuat tampilan">
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
