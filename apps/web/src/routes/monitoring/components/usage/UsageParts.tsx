import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  formatUsageMonth,
  isCurrentUsageMonth,
  isFirstUsageMonth,
  shiftMonth,
  usageMonthOptions,
} from "../../biaya-search";
import { formatIdr } from "../../utils/formatting";
import {
  CATEGORY_LABELS,
  formatCount,
  formatRupiahCell,
  usageModelName,
  usageModuleLabel,
  type UsageModelRow,
  type UsageTotals,
} from "./totals";

/** Satu baris ringkas angka bulan ini; semua biaya menjumlah ke Total. */
export function UsageSummary({ totals }: { totals: UsageTotals }) {
  const cells: Array<[string, string]> = [
    ["Total biaya", formatIdr(totals.cost)],
    ["Simulasi", totals.simulation > 0 ? formatIdr(totals.simulation) : "-"],
    ["Penilaian", totals.review > 0 ? formatIdr(totals.review) : "-"],
    ["Lainnya", totals.other > 0 ? formatIdr(totals.other) : "-"],
    ["Panggilan AI", formatCount(totals.calls)],
    ["Token", formatCount(totals.tokens)],
  ];
  return (
    <dl
      aria-label="Ringkasan biaya"
      className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6"
    >
      {cells.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-col gap-0.5 border-b border-r border-border/60 px-4 py-3"
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function UsagePanel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = `usage-panel-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id={id} className="font-semibold text-foreground">
          {title}
        </h2>
        {aside ? (
          <span className="text-sm text-muted-foreground">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ModelName({ id }: { id: string }) {
  const name = usageModelName(id);
  return (
    <>
      {name ? <span className="text-foreground">{name} </span> : null}
      <span className="font-mono text-xs text-muted-foreground">{id}</span>
    </>
  );
}

const th = "px-4 py-2.5 font-medium";
const td = "px-4 py-2 tabular-nums";

/**
 * Biaya per model, modul, dan jenis. `splitTokens` memisah token masuk dan
 * keluar (halaman satu orang).
 */
export function ModelTable({
  rows,
  splitTokens = false,
}: {
  rows: UsageModelRow[];
  splitTokens?: boolean;
}) {
  const total = rows.reduce(
    (acc, row) => ({
      calls: acc.calls + row.calls,
      input: acc.input + row.input_tokens,
      output: acc.output + row.output_tokens,
      tokens: acc.tokens + row.total_tokens,
      cost: acc.cost + row.cost_idr,
    }),
    { calls: 0, input: 0, output: 0, tokens: 0, cost: 0 },
  );
  return (
    <div className="overflow-x-auto">
      <table
        aria-label="Biaya per model"
        className="w-full min-w-[44rem] text-sm"
      >
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className={th}>Model</th>
            <th className={`${th} w-28`}>Modul</th>
            <th className={`${th} w-28`}>Jenis</th>
            <th className={`${th} w-24 text-right`}>Panggilan</th>
            {splitTokens ? (
              <>
                <th className={`${th} w-32 text-right`}>Token masuk</th>
                <th className={`${th} w-32 text-right`}>Token keluar</th>
              </>
            ) : (
              <th className={`${th} w-32 text-right`}>Token</th>
            )}
            <th className={`${th} w-32 text-right`}>Biaya (Rp)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.model_id}|${row.module}|${row.action_category}`}
              className="border-b border-border/60"
            >
              <td className="px-4 py-2">
                <ModelName id={row.model_id} />
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {usageModuleLabel(row.module)}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {CATEGORY_LABELS[row.action_category]}
              </td>
              <td className={`${td} text-right`}>{formatCount(row.calls)}</td>
              {splitTokens ? (
                <>
                  <td className={`${td} text-right`}>
                    {formatCount(row.input_tokens)}
                  </td>
                  <td className={`${td} text-right`}>
                    {formatCount(row.output_tokens)}
                  </td>
                </>
              ) : (
                <td className={`${td} text-right`}>
                  {formatCount(row.total_tokens)}
                </td>
              )}
              <td className={`${td} text-right`}>
                {formatRupiahCell(row.cost_idr)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold text-foreground">
            <th scope="row" className="px-4 py-2.5 text-left" colSpan={3}>
              Total
            </th>
            <td className={`${td} text-right`}>{formatCount(total.calls)}</td>
            {splitTokens ? (
              <>
                <td className={`${td} text-right`}>
                  {formatCount(total.input)}
                </td>
                <td className={`${td} text-right`}>
                  {formatCount(total.output)}
                </td>
              </>
            ) : (
              <td className={`${td} text-right`}>
                {formatCount(total.tokens)}
              </td>
            )}
            <td className={`${td} text-right`}>
              {formatRupiahCell(total.cost)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Bulan sebelumnya, pilihan bulan, dan bulan berikutnya. */
export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const options = usageMonthOptions().map((value) => ({
    value,
    label: formatUsageMonth(value),
  }));
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Bulan sebelumnya"
        disabled={isFirstUsageMonth(month)}
        onClick={() => onChange(shiftMonth(month, -1))}
        className="size-11 shrink-0"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      <Select
        items={options}
        value={month}
        onValueChange={(value, details) => {
          // Base UI juga memanggil ini tanpa aksi pengguna (reason "none").
          if (value === null || details.reason === "none") return;
          onChange(value);
        }}
      >
        <SelectTrigger
          aria-label="Bulan"
          className="min-h-11 min-w-0 flex-1 sm:w-44 sm:flex-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Bulan berikutnya"
        disabled={isCurrentUsageMonth(month)}
        onClick={() => onChange(shiftMonth(month, 1))}
        className="size-11 shrink-0"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function UsageCostNote() {
  return (
    <p className="text-sm text-muted-foreground">
      Biaya dicatat saat panggilan terjadi, memakai harga model dan kurs pada
      saat itu. Mengubah harga atau kurs tidak mengubah biaya yang sudah
      tercatat.
    </p>
  );
}
