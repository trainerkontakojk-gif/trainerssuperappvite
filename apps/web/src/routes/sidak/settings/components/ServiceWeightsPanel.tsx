import { Settings, Info } from "lucide-react";
import type { RuleVersion } from "@trainers/types";
import { sidakClient, unwrapResponse } from "../../../../lib/api";
import { notify } from "../../../../lib/toast";

interface ServiceWeightsPanelProps {
  selectedVersion: RuleVersion;
  isDraft: boolean;
  setSelectedVersion: (version: RuleVersion) => void;
}

export function ServiceWeightsPanel({
  selectedVersion,
  isDraft,
  setSelectedVersion,
}: ServiceWeightsPanelProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Settings className="w-4 h-4" /> Konfigurasi Bobot & Mode
        </h3>
        <span className="px-2 py-0.5 bg-background border border-border rounded text-[10px] font-semibold uppercase">
          {selectedVersion.scoring_mode} Mode
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Bobot Non-Critical</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              disabled={!isDraft || selectedVersion.scoring_mode === "no_category"}
              value={selectedVersion.non_critical_weight * 100}
              onChange={async (e) => {
                const ncVal = parseInt(e.target.value) / 100;
                const cVal = (100 - parseInt(e.target.value)) / 100;
                try {
                  const updated = await unwrapResponse(await sidakClient["rule-versions"][":id"].$put({
                    param: { id: selectedVersion.id },
                    json: {
                      non_critical_weight: ncVal,
                      critical_weight: cVal,
                    },
                  }));
                  setSelectedVersion(updated as any);
                } catch (err: any) {
                  notify.error(err.message || "Gagal mengupdate bobot");
                }
              }}
              className="flex-1 accent-foreground disabled:opacity-30 cursor-pointer"
            />
            <span className="w-12 text-center font-semibold text-sm">{Math.round(selectedVersion.non_critical_weight * 100)}%</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Bobot Critical</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              disabled={true}
              value={selectedVersion.critical_weight * 100}
              className="flex-1 accent-foreground opacity-50"
            />
            <span className="w-12 text-center font-semibold text-sm text-muted-foreground">{Math.round(selectedVersion.critical_weight * 100)}%</span>
          </div>
        </div>
      </div>

      {isDraft && selectedVersion.scoring_mode !== "no_category" && (
        <div className="flex gap-2 pt-4 border-t border-border">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Info className="w-4 h-4 text-muted-foreground" /> Geser slider untuk mengubah proporsi kontribusi antar kategori.
          </p>
        </div>
      )}
    </div>
  );
}
