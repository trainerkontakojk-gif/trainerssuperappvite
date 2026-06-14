import { CheckCircle2, Clock, Loader2, XCircle, MinusCircle } from "lucide-react";
import type { ReviewStatus } from "../utils/formatting";

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-muted text-muted-foreground border border-border">
          <CheckCircle2 size={10} style={{ color: 'var(--chart-green)' }} />
          <span style={{ color: 'var(--chart-green)' }}>Selesai</span>
        </span>
      );
    case "processing":
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-muted text-muted-foreground border border-border animate-pulse">
          <Loader2 size={10} className="animate-spin" style={{ color: 'var(--chart-amber)' }} />
          <span style={{ color: 'var(--chart-amber)' }}>Memproses</span>
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-muted text-muted-foreground border border-border">
          <XCircle size={10} style={{ color: 'var(--chart-red)' }} />
          <span style={{ color: 'var(--chart-red)' }}>Gagal</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-muted text-muted-foreground border border-border">
          <MinusCircle size={10} />
          Belum Dinilai
        </span>
      );
  }
}
