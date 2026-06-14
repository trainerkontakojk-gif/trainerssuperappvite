import { Shield, Trash2, Filter, Info } from "lucide-react";
import type { AccessGroupItemRow } from "@trainers/types";

type RuleType = "tim" | "service_type" | "batch_name" | "peserta_id";

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  tim: "Team",
  service_type: "Service",
  batch_name: "Batch",
  peserta_id: "Specific Agent",
};

interface RuleListProps {
  items: AccessGroupItemRow[];
  loading: boolean;
  onDelete: (id: string) => void;
  getRuleValueLabel: (type: string, val: string) => string;
}

export function RuleList({
  items,
  loading,
  onDelete,
  getRuleValueLabel,
}: RuleListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Aturan Wilayah Kerja (Data Rules)
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Anggota grup ini hanya diperbolehkan mengakses data peserta yang memenuhi kriteria aturan di bawah.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="mt-3 text-[10px] font-bold uppercase tracking-widest opacity-60">
              Memuat aturan...
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-12 text-center bg-muted/20">
            <Info className="mx-auto h-6 w-6 text-muted-foreground/40 mb-3" />
            <p className="text-xs font-semibold text-foreground/70">
              Belum ada aturan akses
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] mx-auto">
              Semua data peserta terproteksi penuh hingga aturan baru ditambahkan.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/20 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                    <Filter className="h-3 w-3" />
                    {RULE_TYPE_LABELS[item.field_name as RuleType] || item.field_name}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    adalah
                  </span>
                  <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-foreground tracking-tight">
                    {getRuleValueLabel(item.field_name, item.field_value)}
                  </span>
                </div>
                <button
                  onClick={() => onDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-2 rounded-lg hover:bg-destructive/10 transition-all"
                  title="Hapus aturan"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
