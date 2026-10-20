import { Copy, X } from "lucide-react";
import type { KetikIdentity } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import { notify } from "../../../../lib/toast";

interface DataRow {
  label: string;
  value: string | undefined;
  /** Noun in the copy button name ("Salin NIK"); absent rows cannot be copied. */
  copyLabel?: string;
  mono?: boolean;
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    notify.success(`${label} disalin.`);
  } catch {
    notify.error(`${label} belum bisa disalin.`);
  }
}

/**
 * Consumer data as a real agent console would show it: values exactly as the
 * session holds them, with no warnings, hints or "practice data" notes, so the
 * agent has to spot a malformed NIK or email on their own.
 */
export function KetikConsumerDataPanel({
  id,
  identity,
  onClose,
}: {
  id: string;
  identity: KetikIdentity;
  onClose: () => void;
}) {
  const rows: DataRow[] = [
    { label: "Nama", value: identity.name },
    { label: "Kota", value: identity.city },
    {
      label: "Nomor telepon",
      value: identity.phone,
      copyLabel: "nomor telepon",
      mono: true,
    },
    { label: "NIK", value: identity.nik, copyLabel: "NIK", mono: true },
    { label: "Email", value: identity.email, copyLabel: "email" },
  ];

  return (
    <aside
      id={id}
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="module-clean-panel flex shrink-0 flex-col border-border bg-surface-elevated max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[70] max-lg:max-h-[75%] max-lg:overflow-y-auto max-lg:rounded-t-2xl max-lg:border-t max-lg:shadow-lg lg:w-80 lg:border-l"
    >
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <h2
          id={`${id}-title`}
          className="min-w-0 flex-1 font-display text-[17px] font-semibold tracking-tight text-foreground"
        >
          Data konsumen
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Tutup data konsumen"
          className="size-11 shrink-0 lg:hidden"
        >
          <X />
        </Button>
      </div>

      <dl className="flex flex-col px-2 pb-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex min-h-[60px] items-center gap-2 border-t border-border py-1.5 pr-1 pl-3 last:border-b"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd
                className={
                  row.mono
                    ? "font-mono text-[13.5px] font-medium break-all text-foreground"
                    : "text-sm font-medium break-words text-foreground"
                }
              >
                {row.value || "—"}
              </dd>
            </div>
            {row.copyLabel && row.value ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void copy(row.value ?? "", row.label)}
                aria-label={`Salin ${row.copyLabel}`}
                className="size-11 shrink-0 text-fg2"
              >
                <Copy />
              </Button>
            ) : null}
          </div>
        ))}
      </dl>
    </aside>
  );
}
