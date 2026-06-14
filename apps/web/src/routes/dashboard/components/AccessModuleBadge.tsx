export interface AccessModulePresentation {
  label: string;
  searchTerms: string;
}

export function getAccessModulePresentation(
  module: string | null | undefined,
): AccessModulePresentation {
  switch (module?.trim().toLowerCase()) {
    case "ktp":
      return { label: "KTP", searchTerms: "ktp profiler" };
    case "sidak":
      return { label: "SIDAK", searchTerms: "sidak" };
    case "all":
      return {
        label: "KTP + SIDAK",
        searchTerms: "all semua modul ktp sidak",
      };
    default:
      return {
        label: "Modul tidak diketahui",
        searchTerms: module?.trim().toLowerCase() || "",
      };
  }
}

interface AccessModuleBadgeProps {
  module?: string | null | undefined;
  label?: string;
}

export function AccessModuleBadge({
  module,
  label: overrideLabel,
}: AccessModuleBadgeProps) {
  const { label } = overrideLabel
    ? { label: overrideLabel }
    : getAccessModulePresentation(module);

  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg2 font-mono uppercase"
      aria-label={`Modul akses: ${label}`}
    >
      <span className="text-fg3 font-semibold">Modul:</span>
      <span className="truncate text-fg">{label}</span>
    </span>
  );
}
