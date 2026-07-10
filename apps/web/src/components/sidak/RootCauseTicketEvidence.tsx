import type { RootCauseTicketReference } from "@trainers/types";
import { formatTicketLabel } from "./rootCauseTicketUtils";

export default function TicketEvidenceGroups({
  references,
  className = "space-y-2 rounded-md border border-border bg-background/50 p-3",
}: {
  references: RootCauseTicketReference[];
  className?: string;
}) {
  if (references.length === 0) return null;

  return (
    <div className={`${className} flex flex-wrap gap-1.5`}>
      {references.map((ref) => (
        <span
          key={`${ref.no_tiket}-${ref.periodId}`}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
        >
          {formatTicketLabel(ref)}
        </span>
      ))}
    </div>
  );
}
