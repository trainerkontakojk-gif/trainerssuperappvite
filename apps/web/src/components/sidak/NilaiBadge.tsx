const NILAI_CONFIG = {
  0: { label: "KRITIS", class: "bg-rose-500 text-white" },
  1: { label: "TIDAK SESUAI", class: "bg-amber-500 text-white" },
  2: { label: "PERBAIKAN", class: "bg-blue-500 text-white" },
  3: { label: "SESUAI", class: "bg-emerald-500 text-white" },
} as const;

interface Props {
  nilai: number;
  size?: "sm" | "md";
}

export default function NilaiBadge({ nilai, size = "md" }: Props) {
  const cfg = NILAI_CONFIG[nilai as keyof typeof NILAI_CONFIG] ?? NILAI_CONFIG[0];
  const sizeClass = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1 font-black uppercase tracking-wider rounded-md ${cfg.class} ${sizeClass}`}>
      {cfg.label}
    </span>
  );
}
