import React from "react";
import { FilterX, Inbox, X } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";

interface ProfilerTableFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterTim: string;
  setFilterTim: (tim: string) => void;
  allTims: string[];
  sortMode: boolean;
  hasActiveFilters: boolean;
  resetFilters: () => void;
}

export const ProfilerTableFilters: React.FC<ProfilerTableFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  filterTim,
  setFilterTim,
  allTims,
  sortMode,
  hasActiveFilters,
  resetFilters,
}) => (
  <Card className="shadow-none">
    <CardContent className="grid gap-3 p-3 sm:p-4">
      <div className="relative">
        <Inbox
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Cari nama, NIK, atau email..."
          aria-label="Cari peserta"
          className="h-11 pl-10 pr-12"
        />
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 min-h-9 -translate-y-1/2 gap-1.5 text-xs"
            onClick={resetFilters}
          >
            <FilterX data-icon="inline-start" aria-hidden="true" />
            Reset
          </Button>
        ) : searchQuery ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setSearchQuery("")}
            aria-label="Hapus pencarian"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {!sortMode && allTims.length > 1 ? (
        <div className="flex flex-wrap gap-2" aria-label="Filter tim">
          {allTims.map((tim) => {
            const selected =
              tim === "all"
                ? filterTim === "all"
                : filterTim.toLowerCase() === tim.toLowerCase();
            return (
              <Button
                key={tim}
                type="button"
                size="lg"
                variant={selected ? "default" : "outline"}
                className="min-h-11 text-xs"
                onClick={() => setFilterTim(tim)}
              >
                {tim === "all" ? "Semua tim" : tim}
              </Button>
            );
          })}
        </div>
      ) : null}
    </CardContent>
  </Card>
);
