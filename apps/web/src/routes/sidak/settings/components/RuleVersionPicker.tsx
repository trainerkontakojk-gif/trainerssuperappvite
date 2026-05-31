import { Clock, Trash2 } from "lucide-react";
import type { ServiceType, RuleVersion } from "@trainers/types";
import { TEAMS, SERVICE_LABELS } from "../constants";

interface RuleVersionMeta {
  service_type: string;
  indicator_count: number;
  has_weight: boolean;
  draft_count: number;
  published_count: number;
}

interface RuleVersionPickerProps {
  activeTeam: ServiceType;
  setActiveTeam: (team: ServiceType) => void;
  versions: RuleVersion[] | null | undefined;
  versionsLoading: boolean;
  selectedVersion: RuleVersion | null;
  setSelectedVersion: (version: RuleVersion | null) => void;
  meta: RuleVersionMeta | null;
  getPeriodLabel: (periodId: string) => string;
  handleCreateDraft: (sourceId?: string) => Promise<void>;
  handleDeleteDraft: (id: string) => Promise<void>;
}

export function RuleVersionPicker({
  activeTeam,
  setActiveTeam,
  versions,
  versionsLoading,
  selectedVersion,
  setSelectedVersion,
  meta,
  getPeriodLabel,
  handleCreateDraft,
  handleDeleteDraft,
}: RuleVersionPickerProps) {
  return (
    <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card/30 overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-1 p-1 bg-foreground/5 rounded-xl border border-border">
          {TEAMS.map((team) => (
            <button
              key={team}
              onClick={() => setActiveTeam(team)}
              className={`flex-1 min-w-[60px] py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                activeTeam === team ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-foreground/5"
              }`}
            >
              {SERVICE_LABELS[team]}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Riwayat Versi</p>
          {versionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-foreground/5 animate-pulse rounded-2xl border border-border/50" />
              ))}
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="p-4 text-center border-2 border-dashed border-border rounded-2xl">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                Belum ada versi untuk {SERVICE_LABELS[activeTeam]}
              </p>
              {meta?.indicator_count ? (
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  Baseline tersedia: {meta.indicator_count} parameter. Buat baseline untuk menampilkan detail versi.
                </p>
              ) : (
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  Belum ada parameter baseline untuk service ini.
                </p>
              )}
              <button onClick={() => handleCreateDraft()} className="mt-2 text-[10px] font-black text-primary uppercase underline">
                Buat Baseline
              </button>
            </div>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setSelectedVersion(v)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    selectedVersion?.id === v.id
                      ? "bg-primary/5 border-primary shadow-sm shadow-primary/10"
                      : "bg-card border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                        v.status === "draft"
                          ? "bg-amber-500/20 text-amber-600 border border-amber-500/20"
                          : v.status === "superseded"
                          ? "bg-muted text-muted-foreground border border-border"
                          : "bg-emerald-500/20 text-emerald-600 border border-emerald-500/20"
                      }`}
                    >
                      {v.status}
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-foreground">v{v.version_number}</span>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      Efektif: {getPeriodLabel(v.effective_period_id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 opacity-60 group-hover:opacity-100 text-[10px] font-bold text-muted-foreground uppercase">
                    <Clock className="w-3 h-3" />
                    <span>{v.scoring_mode} Mode</span>
                  </div>
                </button>

                {v.status === "draft" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDraft(v.id);
                    }}
                    className="absolute bottom-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-destructive/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
