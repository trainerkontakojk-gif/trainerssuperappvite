import TemuanGroupCard, {
  type TemuanGroup,
  type TemuanGroupCardProps,
} from "./TemuanGroupCard";

type CardHandlers = Omit<TemuanGroupCardProps, "group">;

interface TemuanGroupGridProps extends CardHandlers {
  groups: TemuanGroup[];
}

/** Daftar satu kolom, satu blok per tiket (mockup Input temuan). */
export default function TemuanGroupGrid({
  groups,
  ...cardProps
}: TemuanGroupGridProps) {
  return (
    <ul
      data-testid="temuan-group-grid"
      aria-label="Temuan per tiket"
      className="space-y-3"
    >
      {groups.map((group) => (
        <TemuanGroupCard key={group.key} group={group} {...cardProps} />
      ))}
    </ul>
  );
}
