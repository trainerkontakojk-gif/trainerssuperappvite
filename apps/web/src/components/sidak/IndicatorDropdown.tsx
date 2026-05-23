import { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

interface Indicator {
  id: string;
  name: string;
  category: "critical" | "non_critical" | "none";
  bobot: number;
}

interface Props {
  value: string;
  indicators: Indicator[];
  scoringMode?: string;
  onChange: (id: string) => void;
}

export default function IndicatorDropdown({
  value,
  indicators,
  scoringMode = "weighted",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const selected = indicators.find((i) => i.id === value);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropH = 288;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < dropH && rect.top > dropH;
    setPos({
      top: openUp ? rect.top - dropH - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, [open]);

  const nc = indicators.filter((i) => i.category === "non_critical");
  const cr = indicators.filter((i) => i.category === "critical");

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${
          open
            ? "border-primary ring-2 ring-primary/20"
            : "border-border"
        } bg-card text-foreground`}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected
            ? `${selected.name} (${Math.round(selected.bobot * 100)}%)`
            : "— Pilih parameter —"}
        </span>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="fixed z-40 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 288,
              overflowY: "auto",
            }}
          >
            {scoringMode === "no_category" ? (
              indicators.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => {
                    onChange(ind.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors border-b border-border ${
                    value === ind.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span>{ind.name}</span>
                  <span
                    className={`text-[10px] font-bold ml-2 flex-shrink-0 ${
                      value === ind.id
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {Math.round(ind.bobot * 100)}%
                  </span>
                </button>
              ))
            ) : (
              <>
                <div className="px-3 py-1.5 bg-blue-500/10 border-b border-border sticky top-0">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                    Non-Critical Error
                  </p>
                </div>
                {nc.map((ind) => (
                  <button
                    key={ind.id}
                    type="button"
                    onClick={() => {
                      onChange(ind.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors border-b border-border ${
                      value === ind.id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    <span>{ind.name}</span>
                    <span
                      className={`text-[10px] font-bold ml-2 flex-shrink-0 ${
                        value === ind.id
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {Math.round(ind.bobot * 100)}%
                    </span>
                  </button>
                ))}
                <div className="px-3 py-1.5 bg-red-500/10 border-t border-b border-border sticky top-[33px]">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                    Critical Error
                  </p>
                </div>
                {cr.map((ind) => (
                  <button
                    key={ind.id}
                    type="button"
                    onClick={() => {
                      onChange(ind.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors border-b border-border ${
                      value === ind.id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    <span>{ind.name}</span>
                    <span
                      className={`text-[10px] font-bold ml-2 flex-shrink-0 ${
                        value === ind.id
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {Math.round(ind.bobot * 100)}%
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
