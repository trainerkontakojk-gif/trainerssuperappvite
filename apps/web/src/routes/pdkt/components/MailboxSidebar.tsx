import React, { useState } from "react";
import {
  Mail,
  Search,
  Inbox,
  Send,
  Trash2,
  Plus,
  Settings,
  History,
  BarChart3,
  CheckSquare,
} from "lucide-react";
import type { PdktMailboxItem } from "@trainers/types";

function formatCreatorLabel(item: PdktMailboxItem) {
  const creator = item.created_by_user;
  if (!creator) return "Dibuat oleh user lama";
  if (creator.is_current_user) return "Dibuat oleh Anda";
  const role = creator.role ? ` · ${creator.role}` : "";
  return `Dibuat oleh ${creator.full_name}${role}`;
}

interface MailboxSidebarProps {
  items: PdktMailboxItem[];
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
    <div className="w-full md:w-80 border-r border-[var(--border)] flex flex-col h-full bg-[var(--surface)] shrink-0">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-[var(--border)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
            <Inbox className="w-4 h-4 text-[var(--fg2)]" />
            Mailbox
          </h2>
          <div className="flex items-center gap-1">
            {isBulkMode ? (
              <div className="flex items-center gap-1">
                {selectedBulkIds.size > 0 && (
                  <button
                    onClick={onBulkDelete}
                    className="min-w-10 min-h-10 rounded-lg border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--destructive)] flex items-center justify-center transition-all"
                    title={`Hapus ${selectedBulkIds.size} email terpilih`}
                    aria-label={`Hapus ${selectedBulkIds.size} email terpilih`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onToggleBulkMode}
                  className="min-h-10 px-3 text-xs font-semibold border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--fg)] rounded-lg transition-all"
                >
                  Batal
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={onToggleBulkMode}
                  className="min-w-10 min-h-10 rounded-lg hover:bg-[var(--bg)] flex items-center justify-center transition-all text-[var(--fg2)] hover:text-[var(--fg)]"
                  title="Pilih Banyak"
                  aria-label="Pilih Banyak"
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                {onSettings && (
                  <button
                    onClick={onSettings}
                    className="min-w-10 min-h-10 rounded-lg hover:bg-[var(--bg)] flex items-center justify-center transition-all text-[var(--fg2)] hover:text-[var(--fg)]"
                    title="Pengaturan"
                    aria-label="Pengaturan"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                )}
                {onHistory && (
                  <button
                    onClick={onHistory}
                    className="min-w-10 min-h-10 rounded-lg hover:bg-[var(--bg)] flex items-center justify-center transition-all text-[var(--fg2)] hover:text-[var(--fg)]"
                    title="Riwayat"
                    aria-label="Riwayat"
                  >
                    <History className="w-4 h-4" />
                  </button>
                )}
                {onUsage && (
                  <button
                    onClick={onUsage}
                    className="min-w-10 min-h-10 rounded-lg hover:bg-[var(--bg)] flex items-center justify-center transition-all text-[var(--fg2)] hover:text-[var(--fg)]"
                    title="Usage Bulan Ini"
                    aria-label="Usage Bulan Ini"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onNew}
                  className="min-w-10 min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] flex items-center justify-center transition-all hover:bg-[var(--bg)] active:scale-95 ml-1"
                  title="Buat Simulasi"
                  aria-label="Buat Simulasi"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg3)] group-focus-within:text-[var(--fg)] transition-colors" />
          <input
            type="text"
            placeholder="Cari email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg py-2.5 pl-9 pr-4 text-xs text-[var(--fg)] focus:border-[var(--fg)] outline-none transition-all placeholder:text-[var(--fg3)]"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex p-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg">
          {[
            { id: "all", label: "Semua" },
            { id: "open", label: "Belum Dibalas" },
            { id: "replied", label: "Terbalas" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id as any)}
              className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                filter === tab.id
                  ? "bg-[var(--surface)] text-[var(--fg)] border border-[var(--border)]"
                  : "text-[var(--fg2)] hover:text-[var(--fg)]"
              }`}
            >
              {tab.label}
            </button>
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
              <button
                onClick={onNew}
                className="mt-4 min-h-10 px-3 text-xs font-medium text-[var(--fg)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition-all"
              >
                Buat Email Pertama
              </button>
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
                  onClick={() => {
                    if (isBulkMode) {
                      if (canDelete) {
                        onToggleBulkId(item.id);
                      }
                    } else {
                      onSelect(item.id);
                    }
                  }}
                  className={`w-full text-left p-4 transition-all relative flex gap-3 cursor-pointer ${
                    isBulkMode
                      ? isSelected
                        ? "bg-[var(--bg)]"
                        : "hover:bg-[var(--bg)]"
                      : selectedId === item.id
                      ? "bg-[var(--bg)] ring-1 ring-inset ring-[var(--border)]"
                      : "hover:bg-[var(--bg)]"
                  } ${isBulkMode && !canDelete ? "opacity-50" : ""}`}
                  style={{ cursor: isBulkMode && !canDelete ? "not-allowed" : "pointer" }}
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
                        className="w-4 h-4 text-[var(--module-pdkt)] border-[var(--border)] rounded focus:ring-[var(--fg)] cursor-pointer disabled:cursor-not-allowed"
                        title={!canDelete ? "Anda tidak memiliki izin menghapus email ini" : ""}
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
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--module-pdkt)]" />{" "}
                          Menunggu Balasan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-[10px] text-[var(--chart-green)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--chart-green)]" />{" "}
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

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-around">
        <button
          className="min-h-10 min-w-10 text-[var(--fg)] hover:bg-[var(--surface)] rounded-lg transition-all flex items-center justify-center"
          title="Inbox"
          aria-label="Inbox"
        >
          <Inbox className="w-4 h-4" />
        </button>
        <button
          className="min-h-10 min-w-10 text-[var(--fg3)] hover:bg-[var(--surface)] hover:text-[var(--fg)] rounded-lg transition-all flex items-center justify-center"
          title="Sent (History)"
          aria-label="Sent (History)"
        >
          <Send className="w-4 h-4" />
        </button>
        <button
          className="min-h-10 min-w-10 text-[var(--fg3)] hover:bg-[var(--surface)] hover:text-[var(--fg)] rounded-lg transition-all flex items-center justify-center"
          title="Trash"
          aria-label="Trash"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
