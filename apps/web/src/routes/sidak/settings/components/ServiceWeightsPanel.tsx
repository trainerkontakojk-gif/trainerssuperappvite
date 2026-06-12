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
    <div className="bg-card rounded-[2.5rem] border border-border p-8 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <Settings className="w-4 h-4" /> Konfigurasi Bobot & Mode
        </h3>
        <span className="px-3 py-1 bg-foreground/5 border border-border rounded-full text-[10px] font-black uppercase">
          {selectedVersion.scoring_mode} Mode
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot Non-Critical</label>
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
              className="flex-1 accent-primary disabled:opacity-30 cursor-pointer"
            />
            <span className="w-12 text-center font-black text-sm">{Math.round(selectedVersion.non_critical_weight * 100)}%</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot Critical</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              disabled={true}
              value={selectedVersion.critical_weight * 100}
              className="flex-1 accent-red-500 opacity-50"
            />
            <span className="w-12 text-center font-black text-sm text-red-500">{Math.round(selectedVersion.critical_weight * 100)}%</span>
          </div>
        </div>
      </div>

      {isDraft && selectedVersion.scoring_mode !== "no_category" && (
        <div className="flex gap-2 pt-4 border-t border-border">
          <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
            <Info className="w-3 h-3 text-primary" /> Geser slider untuk mengubah proporsi kontribusi antar kategori.
          </p>
        </div>
      )}
    </div>
  );
}
