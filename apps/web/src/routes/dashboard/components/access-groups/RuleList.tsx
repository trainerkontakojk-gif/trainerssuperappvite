import { X } from "lucide-react";
import type { AccessGroupItemRow } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import { Skeleton } from "../../../../components/ui/skeleton";
import { RULE_TYPE_LABELS } from "./ruleLabels";

interface RuleListProps {
  groupName: string;
  items: AccessGroupItemRow[];
  loading: boolean;
  onDelete: (item: AccessGroupItemRow) => void;
  getRuleValueLabel: (type: string, val: string) => string;
}

/**
 * Aturan grup dibaca sebagai satu kalimat. Scope grup bertipe `union`, jadi
 * aturan digabung dengan "atau": data terlihat bila cocok dengan salah satunya.
 */
export function RuleList({
  groupName,
  items,
  loading,
  onDelete,
  getRuleValueLabel,
}: RuleListProps) {
  return (
    <section className="grid gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Data yang terlihat
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Leader di grup ini bisa melihat data peserta bila cocok dengan salah
          satu aturan berikut.
        </p>
      </div>

      {loading && items.length === 0 ? (
        <div role="status" aria-live="polite" className="grid gap-2">
          <span className="sr-only">Memuat aturan…</span>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Belum ada aturan. Leader di grup ini belum bisa melihat data peserta
          apa pun.
        </p>
      ) : (
        <ul
          aria-label={`Aturan data ${groupName}`}
          className="divide-y divide-border rounded-lg border border-border"
        >
          {items.map((item, index) => {
            const typeLabel =
              RULE_TYPE_LABELS[item.field_name] ?? item.field_name;
            const valueLabel = getRuleValueLabel(
              item.field_name,
              item.field_value,
            );
            return (
              <li
                key={item.id}
                className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5"
              >
                <span className="min-w-0 text-sm text-muted-foreground">
                  {index > 0 ? (
                    <span className="mr-2 text-xs font-medium text-muted-foreground uppercase">
                      atau
                    </span>
                  ) : null}
                  {typeLabel} adalah{" "}
                  <span className="font-medium break-words text-foreground">
                    {valueLabel}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 text-muted-foreground hover:text-destructive sm:size-8"
                  aria-label={`Hapus aturan ${typeLabel} ${valueLabel}`}
                  onClick={() => onDelete(item)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
