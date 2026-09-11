import type { RootCauseTicketReference } from "@trainers/types";
import { Badge } from "@/components/ui/badge";
import { formatTicketLabel } from "./rootCauseTicketUtils";

export default function TicketEvidenceGroups({
  references,
  className = "rounded-md border border-border bg-background/50 p-3",
}: {
  references: RootCauseTicketReference[];
  className?: string;
}) {
  if (references.length === 0) return null;

  return (
    <div className={`${className} flex flex-wrap gap-1.5`}>
      {references.map((ref) => (
        <Badge
          key={`${ref.no_tiket}-${ref.periodId}`}
          variant="outline"
          className="h-auto whitespace-normal rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground"
        >
          {formatTicketLabel(ref)}
        </Badge>
      ))}
    </div>
  );
}
