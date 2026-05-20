import React from 'react';
import { Calendar, ChevronRight, XCircle } from 'lucide-react';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

interface MonthRangePickerProps {
  selectedYear: number;
  startMonth: number | null;
  endMonth: number | null;
  onRangeChange: (start: number | null, end: number | null) => void;
  className?: string;
  variant?: 'standalone' | 'compact' | 'toolbar';
}

export function MonthRangePicker({
  selectedYear,
  startMonth,
  endMonth,
  onRangeChange,
  className = "",
  variant = "standalone"
}: MonthRangePickerProps) {
  const handleStartChange = (val: string) => {
    const start = val === '' ? null : parseInt(val);
    onRangeChange(start, endMonth);
  };

  const handleEndChange = (val: string) => {
    const end = val === '' ? null : parseInt(val);
    onRangeChange(startMonth, end);
  };

  const handleReset = () => {
    onRangeChange(null, null);
  };

  const isInvalidRange = startMonth !== null && endMonth !== null && endMonth < startMonth;

  if (variant === 'toolbar') {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <div className="flex items-center gap-2">
          {/* Start Month */}
          <div className="relative group/select flex-1">
            <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-muted-foreground group-focus-within/select:text-foreground transition-colors">
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <select
              value={startMonth ?? ''}
              onChange={(e) => handleStartChange(e.target.value)}
              className={`block w-full h-9 pl-8 pr-7 text-sm font-medium bg-card border rounded-lg focus:ring-1 focus:ring-ring focus:outline-none appearance-none cursor-pointer transition-all ${isInvalidRange ? 'border-red-500/50' : 'border-border'}`}
            >
              <option value="">Awal</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground">
              <ChevronRight className="w-3 h-3 rotate-90" />
            </div>
          </div>

          <span className="text-muted-foreground text-xs font-bold shrink-0 uppercase tracking-wider px-1">sampai</span>

          {/* End Month */}
          <div className="relative group/select flex-1">
            <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-muted-foreground group-focus-within/select:text-foreground transition-colors">
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <select
              value={endMonth ?? ''}
              onChange={(e) => handleEndChange(e.target.value)}
              className={`block w-full h-9 pl-8 pr-7 text-sm font-medium bg-card border rounded-lg focus:ring-1 focus:ring-ring focus:outline-none appearance-none cursor-pointer transition-all ${isInvalidRange ? 'border-red-500/50' : 'border-border'}`}
            >
              <option value="">Akhir</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground">
              <ChevronRight className="w-3 h-3 rotate-90" />
            </div>
          </div>

          {/* Reset Button */}
          {(startMonth !== null || endMonth !== null) && (
            <button
              onClick={handleReset}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
              title="Reset Range"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        {isInvalidRange && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <XCircle className="w-3 h-3 text-red-500" />
            <span className="text-[10px] text-red-500 font-bold uppercase tracking-tight">Rentang bulan tidak valid</span>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* Start Month */}
        <div className="relative group/select flex-1 min-w-[120px]">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Calendar className="h-4 w-4 text-muted-foreground group-focus-within/select:text-primary transition-colors" />
          </div>
          <select
            value={startMonth ?? ''}
            onChange={(e) => handleStartChange(e.target.value)}
            className="block w-full pl-11 pr-8 py-3.5 text-sm bg-background/50 border-border/50 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all appearance-none border hover:border-primary/30 font-semibold text-primary"
          >
            <option value="">Bulan Awal</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-muted-foreground">
            <ChevronRight className="w-4 h-4 rotate-90" />
          </div>
        </div>

        <span className="text-muted-foreground font-medium text-xs">sampai</span>

        {/* End Month */}
        <div className="relative group/select flex-1 min-w-[120px]">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Calendar className="h-4 w-4 text-muted-foreground group-focus-within/select:text-primary transition-colors" />
          </div>
          <select
            value={endMonth ?? ''}
            onChange={(e) => handleEndChange(e.target.value)}
            className="block w-full pl-11 pr-8 py-3.5 text-sm bg-background/50 border-border/50 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all appearance-none border hover:border-primary/30 font-semibold text-primary"
          >
            <option value="">Bulan Akhir</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-muted-foreground">
            <ChevronRight className="w-4 h-4 rotate-90" />
          </div>
        </div>

        {/* Reset Button */}
        {(startMonth !== null || endMonth !== null) && (
          <button
            onClick={handleReset}
            className="flex items-center justify-center p-3 rounded-2xl bg-background/50 border border-border/50 text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-all shadow-sm shrink-0"
            title="Reset Range"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-4 p-4 bg-background/30 rounded-2xl border border-border/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mr-2">
          <Calendar className="w-4 h-4" />
          <span>Rentang Bulan ({selectedYear}):</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Start Month */}
          <div className="relative group/select min-w-[140px]">
            <select
              value={startMonth ?? ''}
              onChange={(e) => handleStartChange(e.target.value)}
              className="block w-full pl-4 pr-10 py-2.5 text-xs bg-background/50 border-border/50 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all appearance-none border hover:border-primary/30 text-foreground"
            >
              <option value="">Bulan Awal</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground">
              <ChevronRight className="w-3 h-3 rotate-90" />
            </div>
          </div>

          <span className="text-muted-foreground text-xs">sampai</span>

          {/* End Month */}
          <div className="relative group/select min-w-[140px]">
            <select
              value={endMonth ?? ''}
              onChange={(e) => handleEndChange(e.target.value)}
              className="block w-full pl-4 pr-10 py-2.5 text-xs bg-background/50 border-border/50 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all appearance-none border hover:border-primary/30 text-foreground"
            >
              <option value="">Bulan Akhir</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground">
              <ChevronRight className="w-3 h-3 rotate-90" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {(startMonth !== null || endMonth !== null) && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-red-500 hover:bg-red-500/5 transition-all"
          >
            <XCircle className="w-3.5 h-3.5" />
            Reset
          </button>
        )}

        {isInvalidRange && (
          <span className="text-[10px] text-red-500 font-medium animate-pulse">
            * Rentang bulan tidak valid
          </span>
        )}
      </div>
      
      <p className="text-[10px] text-muted-foreground font-medium ml-4">
        * Rentang bulan dibatasi dalam tahun {selectedYear}. Ubah tahun di filter untuk tahun lain.
      </p>
    </div>
  );
}
