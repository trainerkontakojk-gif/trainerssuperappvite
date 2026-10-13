import { cn } from "cn";

interface PdktSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Sakelar on/off dengan area sentuh 44px; jalurnya 36×22 seperti mockup. */
export function PdktSwitch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: PdktSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="group flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[22px] w-9 rounded-full p-0.5 transition-colors",
          checked ? "justify-end bg-primary" : "justify-start bg-foreground/25",
        )}
      >
        <span className="size-[18px] rounded-full bg-background shadow-sm" />
      </span>
    </button>
  );
}
