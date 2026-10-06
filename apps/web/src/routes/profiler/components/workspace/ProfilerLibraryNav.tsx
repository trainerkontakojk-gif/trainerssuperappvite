import { useMemo, useState } from "react";
import type { ProfilerFolder, ProfilerYear } from "@trainers/types";
import {
  CalendarPlus,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";

import { cleanYearLabel } from "./workspace-utils";

interface ProfilerLibraryNavProps {
  years: ProfilerYear[];
  folders: ProfilerFolder[];
  counts: Record<string, number>;
  selectedYearId: string | null;
  activeBatch: string;
  isReadOnly: boolean;
  onSelectYear: (id: string) => void;
  onSelectBatch: (name: string) => void;
  onAddYear: () => void;
  onAddFolder: (yearId: string, parentId?: string) => void;
  onRenameFolder: (folder: ProfilerFolder) => void;
  onDeleteFolder: (folder: ProfilerFolder) => void;
  onDuplicateFolder: (folder: ProfilerFolder) => void;
  className?: string;
}

/**
 * Satu-satunya navigasi Profiler: tahun → tim → batch.
 *
 * Tim tanpa batch dipakai langsung sebagai batch (perilaku lama
 * "Gunakan tim sebagai batch"), jadi setiap tim selalu bisa dibuka.
 */
export default function ProfilerLibraryNav({
  years,
  folders,
  counts,
  selectedYearId,
  activeBatch,
  isReadOnly,
  onSelectYear,
  onSelectBatch,
  onAddYear,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  className,
}: ProfilerLibraryNavProps) {
  const [query, setQuery] = useState("");

  const sortedYears = useMemo(
    () => [...years].sort((left, right) => right.year - left.year),
    [years],
  );
  const yearItems = useMemo(
    () =>
      sortedYears.map((year) => ({
        value: year.id,
        label: cleanYearLabel(year.label),
      })),
    [sortedYears],
  );

  const teams = useMemo(() => {
    if (!selectedYearId) return [];
    const needle = query.trim().toLowerCase();
    return folders
      .filter(
        (folder) => folder.year_id === selectedYearId && !folder.parent_id,
      )
      .map((team) => {
        const batches = folders.filter(
          (folder) => folder.parent_id === team.id,
        );
        if (!needle || team.name.toLowerCase().includes(needle)) {
          return { team, batches, allBatches: batches };
        }
        return {
          team,
          batches: batches.filter((batch) =>
            batch.name.toLowerCase().includes(needle),
          ),
          allBatches: batches,
        };
      })
      .filter(
        ({ team, batches }) =>
          !needle ||
          team.name.toLowerCase().includes(needle) ||
          batches.length > 0,
      );
  }, [folders, query, selectedYearId]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          {yearItems.length > 0 ? (
            <Select
              items={yearItems}
              value={selectedYearId}
              onValueChange={(value) => {
                if (value) onSelectYear(value as string);
              }}
            >
              <SelectTrigger
                aria-label="Tahun data"
                className="min-h-11 flex-1 font-semibold"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="flex-1 text-sm text-muted-foreground">
              Belum ada arsip tahun
            </p>
          )}
          {!isReadOnly && (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={onAddYear}
              aria-label="Tambah tahun"
              title="Tambah tahun"
              className="min-h-11 min-w-11"
            >
              <CalendarPlus aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari tim atau batch"
            aria-label="Cari tim atau batch"
            className="h-11 pl-9"
          />
        </div>
      </div>

      <nav
        aria-label="Daftar tim dan batch"
        className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar"
      >
        {!selectedYearId ? null : teams.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "Tidak ada tim atau batch yang cocok."
              : "Belum ada tim di tahun ini."}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {teams.map(({ team, batches, allBatches }) => {
              const isSolo = allBatches.length === 0;
              return (
                <li key={team.id}>
                  {isSolo ? (
                    <NavRow
                      folder={team}
                      label={team.name}
                      count={counts[team.name] ?? 0}
                      isActive={activeBatch === team.name}
                      isReadOnly={isReadOnly}
                      onSelect={() => onSelectBatch(team.name)}
                      onAddBatch={() => onAddFolder(team.year_id!, team.id)}
                      onDuplicate={() => onDuplicateFolder(team)}
                      onRename={() => onRenameFolder(team)}
                      onDelete={() => onDeleteFolder(team)}
                    />
                  ) : (
                    <>
                      <div className="flex min-h-11 items-center gap-1 pl-3">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {team.name}
                        </span>
                        {!isReadOnly && (
                          <RowMenu
                            name={team.name}
                            onAddBatch={() =>
                              onAddFolder(team.year_id!, team.id)
                            }
                            onDuplicate={() => onDuplicateFolder(team)}
                            onRename={() => onRenameFolder(team)}
                            onDelete={() => onDeleteFolder(team)}
                          />
                        )}
                      </div>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {batches.map((batch) => (
                          <li key={batch.id}>
                            <NavRow
                              folder={batch}
                              label={batch.name}
                              count={counts[batch.name] ?? 0}
                              isActive={activeBatch === batch.name}
                              isReadOnly={isReadOnly}
                              onSelect={() => onSelectBatch(batch.name)}
                              onRename={() => onRenameFolder(batch)}
                              onDelete={() => onDeleteFolder(batch)}
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {!isReadOnly && selectedYearId && (
        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => onAddFolder(selectedYearId)}
            className="min-h-11 w-full justify-start text-muted-foreground"
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Tim baru
          </Button>
        </div>
      )}
    </div>
  );
}

function NavRow({
  folder,
  label,
  count,
  isActive,
  isReadOnly,
  onSelect,
  onAddBatch,
  onDuplicate,
  onRename,
  onDelete,
}: {
  folder: ProfilerFolder;
  label: string;
  count: number;
  isActive: boolean;
  isReadOnly: boolean;
  onSelect: () => void;
  onAddBatch?: () => void;
  onDuplicate?: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center rounded-lg transition-colors",
        isActive ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isActive ? "font-semibold text-foreground" : "text-foreground/90",
          )}
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </button>
      {!isReadOnly && (
        <RowMenu
          name={folder.name}
          onAddBatch={onAddBatch}
          onDuplicate={onDuplicate}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function RowMenu({
  name,
  onAddBatch,
  onDuplicate,
  onRename,
  onDelete,
}: {
  name: string;
  onAddBatch?: () => void;
  onDuplicate?: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Aksi ${name}`}
            title={`Aksi ${name}`}
            className="min-h-11 min-w-11 shrink-0 text-muted-foreground"
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onAddBatch && (
          <DropdownMenuItem onClick={onAddBatch} className="min-h-10">
            <Plus aria-hidden="true" />
            Tambah batch
          </DropdownMenuItem>
        )}
        {onDuplicate && (
          <DropdownMenuItem onClick={onDuplicate} className="min-h-10">
            <Copy aria-hidden="true" />
            Duplikat ke tahun lain
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onRename} className="min-h-10">
          <Pencil aria-hidden="true" />
          Ubah nama
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          variant="destructive"
          className="min-h-10"
        >
          <Trash2 aria-hidden="true" />
          Hapus
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
