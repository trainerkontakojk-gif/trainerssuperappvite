import React from "react";

export function ScenarioStickyFooter({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <footer className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
    </footer>
  );
}
