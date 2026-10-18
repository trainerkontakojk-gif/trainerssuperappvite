import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { MonitoringSessionRow } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { MODULE_LABELS, STATUS_LABELS } from "../history-search";
import {
  formatScoreValue,
  formatSessionDuration,
  formatSessionTime,
} from "../utils/formatting";

function statusClass(status: MonitoringSessionRow["review_status"]) {
  if (status === "failed") return "text-destructive";
  return status === "completed" ? "text-foreground" : "text-muted-foreground";
}

function Score({ row }: { row: MonitoringSessionRow }) {
  if (row.score === null) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="tabular-nums">
      <span className="font-semibold">{formatScoreValue(row.score)}</span>
      <span className="text-muted-foreground">/{row.score_scale}</span>
    </span>
  );
}

function RowMenu({
  row,
  canDelete,
  onOpen,
  onDelete,
}: {
  row: MonitoringSessionRow;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Aksi sesi ${row.scenario_title}`}
            className="size-11"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1.5">
        <DropdownMenuItem className="min-h-11" onClick={onOpen}>
          Buka detail
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11 text-destructive"
              onClick={onDelete}
            >
              Hapus sesi…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HistoryTable({
  rows,
  canDelete,
  onOpen,
  onDelete,
}: {
  rows: MonitoringSessionRow[];
  canDelete: boolean;
  onOpen: (row: MonitoringSessionRow) => void;
  onDelete: (row: MonitoringSessionRow) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table
          aria-label="Riwayat sesi"
          className="w-full min-w-[56rem] text-sm"
        >
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="w-32 px-4 py-2.5 font-medium">Waktu</th>
              <th className="px-4 py-2.5 font-medium">Peserta</th>
              <th className="w-24 px-4 py-2.5 font-medium">Modul</th>
              <th className="px-4 py-2.5 font-medium">Skenario</th>
              <th className="w-32 px-4 py-2.5 text-right font-medium">
                Durasi
              </th>
              <th className="w-24 px-4 py-2.5 text-right font-medium">Skor</th>
              <th className="w-32 px-4 py-2.5 font-medium">Status</th>
              <th className="w-14 px-2 py-2.5">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.module}-${row.id}`}
                onClick={(event) => {
                  // Klik di menu (portal) ikut naik ke baris lewat React; abaikan.
                  if (event.currentTarget.contains(event.target as Node)) {
                    onOpen(row);
                  }
                }}
                className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {formatSessionTime(row.occurred_at)}
                </td>
                <td className="max-w-64 truncate px-4 py-2">
                  <span className="font-medium text-foreground">
                    {row.participant.name ?? "Tidak tercatat"}
                  </span>
                  {row.participant.batch ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {row.participant.batch}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {MODULE_LABELS[row.module]}
                </td>
                <td className="max-w-72 px-4 py-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row);
                    }}
                    className="block max-w-full truncate text-left hover:underline focus-visible:underline"
                  >
                    {row.scenario_title}
                  </button>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {formatSessionDuration(row.duration_seconds)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Score row={row} />
                </td>
                <td className={`px-4 py-2 ${statusClass(row.review_status)}`}>
                  {STATUS_LABELS[row.review_status]}
                </td>
                <td className="px-2 py-0.5 text-right">
                  <RowMenu
                    row={row}
                    canDelete={canDelete}
                    onOpen={() => onOpen(row)}
                    onDelete={() => onDelete(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul
        aria-label="Riwayat sesi"
        className="divide-y divide-border md:hidden"
      >
        {rows.map((row) => (
          <li key={`${row.module}-${row.id}`}>
            <button
              type="button"
              onClick={() => onOpen(row)}
              className="flex w-full min-h-11 flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">
                  {row.scenario_title}
                </span>
                {row.score !== null ? (
                  <Score row={row} />
                ) : (
                  <span
                    className={`shrink-0 text-sm ${statusClass(row.review_status)}`}
                  >
                    {STATUS_LABELS[row.review_status]}
                  </span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">
                {row.participant.name ?? "Tidak tercatat"} ·{" "}
                {MODULE_LABELS[row.module]} ·{" "}
                {formatSessionTime(row.occurred_at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function HistoryPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Halaman riwayat"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm text-muted-foreground"
    >
      <span className="tabular-nums">
        {first}–{last} dari {total} sesi
      </span>
      <span className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="min-h-11"
        >
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          Sebelumnya
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={last >= total}
          onClick={() => onPage(page + 1)}
          className="min-h-11"
        >
          Berikutnya
          <ChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </span>
    </nav>
  );
}
