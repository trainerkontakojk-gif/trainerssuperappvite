import type { AccessGroupRow } from "@trainers/types";
import { Skeleton } from "../../../../components/ui/skeleton";
import { SearchField } from "../management/SearchField";
import { StatusDot } from "../management/StatusDot";
import { EmptyState } from "../management/EmptyState";
import { SplitViewItem } from "../management/SplitView";

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
    <>
      <div className="border-b border-border p-3">
        <SearchField
          label="Cari nama grup"
          value={searchTerm}
          onChange={onSearchChange}
        />
      </div>
      {loading && groups.length === 0 ? (
        <div role="status" aria-live="polite" className="grid gap-2 p-3">
          <span className="sr-only">Memuat grup akses…</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="Grup tidak ditemukan"
          description={
            searchTerm
              ? "Tidak ada grup yang cocok dengan pencarian ini."
              : "Buat grup pertama untuk mulai membatasi data leader."
          }
        />
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto lg:max-h-[640px]">
          {groups.map((group) => {
            const selected = selectedGroupId === group.id;
            const active = group.is_active !== false;
            return (
              <SplitViewItem
                key={group.id}
                selected={selected}
                onSelect={() => onSelectGroup(group.id)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">
                    {group.name}
                  </span>
                  <StatusDot
                    tone={active ? "success" : "muted"}
                    label={active ? "Aktif" : "Nonaktif"}
                  />
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {group.item_count} aturan
                </span>
              </SplitViewItem>
            );
          })}
        </ul>
      )}
    </>
  );
}
