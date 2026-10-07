import { Search } from "lucide-react";
import { cn } from "cn";
import { Input } from "../../../../components/ui/input";

interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Kolom cari bersama; `label` dipakai sebagai nama aksesibel sekaligus placeholder. */
export function SearchField({
  label,
  value,
  onChange,
  className,
}: SearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        aria-label={label}
        placeholder={`${label}…`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full bg-card pl-9 text-sm"
      />
    </div>
  );
}
