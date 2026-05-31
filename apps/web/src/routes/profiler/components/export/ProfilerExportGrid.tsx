import React from "react";
import { ProfilerExportCard } from "./ProfilerExportCard";
import type { ExportOption } from "./ProfilerExportCard";

interface ProfilerExportGridProps {
  options: ExportOption[];
  disabled: boolean;
  generating: string | null;
}

export function ProfilerExportGrid({
  options,
  disabled,
  generating,
}: ProfilerExportGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt) => (
        <ProfilerExportCard
          key={opt.id}
          option={opt}
          disabled={disabled}
          isGenerating={generating === opt.id}
        />
      ))}
    </div>
  );
}
