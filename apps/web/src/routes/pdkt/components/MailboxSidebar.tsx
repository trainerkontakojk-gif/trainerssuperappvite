import { useState } from "react";
import {
  Check,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "cn";
import type { PdktMailboxListItem } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { PDKT_NO_SUBJECT } from "../utils/emailDisplay";
import { Input } from "../../../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

export type MailboxFilter = "all" | "open" | "replied";

/** Status telaah per email yang sudah dibalas, untuk baris kotak masuk. */
export interface MailboxReviewState {
  status:
    | "not_started"
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "unavailable";
  score: number | null;
}

interface MailboxSidebarProps {
  items: PdktMailboxListItem[];
  /** Jumlah email `open` di seluruh kotak masuk, untuk label filter. */
  openCount: number;
  reviews: Record<string, MailboxReviewState | undefined>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  creationDisabled?: boolean;
  onSettings: () => void;
  onHistory: () => void;

  filter: MailboxFilter;
  onFilterChange: (filter: MailboxFilter) => void;

  selectedBulkIds: Set<string>;
  onToggleBulkId: (id: string) => void;
  isBulkMode: boolean;
  onToggleBulkMode: () => void;
  onBulkDelete: () => void;
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function RowStatus({
  item,
  review,
}: {
  item: PdktMailboxListItem;
  review: MailboxReviewState | undefined;
}) {
  if (item.status === "open") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-module-pdkt"
        />
        Belum dibalas
      </span>
    );
  }
  if (review?.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <TriangleAlert
          aria-hidden="true"
          className="size-3 text-chart-orange"
        />
        Telaah gagal
      </span>
    );
  }
  if (review?.status === "completed" && review.score !== null) {
    return (
      <span className="flex w-full items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <Check
            aria-hidden="true"
            className="size-3 text-chart-green"
            strokeWidth={3}
          />
          Dibalas
        </span>
        <span className="font-semibold tabular-nums text-foreground">
          Skor {review.score}
        </span>
      </span>
    );
  }
  if (review?.status === "not_started") {
    return <span>Dibalas · belum ditelaah</span>;
  }
  if (review?.status === "unavailable")
    return <span>Dibalas · telaah dihapus</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2
        aria-hidden="true"
        className="size-3 animate-spin motion-reduce:animate-none"
      />
      Sedang ditelaah…
    </span>
  );
}

/** Kotak masuk tahap Pahami: pencarian, filter status, dan daftar email. */
export function MailboxSidebar({
  items,
  openCount,
  reviews,
  selectedId,
  onSelect,
  onNew,
  creationDisabled = false,
  onSettings,
  onHistory,
  filter,
  onFilterChange,
  selectedBulkIds,
  onToggleBulkId,
  isBulkMode,
  onToggleBulkMode,
  onBulkDelete,
}: MailboxSidebarProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredItems = query
    ? items.filter(
        (item) =>
          item.sender_name.toLowerCase().includes(query) ||
          item.subject.toLowerCase().includes(query),
      )
    : items;

  const filters: { id: MailboxFilter; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "open", label: `Belum dibalas · ${openCount}` },
    { id: "replied", label: "Dibalas" },
  ];

  return (
    <aside
      aria-label="Kotak masuk"
      className="flex h-full w-full shrink-0 flex-col border-r border-border bg-surface-elevated"
    >
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Kotak masuk</h2>
          {isBulkMode ? (
            <div className="flex items-center gap-1">
              {selectedBulkIds.size > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBulkDelete}
                  className="min-h-[44px] gap-1.5 px-3 text-xs"
                >
                  <Trash2 aria-hidden="true" className="text-destructive" />
                  Hapus {selectedBulkIds.size} email
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={onToggleBulkMode}
                className="min-h-[44px] px-3 text-xs font-semibold"
              >
                Batal
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                onClick={onNew}
                disabled={creationDisabled}
                className="min-h-[44px] gap-1.5 px-3.5 text-xs font-semibold"
              >
                <Plus aria-hidden="true" />
                Email baru
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Menu lainnya"
                      className="min-h-[44px] min-w-[44px]"
                    />
                  }
                >
                  <MoreHorizontal aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-44"
                  positionerClassName="z-[110]"
                >
                  <DropdownMenuItem
                    onClick={onHistory}
                    className="min-h-[44px]"
                  >
                    Riwayat
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onSettings}
                    disabled={creationDisabled}
                    className="min-h-[44px]"
                  >
                    Pengaturan
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onToggleBulkMode}
                    className="min-h-[44px]"
                  >
                    Pilih beberapa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Cari email"
            placeholder="Cari pengirim atau subjek"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-h-[44px] rounded-lg bg-background pl-9 text-xs"
          />
        </div>

        <div
          role="group"
          aria-label="Saring email"
          className="flex gap-1 rounded-lg bg-muted p-1"
        >
          {filters.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => onFilterChange(tab.id)}
              className={cn(
                "min-h-[44px] flex-auto rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                filter === tab.id
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-fg2 hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <Mail
              aria-hidden="true"
              className="mb-3 size-10 text-muted-foreground"
            />
            <p className="text-xs font-medium text-muted-foreground">
              {query
                ? "Tidak ada email yang cocok."
                : filter !== "all"
                  ? "Belum ada email di filter ini."
                  : "Kotak masuk masih kosong."}
            </p>
            {!(query || filter !== "all") && (
              <Button
                type="button"
                variant="outline"
                onClick={onNew}
                disabled={creationDisabled}
                className="mt-4 min-h-[44px] text-xs"
              >
                Buat email pertama
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredItems.map((item) => {
              const selected = !isBulkMode && selectedId === item.id;
              const canDelete = item.permissions?.can_delete !== false;
              // Teks meta di atas latar ungu baris terpilih memakai fg2 agar kontras.
              const metaText = selected ? "text-fg2" : "text-muted-foreground";
              const content = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {item.sender_name}
                    </span>
                    <span className={cn("shrink-0 text-xs", metaText)}>
                      {formatTime(item.last_activity_at)}
                    </span>
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">
                    {item.subject || PDKT_NO_SUBJECT}
                  </span>
                  <span className={cn("flex text-xs", metaText)}>
                    <RowStatus item={item} review={reviews[item.id]} />
                  </span>
                </>
              );

              return (
                <li key={item.id}>
                  {isBulkMode ? (
                    <label
                      className={cn(
                        "flex cursor-pointer gap-3 px-4 py-3.5",
                        canDelete
                          ? "hover:bg-muted/50"
                          : "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBulkIds.has(item.id)}
                        disabled={!canDelete}
                        onChange={() => onToggleBulkId(item.id)}
                        aria-label={`Pilih ${item.subject || "email ini"}`}
                        className="mt-1 size-4 shrink-0"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        {content}
                      </span>
                    </label>
                  ) : (
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        selected
                          ? "bg-module-pdkt/10 shadow-[inset_2px_0_0_var(--module-pdkt)]"
                          : "hover:bg-muted/50",
                      )}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
