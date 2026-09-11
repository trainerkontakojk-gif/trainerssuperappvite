import { CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "../utils/formatting";

const baseClassName =
  "h-auto gap-1 rounded-full bg-muted px-2 py-1 text-xs font-bold uppercase tracking-[0.08em]";

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="outline" className={baseClassName}>
          <CheckCircle2 className="size-3" aria-hidden="true" style={{ color: "var(--chart-green)" }} />
          <span style={{ color: "var(--chart-green)" }}>Selesai</span>
        </Badge>
      );
    case "processing":
    case "pending":
      return (
        <Badge variant="outline" className={`${baseClassName} animate-pulse motion-reduce:animate-none`}>
          <Loader2
            className="size-3 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
            style={{ color: "var(--chart-amber)" }}
          />
          <span style={{ color: "var(--chart-amber)" }}>Memproses</span>
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className={baseClassName}>
          <XCircle className="size-3" aria-hidden="true" style={{ color: "var(--chart-red)" }} />
          <span style={{ color: "var(--chart-red)" }}>Gagal</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={baseClassName}>
          <MinusCircle className="size-3" aria-hidden="true" />
          Belum Dinilai
        </Badge>
      );
  }
}
