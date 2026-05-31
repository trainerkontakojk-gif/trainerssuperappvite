import React from "react";

export interface ExportOption {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: () => void;
  hover: string;
}

interface ProfilerExportCardProps {
  option: ExportOption;
  disabled: boolean;
  isGenerating: boolean;
}

export function ProfilerExportCard({
  option,
  disabled,
  isGenerating,
}: ProfilerExportCardProps) {
  return (
    <button
      onClick={option.action}
      disabled={disabled}
      className={`flex flex-col items-start rounded-[2rem] border border-border/40 bg-card p-6 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : `${option.hover} hover:shadow-md hover:-translate-y-0.5`
      }`}
    >
      <div className="mb-4 flex items-center justify-between w-full">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
          {isGenerating ? (
            <div className="animate-spin rounded-full border-b-2 border-primary h-8 w-8" />
          ) : (
            option.icon
          )}
        </div>
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground">
        {option.title}
      </h3>
      <p className="text-xs font-medium leading-relaxed text-muted-foreground">
        {option.desc}
      </p>
    </button>
  );
}
