import { Info, GitBranch, Pencil, Trash2 } from "lucide-react";
import type { RuleVersion, QARuleIndicator } from "@trainers/types";
import { CAT_COLOR, CAT_LABEL } from "../constants";

interface RuleIndicatorsPanelProps {
  loadingIndicators: boolean;
  draftIndicators: QARuleIndicator[];
  publishedWhenDraftEmpty: RuleVersion | null | undefined;
  isDraft: boolean;
  handleCreateDraft: (sourceId?: string) => Promise<void>;
  handleDeleteIndicator: (id: string) => Promise<void>;
  setEditIndId: (id: string | null) => void;
  setEditState: (
    state: {
      name: string;
      category: "critical" | "non_critical" | "none";
      bobot: string;
      has_na: boolean;
      threshold: string;
      sort_order: string;
    } | null
  ) => void;
}

export function RuleIndicatorsPanel({
  loadingIndicators,
  draftIndicators,
  publishedWhenDraftEmpty,
  isDraft,
  handleCreateDraft,
  handleDeleteIndicator,
  setEditIndId,
  setEditState,
}: RuleIndicatorsPanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground px-2">
        Daftar Parameter
      </h3>

      {loadingIndicators ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-card animate-pulse rounded-2xl border border-border" />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm divide-y divide-border">
          {draftIndicators.length === 0 ? (
            <div className="p-12 text-center space-y-4">
              <Info className="w-12 h-12 text-muted-foreground/20 mx-auto" />
              <p className="text-sm font-bold text-muted-foreground">Belum ada parameter di versi ini.</p>
              {publishedWhenDraftEmpty && (
                <div className="inline-flex flex-col items-center gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xs text-amber-600/80">
                    Versi published <span className="font-black">v{publishedWhenDraftEmpty.version_number}</span> sudah memiliki parameter.
                  </p>
                  <button
                    onClick={() => handleCreateDraft(publishedWhenDraftEmpty.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Create Revision dari Published
                  </button>
                </div>
              )}
            </div>
          ) : (
            draftIndicators.map((ind) => (
              <div key={ind.id} className="group p-4 lg:px-8 hover:bg-foreground/[0.01] transition-all flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 text-center flex-shrink-0">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-wider ${CAT_COLOR[ind.category as any] || CAT_COLOR.none}`}>
                      {Math.round(ind.bobot * 100)}%
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{ind.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border uppercase tracking-widest ${CAT_COLOR[ind.category as any] || CAT_COLOR.none}`}>
                        {CAT_LABEL[ind.category as any] ? CAT_LABEL[ind.category as any].replace(" Error", "") : ind.category}
                      </span>
                      {ind.has_na && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-foreground/5 text-muted-foreground border border-border">N/A</span>}
                      {ind.sort_order != null && ind.sort_order > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">#{ind.sort_order}</span>
                      )}
                      {ind.threshold != null && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20">Th: {ind.threshold}</span>
                      )}
                      {ind.legacy_indicator_id && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Linked</span>
                      )}
                    </div>
                  </div>
                </div>
                {isDraft && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                      onClick={() => {
                        setEditIndId(ind.id);
                        setEditState({
                          name: ind.name,
                          category: ind.category as any,
                          bobot: String(Math.round(ind.bobot * 100)),
                          has_na: ind.has_na,
                          threshold: ind.threshold != null ? String(ind.threshold) : "",
                          sort_order: String(ind.sort_order ?? 0),
                        });
                      }}
                      className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl transition"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteIndicator(ind.id)}
                      className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
