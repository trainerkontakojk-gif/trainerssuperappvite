import { CheckCircle2, Clock, Loader2, XCircle, MinusCircle } from "lucide-react";
import type { ReviewStatus } from "../utils/formatting";

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <CheckCircle2 size={10} />
          Selesai
        </span>
      );
    case "processing":
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-amber-500/10 text-amber-600 border border-amber-500/20">
          <Loader2 size={10} className="animate-spin" />
          Memproses
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-red-500/10 text-red-600 border border-red-500/20">
          <XCircle size={10} />
          Gagal
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
