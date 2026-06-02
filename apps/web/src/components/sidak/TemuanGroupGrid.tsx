import TemuanGroupCard, { type TemuanGroup, type TemuanGroupCardProps } from "./TemuanGroupCard";

type CardHandlers = Omit<TemuanGroupCardProps, "group" | "gIdx">;

interface TemuanGroupGridProps extends CardHandlers {
  groups: TemuanGroup[];
}

export default function TemuanGroupGrid({ groups, ...cardProps }: TemuanGroupGridProps) {
  return (
    <div
      data-testid="temuan-group-grid"
      className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3"
    >
      {groups.map((group, gIdx) => (
        <TemuanGroupCard key={group.key} group={group} gIdx={gIdx} {...cardProps} />
      ))}
    </div>
  );
}
