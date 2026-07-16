import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatQAIndicatorName } from "@trainers/types";

interface Indicator {
  id: string;
  name: string;
  parameter_group?: string | null;
  category: "critical" | "non_critical" | "none";
  bobot: number;
}

interface Props {
  value: string;
  indicators: Indicator[];
  scoringMode?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

interface IndicatorOptionProps {
  indicator: Indicator;
  selected: boolean;
  nested: boolean;
  onSelect: (id: string) => void;
}

function IndicatorOption({
  indicator,
  selected,
  nested,
  onSelect,
}: IndicatorOptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(indicator.id)}
      className={`flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left text-sm transition-colors ${
        nested ? "pl-7" : ""
      } ${
        selected
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-foreground/5"
      }`}
    >
      <span className="min-w-0">{indicator.name}</span>
      <span
        className={`ml-2 flex-shrink-0 text-[10px] font-bold tabular-nums ${
          selected ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {Math.round(indicator.bobot * 100)}%
      </span>
    </button>
  );
}

function GroupedOptions({
  indicators,
  value,
  onSelect,
}: {
  indicators: Indicator[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const groups = new Map<string, Indicator[]>();
  for (const indicator of indicators) {
    const key = indicator.parameter_group || `__standalone__${indicator.id}`;
    const current = groups.get(key) ?? [];
    current.push(indicator);
    groups.set(key, current);
  }

  return Array.from(groups.entries()).map(([group, items]) => {
    const isStandalone = group.startsWith("__standalone__");
    return (
      <div key={group}>
        {!isStandalone && (
          <div className="border-b border-border bg-muted/35 px-4 py-2">
            <p className="text-[11px] font-semibold leading-snug text-foreground">
              {group}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Pilih sub-parameter
            </p>
          </div>
        )}
        {items.map((indicator) => (
          <IndicatorOption
            key={indicator.id}
            indicator={indicator}
            selected={value === indicator.id}
            nested={!isStandalone}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  });
}

export default function IndicatorDropdown({
  value,
  indicators,
  scoringMode = "weighted",
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const selected = indicators.find((indicator) => indicator.id === value);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < dropHeight && rect.top > dropHeight;
    setPos({
      top: openUp ? rect.top - dropHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const nonCritical = indicators.filter(
    (indicator) => indicator.category === "non_critical",
  );
  const critical = indicators.filter(
    (indicator) => indicator.category === "critical",
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm text-foreground transition-all ${
          open ? "border-primary ring-2 ring-primary/20" : "border-border"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span
          className={
            selected ? "min-w-0 text-foreground" : "text-muted-foreground"
          }
        >
          {selected
            ? `${formatQAIndicatorName(selected)} (${Math.round(selected.bobot * 100)}%)`
            : "— Pilih parameter —"}
        </span>
        <ChevronRight
          className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Tutup daftar parameter"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            aria-label="Daftar parameter QA"
            className="fixed z-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 320,
            }}
          >
            {scoringMode === "no_category" ? (
              <GroupedOptions
                indicators={indicators}
                value={value}
                onSelect={handleSelect}
              />
            ) : (
              <>
                <div className="sticky top-0 z-10 border-b border-border bg-blue-500/10 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    Non-Critical Error
                  </p>
                </div>
                <GroupedOptions
                  indicators={nonCritical}
                  value={value}
                  onSelect={handleSelect}
                />
                <div className="sticky top-0 z-10 border-y border-border bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                    Critical Error
                  </p>
                </div>
                <GroupedOptions
                  indicators={critical}
                  value={value}
                  onSelect={handleSelect}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
