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
} from "lucide-react";
import type { PdktMailboxItem } from "@trainers/types";

interface MailboxSidebarProps {
  items: PdktMailboxItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings?: () => void;
  onHistory?: () => void;
  onUsage?: () => void;
}

export const MailboxSidebar: React.FC<MailboxSidebarProps> = ({
  items,
  selectedId,
  onSelect,
  onNew,
  onSettings,
  onHistory,
  onUsage,
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "replied">("open");

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.sender_name.toLowerCase().includes(search.toLowerCase()) ||
      item.subject.toLowerCase().includes(search.toLowerCase());

    const matchesFilter = filter === "all" || item.status === filter;

    return matchesSearch && matchesFilter;
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
    <div className="w-full md:w-80 border-r border-gray-200 flex flex-col h-full bg-white shrink-0">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-sky-600" />
            Mailbox
          </h2>
          <div className="flex items-center gap-1">
            {onSettings && (
              <button
                onClick={onSettings}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-all text-gray-500 hover:text-gray-900"
                title="Pengaturan"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
            {onHistory && (
              <button
                onClick={onHistory}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-all text-gray-500 hover:text-gray-900"
                title="Riwayat"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}
            {onUsage && (
              <button
                onClick={onUsage}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-all text-gray-500 hover:text-gray-900"
                title="Usage Bulan Ini"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onNew}
              className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center transition-all hover:bg-sky-700 active:scale-95 ml-1"
              title="Buat Simulasi"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-sky-600 transition-colors" />
          <input
            type="text"
            placeholder="Cari email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex p-1 bg-gray-100 rounded-xl">
          {[
            { id: "all", label: "Semua" },
            { id: "open", label: "Belum Dibalas" },
            { id: "replied", label: "Terbalas" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`flex-1 py-1.5 text-[9px] font-medium uppercase tracking-wide rounded-lg transition-all ${
                filter === tab.id
                  ? "bg-white text-sky-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
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
            <Mail className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-[11px] font-medium text-gray-500 leading-loose">
              {search || filter !== "all"
                ? "Hasil Tidak Ditemukan"
                : "Kotak Masuk Kosong"}
            </p>
            {!(search || filter !== "all") && (
              <button
                onClick={onNew}
                className="mt-4 text-[10px] font-medium text-sky-600 hover:underline"
              >
                Buat Email Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`w-full text-left p-4 transition-all relative flex gap-3 ${
                  selectedId === item.id
                    ? "bg-sky-50/50 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-sky-600"
                    : "hover:bg-gray-50"
                }`}
              >
                <div
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    selectedId === item.id
                      ? "bg-sky-600 text-white shadow-md"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getInitials(item.sender_name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-xs truncate ${item.status === "open" ? "font-bold text-gray-900" : "font-medium text-gray-600"}`}
                    >
                      {item.sender_name}
                    </span>
                    <span className="text-[9px] text-gray-500 whitespace-nowrap">
                      {formatTime(item.last_activity_at)}
                    </span>
                  </div>

                  <div
                    className={`text-[11px] truncate mb-0.5 ${item.status === "open" ? "font-bold text-gray-900" : "font-medium text-gray-600"}`}
                  >
                    {item.subject || "(Tanpa Subjek)"}
                  </div>

                  <div className="text-[10px] text-gray-500 line-clamp-1 leading-relaxed opacity-70">
                    {item.snippet}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {item.status === "open" ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[9px] text-sky-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />{" "}
                        Menunggu Balasan
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-[9px] text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{" "}
                        Terbalas
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-around">
        <button
          className="p-2 text-sky-600 hover:bg-sky-100 rounded-xl transition-all"
          title="Inbox"
        >
          <Inbox className="w-4 h-4" />
        </button>
        <button
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-all"
          title="Sent (History)"
        >
          <Send className="w-4 h-4" />
        </button>
        <button
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-all"
          title="Trash"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
