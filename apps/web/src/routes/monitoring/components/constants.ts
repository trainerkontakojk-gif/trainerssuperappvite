/** Nilai "all" hanya dipakai di batas Select; state halaman memakai "". */
export const ALL_MODULES = "all";

export const MODULE_OPTIONS = [
  { value: ALL_MODULES, label: "Semua modul" },
  { value: "ketik", label: "KETIK" },
  { value: "pdkt", label: "PDKT" },
  { value: "telefun", label: "Telefun" },
  { value: "qa-analyzer", label: "Analisis QA" },
];

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Date(2000, index, 1).toLocaleString("id-ID", { month: "long" }),
}));
