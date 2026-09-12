import { useEffect, useState, type ReactNode } from "react";
import type { ProfilerFolder, ProfilerYear } from "@trainers/types";
import {
  CalendarDays,
  ChevronRight,
  Copy,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "cn";

import { cleanYearLabel, getDynamicIcon } from "./workspace-utils";

interface HierarchyPanelProps {
  years: ProfilerYear[];
  folders: ProfilerFolder[];
  selectedYearId: string | null;
  selectedFolderId: string | null;
  onSelectYear: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onAddYear: () => void;
  onAddFolder: (yearId: string, parentId?: string) => void;
  onRenameFolder: (folder: ProfilerFolder) => void;
  onDeleteFolder: (folder: ProfilerFolder) => void;
  onDuplicateFolder: (folder: ProfilerFolder) => void;
  counts: Record<string, number>;
  role?: string;
  isMobile?: boolean;
  onClose?: () => void;
}

export default function HierarchyPanel({
  years,
  folders,
  selectedYearId,
  selectedFolderId,
  onSelectYear,
  onSelectFolder,
  onAddYear,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  counts,
  role = "trainer",
  isMobile = false,
  onClose,
}: HierarchyPanelProps) {
  const isReadOnly = role === "leader";
  const prefersReducedMotion = useReducedMotion();
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (years.length > 0) {
      const currentYear = new Date().getFullYear();
      const yearToExpand = years.find((year) => year.year === currentYear);
      if (yearToExpand) {
        setExpandedYears((prev) => ({ ...prev, [yearToExpand.id]: true }));
      } else if (selectedYearId) {
        setExpandedYears((prev) => ({ ...prev, [selectedYearId]: true }));
      }
    }
  }, [years, selectedYearId]);

  const toggleYear = (id: string) => {
    setExpandedYears((prev) => ({ ...prev, [id]: !prev[id] }));
    onSelectYear(id);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const rootFolders = (yearId: string) =>
    folders.filter((folder) => folder.year_id === yearId && !folder.parent_id);

  const subFolders = (parentId: string) =>
    folders.filter((folder) => folder.parent_id === parentId);

  const disclosureTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <div
      className={cn(
        "relative z-20 flex h-full flex-col overflow-hidden",
        isMobile ? "w-full" : "w-72 shrink-0 border-l border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Navigator
          </p>
          <h2 className="mt-1 font-outfit text-base font-semibold tracking-tight text-foreground">
            Hierarki data
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
              <Plus aria-hidden="true" />
            </Button>
          )}
          {isMobile && onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={onClose}
              aria-label="Tutup navigasi hierarki"
              title="Tutup navigasi hierarki"
              className="min-h-11 min-w-11"
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar sm:p-4">
        {years.length === 0 ? (
          <Empty className="min-h-40 border border-dashed border-border p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Arsip tidak ditemukan</EmptyTitle>
              <EmptyDescription>
                Tambahkan tahun baru untuk mulai membuat struktur data.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {[...years]
              .sort((left, right) => right.year - left.year)
              .map((year) => {
                const isYearSelected = selectedYearId === year.id;
                const yearRootFolders = rootFolders(year.id);
                const yearPanelId = `profiler-year-${year.id}`;

                return (
                  <div key={year.id} className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant={isYearSelected ? "default" : "ghost"}
                      size="lg"
                      aria-expanded={expandedYears[year.id] ?? false}
                      aria-controls={yearPanelId}
                      onClick={() => toggleYear(year.id)}
                      className={cn(
                        "min-h-11 w-full justify-start gap-2 px-3 text-left",
                        !isYearSelected && "text-foreground",
                      )}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "shrink-0 transition-transform duration-200",
                          expandedYears[year.id] && "rotate-90",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {cleanYearLabel(year.label)}
                      </span>
                      {isYearSelected && (
                        <Badge variant="secondary" className="shrink-0">
                          Aktif
                        </Badge>
                      )}
                    </Button>

                    <AnimatePresence initial={!prefersReducedMotion}>
                      {expandedYears[year.id] && (
                        <motion.div
                          id={yearPanelId}
                          initial={
                            prefersReducedMotion
                              ? false
                              : { height: 0, opacity: 0 }
                          }
                          animate={{ height: "auto", opacity: 1 }}
                          exit={
                            prefersReducedMotion
                              ? undefined
                              : { height: 0, opacity: 0 }
                          }
                          transition={disclosureTransition}
                          className="ml-3 flex flex-col gap-1 overflow-hidden border-l border-border pl-3"
                        >
                          {yearRootFolders.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-muted-foreground">
                              Belum ada tim terdaftar.
                            </p>
                          ) : (
                            yearRootFolders.map((folder) => (
                              <FolderRow
                                key={folder.id}
                                folder={folder}
                                selectedFolderId={selectedFolderId}
                                isReadOnly={isReadOnly}
                                isMobile={isMobile}
                                counts={counts}
                                hasChildren={subFolders(folder.id).length > 0}
                                expanded={expandedFolders[folder.id] ?? false}
                                onSelect={() => {
                                  onSelectFolder(folder.id);
                                  if (subFolders(folder.id).length > 0) {
                                    toggleFolder(folder.id);
                                  }
                                }}
                                onAdd={() => onAddFolder(year.id, folder.id)}
                                onDuplicate={() => onDuplicateFolder(folder)}
                                onRename={() => onRenameFolder(folder)}
                                onDelete={() => onDeleteFolder(folder)}
                              >
                                {expandedFolders[folder.id] && (
                                  <div className="ml-3 flex flex-col gap-1 border-l border-border pl-3">
                                    {subFolders(folder.id).map((subFolder) => (
                                      <FolderRow
                                        key={subFolder.id}
                                        folder={subFolder}
                                        selectedFolderId={selectedFolderId}
                                        isReadOnly={isReadOnly}
                                        isMobile={isMobile}
                                        counts={counts}
                                        hasChildren={false}
                                        expanded={false}
                                        onSelect={() =>
                                          onSelectFolder(subFolder.id)
                                        }
                                        onRename={() =>
                                          onRenameFolder(subFolder)
                                        }
                                        onDelete={() =>
                                          onDeleteFolder(subFolder)
                                        }
                                      />
                                    ))}
                                  </div>
                                )}
                              </FolderRow>
                            ))
                          )}

                          {!isReadOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onAddFolder(year.id)}
                              className="mt-1 min-h-10 w-full justify-start border border-dashed border-border px-3 text-xs text-muted-foreground"
                            >
                              <Plus
                                data-icon="inline-start"
                                aria-hidden="true"
                              />
                              Tim baru
                            </Button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Layers aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Total node</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {folders.length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  folder,
  selectedFolderId,
  isReadOnly,
  isMobile,
  counts,
  hasChildren,
  expanded,
  onSelect,
  onAdd,
  onDuplicate,
  onRename,
  onDelete,
  children,
}: {
  folder: ProfilerFolder;
  selectedFolderId: string | null;
  isReadOnly: boolean;
  isMobile: boolean;
  counts: Record<string, number>;
  hasChildren: boolean;
  expanded: boolean;
  onSelect: () => void;
  onAdd?: () => void;
  onDuplicate?: () => void;
  onRename: () => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const isSelected = selectedFolderId === folder.id;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <Button
          type="button"
          variant={isSelected ? "default" : "ghost"}
          size="lg"
          onClick={onSelect}
          aria-expanded={hasChildren ? expanded : undefined}
          className={cn(
            "h-auto min-h-10 min-w-0 flex-1 justify-start gap-2 px-2 py-2 text-left whitespace-normal",
            !isSelected && "text-foreground",
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center">
            {hasChildren ? (
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "transition-transform duration-200",
                  expanded && "rotate-90",
                )}
              />
            ) : (
              getDynamicIcon(folder.name, 14)
            )}
          </span>
          <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">
            {folder.name}
          </span>
          {counts[folder.name] > 0 && (
            <Badge
              variant={isSelected ? "secondary" : "outline"}
              className="shrink-0 tabular-nums"
            >
              {counts[folder.name]}
            </Badge>
          )}
        </Button>

        {!isReadOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Aksi ${folder.name}`}
                  title="Aksi folder"
                  className={cn(
                    "min-h-10 min-w-10 shrink-0",
                    isMobile ? "" : "opacity-70 hover:opacity-100",
                  )}
                />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {hasChildren && onAdd && (
                <DropdownMenuItem onClick={onAdd} className="min-h-10">
                  <Plus aria-hidden="true" />
                  Tambah batch
                </DropdownMenuItem>
              )}
              {hasChildren && onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate} className="min-h-10">
                  <Copy aria-hidden="true" />
                  Duplikat folder
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
                Hapus folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {children}
    </div>
  );
}
