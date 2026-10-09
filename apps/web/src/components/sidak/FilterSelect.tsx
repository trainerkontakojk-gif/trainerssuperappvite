import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterSelectItem = { value: string; label: string };
export type FilterSelectGroup = { label: string; items: FilterSelectItem[] };

type FilterSelectProps = {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Opsi tanpa grup, ditampilkan lebih dulu. */
  items?: FilterSelectItem[];
  /** Opsi berkelompok (menggantikan `<optgroup>`), ditampilkan setelah `items`. */
  groups?: FilterSelectGroup[];
  disabled?: boolean;
  busy?: boolean;
  className?: string;
};

/**
 * Filter analitik SIDAK: label terlihat + `ui/select` (Base UI) setinggi 44px.
 *
 * Nilai selalu string. Opsi "kosong" dipetakan pemanggil ke sentinel string di
 * batas komponen ini, supaya state dan API tetap memakai nilai aslinya.
 */
export function FilterSelect({
  id,
  label,
  value,
  onValueChange,
  items = [],
  groups = [],
  disabled,
  busy,
  className,
}: FilterSelectProps) {
  const lookup = [...items, ...groups.flatMap((group) => group.items)];
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} className="text-[12px] font-medium text-fg2">
        {label}
      </Label>
      <Select
        items={lookup}
        value={value}
        disabled={disabled}
        onValueChange={(next, details) => {
          // Base UI juga memanggil ini tanpa aksi pengguna (reason "none"):
          // saat daftar opsi berubah dan nilai terkontrol sementara tidak ada
          // di daftar, ia mengembalikan nilai awal. Itu akan menghapus pilihan
          // yang masih valid (mis. Parameter saat katalog dimuat ulang). Hanya
          // pilihan pengguna yang diteruskan; nilai tetap milik state halaman.
          if (next === null || details.reason === "none") return;
          onValueChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          aria-busy={busy || undefined}
          className="!h-[44px] w-full min-w-0 bg-background px-3 text-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          className="w-auto min-w-(--anchor-width) max-w-[min(32rem,calc(100vw-2rem))]"
        >
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="text-[12px]">{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
