import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/** Lingkaran radio untuk tombol pilihan `role="radio"` di dialog Pengaturan. */
export function SettingsRadioIndicator({
  isSelected,
}: {
  isSelected: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border",
        isSelected ? "border-primary" : "border-border",
      )}
    >
      {isSelected && <span className="size-2.5 rounded-full bg-primary" />}
    </span>
  );
}

/** Tombol pilihan `role="radio"` dengan lingkaran indikator di kanan. */
export function SettingsRadioOption({
  selected,
  onSelect,
  className,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "h-auto min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal",
        selected
          ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
          : "border-border bg-card hover:bg-muted/40",
        className,
      )}
    >
      {children}
      <SettingsRadioIndicator isSelected={selected} />
    </Button>
  );
}

/** Baris pilihan karakter konsumen: tombol Pilih/Dipakai, keterangan, dan aksi. */
export function SettingsChoiceRow({
  title,
  meta,
  description,
  selected,
  onSelect,
  actions,
}: {
  title: string;
  meta?: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  actions?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 px-4 py-3 transition-colors sm:flex-nowrap",
        selected ? "bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      {/* Di layar sempit tombol turun ke baris sendiri agar teks tidak terjepit. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 max-sm:basis-full">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-foreground">{title}</span>
          {meta && <span className="text-xs text-fg2">{meta}</span>}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-1">
        {actions}
        <Button
          type="button"
          variant={selected ? "secondary" : "outline"}
          aria-pressed={selected}
          // Nama tetap; status pilihan diumumkan lewat `aria-pressed`.
          aria-label={`Pakai karakter ${title}`}
          onClick={onSelect}
          className="min-h-[44px]"
        >
          {selected && <Check data-icon="inline-start" />}
          {selected ? "Dipakai" : "Pilih"}
        </Button>
      </span>
    </li>
  );
}
