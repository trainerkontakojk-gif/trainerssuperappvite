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
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700"
      aria-label={`Modul akses: ${label}`}
    >
      <span className="uppercase tracking-wide text-indigo-500">Modul</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
