import { Search, Layers } from "lucide-react";
import type { AccessGroupRow } from "@trainers/types";

interface GroupSidebarProps {
  groups: AccessGroupRow[];
  loading: boolean;
  selectedGroupId: string | null;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onSelectGroup: (id: string) => void;
}

export function GroupSidebar({
  groups,
  loading,
  selectedGroupId,
  searchTerm,
  onSearchChange,
  onSelectGroup,
}: GroupSidebarProps) {
  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          type="text"
          placeholder="Cari nama grup..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card pl-11 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
        />
      </div>

      {/* Groups List */}
      <div className="rounded-2xl border border-border bg-card p-1.5 shadow-sm space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="mt-3 text-[10px] font-bold uppercase tracking-widest opacity-60">
              Memuat grup...
            </span>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground/40">
            <Layers className="mx-auto h-8 w-8 opacity-20 mb-3" />
            <p className="text-[10px] font-bold uppercase tracking-widest">
              Grup tidak ditemukan
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelectGroup(g.id)}
              className={`w-full text-left rounded-xl p-3.5 transition-all group ${
                selectedGroupId === g.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-foreground hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm tracking-tight ${selectedGroupId === g.id ? "font-bold" : "font-semibold"}`}>
                  {g.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedGroupId === g.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : g.is_active !== false
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {g.is_active !== false ? "Aktif" : "Nonaktif"}
                </span>
              </div>
              {g.description && (
                <p className={`mt-1 text-[11px] line-clamp-1 leading-normal ${
                  selectedGroupId === g.id ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}>
                  {g.description}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
