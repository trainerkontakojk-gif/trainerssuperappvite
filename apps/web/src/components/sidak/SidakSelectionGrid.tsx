import type { ReactNode } from "react";

interface SidakSelectionGridProps {
  children: ReactNode;
  testId?: string;
}

export default function SidakSelectionGrid({
  children,
  testId = "sidak-selection-grid",
}: SidakSelectionGridProps) {
  return (
    <div
      data-testid={testId}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {children}
    </div>
  );
}
