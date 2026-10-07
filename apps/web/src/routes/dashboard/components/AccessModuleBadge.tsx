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
