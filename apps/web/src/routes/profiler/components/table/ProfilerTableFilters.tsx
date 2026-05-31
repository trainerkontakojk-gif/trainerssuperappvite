import React from 'react';
import { Inbox, FilterX, X } from 'lucide-react';

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
}) => {
  return (
    <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="relative group">
        <Inbox className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <input
          type="text"
          placeholder="Cari nama, NIP, atau email..."
          className="w-full pl-11 pr-12 py-2.5 bg-background border border-border/40 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
            title="Reset semua filter"
          >
            <FilterX className="w-3 h-3" /> Reset
          </button>
        )}
        {!hasActiveFilters && searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {!sortMode && allTims.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {allTims.map((tim) => (
            <button
              key={tim}
              onClick={() => setFilterTim(tim)}
              className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tim === 'all'
                  ? filterTim === 'all'
                  : filterTim.toLowerCase() === tim.toLowerCase()
                  ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/10'
                  : 'bg-background text-muted-foreground hover:text-foreground border-border/40 hover:border-primary/30'
              }`}
            >
              {tim === 'all' ? 'Semua Tim' : tim}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
