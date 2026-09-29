import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Filter bagian layanan.
 *
 * Dipakai sebagai **select**, bukan rail pill: state-nya satu nilai tunggal
 * (string), jadi yang benar adalah label + selector. Rail pill untuk empat
 * tombol pendek cuma menambah noise dan memakan lebar — terutama karena
 * "Semua layanan" bersama "Digital Chat" jauh lebih lebar daripada rata-rata
 * pilihan lain, sehingga rail terlihat tidak seimbang.
 */
export type SectionOption = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  value: string;
  options: SectionOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function SectionFilter({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: Props) {
  // Nilai internal memakai slug (`""` = semua, `digital-chat`), sedangkan yang
  // harus tampil di trigger adalah label. `SelectValue` tanpa children
  // menampilkan nilai mentah — "all" dan "call" bocor ke user sebagai teks
  // filter, bukan label pilihannya.
  const current = value === "" ? "all" : value;
  const currentLabel =
    options.find((option) => (option.value || "all") === current)?.label ?? "";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Select
        value={current}
        onValueChange={(next) => onChange(next === "all" ? "" : (next ?? ""))}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          data-testid={`jadwal-shifting-section-${current}`}
          className="min-h-11 w-full min-w-[11rem] bg-background"
        >
          <SelectValue>{currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value || "all"}
              value={option.value || "all"}
              data-testid={`jadwal-shifting-section-option-${option.value || "all"}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
