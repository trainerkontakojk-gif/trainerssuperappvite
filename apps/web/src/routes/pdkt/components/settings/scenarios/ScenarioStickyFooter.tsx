import React from "react";

interface ScenarioStickyFooterProps {
  children: React.ReactNode;
}

export function ScenarioStickyFooter({ children }: ScenarioStickyFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur-0 px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {children}
      </div>
    </div>
  );
}
