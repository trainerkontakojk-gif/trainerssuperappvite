import React, { useState } from "react";
import {
  Mail,
  Search,
  Inbox,
  Trash2,
  Plus,
  Settings,
  History,
  BarChart3,
  CheckSquare,
} from "lucide-react";
import type { PdktMailboxListItem } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

function formatCreatorLabel(item: PdktMailboxListItem) {
  const creator = item.created_by_user;
  if (!creator) return "Dibuat oleh user lama";
  if (creator.is_current_user) return "Dibuat oleh Anda";
  const role = creator.role ? ` · ${creator.role}` : "";
  return `Dibuat oleh ${creator.full_name}${role}`;
}

interface MailboxSidebarProps {
  items: PdktMailboxListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings?: () => void;
  onHistory?: () => void;
  onUsage?: () => void;

  filter: "all" | "open" | "replied";
  onFilterChange: (filter: "all" | "open" | "replied") => void;

  // Bulk selection props
  selectedBulkIds: Set<string>;
  onToggleBulkId: (id: string) => void;
  isBulkMode: boolean;
  onToggleBulkMode: () => void;
  onBulkDelete: () => void;
}

export const MailboxSidebar: React.FC<MailboxSidebarProps> = ({
  items,
  selectedId,
  onSelect,
  onNew,
  onSettings,
  onHistory,
  onUsage,
  filter,
  onFilterChange,
  selectedBulkIds,
  onToggleBulkId,
  isBulkMode,
  onToggleBulkMode,
  onBulkDelete,
}) => {
  const [search, setSearch] = useState("");

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.sender_name.toLowerCase().includes(search.toLowerCase()) ||
      item.subject.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <aside
      aria-label="Mailbox"
      className="flex h-full w-full shrink-0 flex-col border-r border-border bg-card md:w-80"
    >
      {/* Sidebar Header */}
      <div className="space-y-4 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Inbox
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            Mailbox
          </h2>
          <div className="flex items-center gap-1">
            {isBulkMode ? (
              <div className="flex items-center gap-1">
                {selectedBulkIds.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onBulkDelete}
                    className="min-h-11 min-w-11 text-destructive hover:bg-destructive/10"
                    title={`Hapus ${selectedBulkIds.size} email terpilih`}
                    aria-label={`Hapus ${selectedBulkIds.size} email terpilih`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={onToggleBulkMode}
                  className="min-h-11 px-3 text-xs font-semibold"
                >
                  Batal
                </Button>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleBulkMode}
                  className="min-h-11 min-w-11"
                  title="Pilih Banyak"
                  aria-label="Pilih Banyak"
                >
                  <CheckSquare aria-hidden="true" />
                </Button>
                {onSettings && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onSettings}
                    className="min-h-11 min-w-11"
                    title="Pengaturan"
                    aria-label="Pengaturan"
                  >
                    <Settings aria-hidden="true" />
                  </Button>
                )}
                {onHistory && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onHistory}
                    className="min-h-11 min-w-11"
                    title="Riwayat"
                    aria-label="Riwayat"
                  >
                    <History aria-hidden="true" />
                  </Button>
                )}
                {onUsage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onUsage}
                    className="min-h-11 min-w-11"
                    title="Usage Bulan Ini"
                    aria-label="Usage Bulan Ini"
                  >
                    <BarChart3 aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onNew}
                  className="ml-1 min-h-11 min-w-11"
                  title="Buat Simulasi"
                  aria-label="Buat Simulasi"
                >
                  <Plus aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg3)] group-focus-within:text-[var(--fg)] transition-colors" />
          <Input
            type="text"
            aria-label="Cari email"
            placeholder="Cari email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 rounded-lg border-input bg-background pl-9 text-xs"
          />
        </div>

        {/* Filter Tabs */}
        <div
          role="group"
          aria-label="Filter mailbox"
          className="flex w-full rounded-lg border border-border bg-muted p-1"
        >
          {[
            { id: "all", label: "Semua" },
            { id: "open", label: "Belum Dibalas" },
            { id: "replied", label: "Terbalas" },
          ].map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={filter === tab.id ? "secondary" : "ghost"}
              aria-pressed={filter === tab.id}
              onClick={() =>
                onFilterChange(tab.id as "all" | "open" | "replied")
              }
              className="min-h-11 flex-1 rounded-md px-1.5 text-[11px]"
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Mail className="w-10 h-10 text-[var(--fg3)] mb-3" />
            <p className="text-xs font-medium text-[var(--fg2)] leading-relaxed">
              {search || filter !== "all"
                ? "Hasil Tidak Ditemukan"
                : "Kotak Masuk Kosong"}
            </p>
            {!(search || filter !== "all") && (
              <Button
                type="button"
                variant="outline"
                onClick={onNew}
                className="mt-4 min-h-11 text-xs"
              >
                Buat Email Pertama
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredItems.map((item) => {
              const isSelected = selectedBulkIds.has(item.id);
              const canDelete = item.permissions?.can_delete !== false;

              return (
                <div
                  key={item.id}
                  role={isBulkMode ? "group" : "button"}
                  tabIndex={isBulkMode ? -1 : 0}
                  aria-pressed={
                    !isBulkMode ? selectedId === item.id : undefined
                  }
                  aria-label={
                    !isBulkMode
                      ? `${item.sender_name}: ${item.subject || "Tanpa subjek"}`
                      : undefined
                  }
                  aria-disabled={isBulkMode && !canDelete ? true : undefined}
                  onClick={() => {
                    if (isBulkMode) {
                      if (canDelete) {
                        onToggleBulkId(item.id);
                      }
                    } else {
                      onSelect(item.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      !isBulkMode &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onSelect(item.id);
                    }
                  }}
                  className={`w-full text-left p-4 transition-all relative flex gap-3 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)] ${
                    isBulkMode
                      ? isSelected
                        ? "bg-[var(--bg)]"
                        : "hover:bg-[var(--bg)]"
                      : selectedId === item.id
                        ? "bg-[var(--bg)] ring-1 ring-inset ring-[var(--border)]"
                        : "hover:bg-[var(--bg)]"
                  } ${isBulkMode && !canDelete ? "opacity-50" : ""}`}
                  style={{
                    cursor:
                      isBulkMode && !canDelete ? "not-allowed" : "pointer",
                  }}
                >
                  {isBulkMode && (
                    <div
                      className="shrink-0 flex items-center pr-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!canDelete}
                        onChange={() => onToggleBulkId(item.id)}
                        aria-label={`Pilih ${item.subject || "email ini"}`}
                        className="w-4 h-4 text-[var(--module-pdkt)] border-[var(--border)] rounded focus:ring-[var(--fg)] cursor-pointer disabled:cursor-not-allowed"
                        title={
                          !canDelete
                            ? "Anda tidak memiliki izin menghapus email ini"
                            : ""
                        }
                      />
                    </div>
                  )}

                  <div
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      !isBulkMode && selectedId === item.id
                        ? "bg-[var(--surface)] text-[var(--fg)] border border-[var(--border)]"
                        : "bg-[var(--bg)] text-[var(--fg2)] border border-[var(--border)]"
                    }`}
                  >
                    {getInitials(item.sender_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`text-xs truncate ${item.status === "open" ? "font-semibold text-[var(--fg)]" : "font-medium text-[var(--fg2)]"}`}
                      >
                        {item.sender_name}
                      </span>
                      <span className="text-[10px] text-[var(--fg3)] whitespace-nowrap">
                        {formatTime(item.last_activity_at)}
                      </span>
                    </div>

                    <div
                      className={`text-xs truncate mb-0.5 ${item.status === "open" ? "font-semibold text-[var(--fg)]" : "font-medium text-[var(--fg2)]"}`}
                    >
                      {item.subject || "(Tanpa Subjek)"}
                    </div>

                    <div className="text-[11px] text-[var(--fg2)] line-clamp-1 leading-relaxed">
                      {item.snippet}
                    </div>

                    <div className="text-[10px] text-[var(--fg3)] mt-1 leading-normal">
                      {formatCreatorLabel(item)}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {item.status === "open" ? (
                        <span className="inline-flex items-center gap-1 font-medium text-[10px] text-[var(--fg2)]">
                          <span
                            aria-hidden="true"
                            className="w-1.5 h-1.5 rounded-full bg-[var(--module-pdkt)]"
                          />{" "}
                          Menunggu Balasan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-[10px] text-[var(--chart-green)]">
                          <span
                            aria-hidden="true"
                            className="w-1.5 h-1.5 rounded-full bg-[var(--chart-green)]"
                          />{" "}
                          Terbalas
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
