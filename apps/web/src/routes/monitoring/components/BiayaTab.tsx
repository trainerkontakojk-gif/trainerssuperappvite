import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, Search } from "lucide-react";
import { normalizeRole } from "@trainers/types";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  aiClient,
  unwrapResponse,
  type UsageAggregation,
} from "../../../lib/api";
import { useAuthStore } from "../../../store/authStore";
import {
  formatUsageMonth,
  rememberBiayaSearch,
  USAGE_MODULE_LABELS,
  usageMonth,
  usageQuery,
  validateBiayaSearch,
  type BiayaSearch,
  type UsageModule,
} from "../biaya-search";
import { formatIdr, mapError } from "../utils/formatting";
import {
  ModelTable,
  MonthPicker,
  UsageCostNote,
  UsagePanel,
  UsageSummary,
} from "./usage/UsageParts";
import {
  formatCount,
  formatRupiahCell,
  sumUsage,
  usageByModel,
  usageRoleLabel,
} from "./usage/totals";

const ALL = "all";
const MODULE_OPTIONS = [
  { value: ALL, label: "Semua modul" },
  ...Object.entries(USAGE_MODULE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const th = "px-4 py-2.5 font-medium";
const td = "px-4 py-2 text-right tabular-nums";

function UserTable({
  rows,
  search,
}: {
  rows: UsageAggregation[];
  search: BiayaSearch;
}) {
  const navigate = useNavigate();
  const total = sumUsage(rows);
  const open = (row: UsageAggregation) =>
    void navigate({
      to: "/monitoring/biaya/$pengguna",
      params: { pengguna: row.user_id },
      search,
    });
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table
          aria-label="Biaya per pengguna"
          className="w-full min-w-[52rem] text-sm"
        >
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className={th}>Pengguna</th>
              <th className={`${th} w-24`}>Peran</th>
              <th className={`${th} w-24 text-right`}>Panggilan</th>
              <th className={`${th} w-28 text-right`}>Token</th>
              <th className={`${th} w-28 text-right`}>Simulasi</th>
              <th className={`${th} w-28 text-right`}>Penilaian</th>
              <th className={`${th} w-24 text-right`}>Lainnya</th>
              <th className={`${th} w-28 text-right`}>Total (Rp)</th>
              <th className="w-10">
                <span className="sr-only">Rincian</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.user_id}
                onClick={() => open(row)}
                className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
              >
                <td className="max-w-80 truncate px-4 py-2">
                  <Link
                    to="/monitoring/biaya/$pengguna"
                    params={{ pengguna: row.user_id }}
                    search={search}
                    onClick={(event) => event.stopPropagation()}
                    className="font-medium text-foreground hover:underline focus-visible:underline"
                  >
                    {row.user_name || row.user_email || "Tanpa nama"}
                  </Link>
                  {row.user_name && row.user_email ? (
                    <span className="text-muted-foreground">
                      {" "}
                      {row.user_email}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {usageRoleLabel(row.user_role)}
                </td>
                <td className={td}>{formatCount(row.total_calls)}</td>
                <td className={td}>{formatCount(row.total_tokens)}</td>
                <td className={td}>
                  {formatRupiahCell(row.simulation_cost_idr)}
                </td>
                <td className={td}>{formatRupiahCell(row.review_cost_idr)}</td>
                <td className={td}>{formatRupiahCell(row.other_cost_idr)}</td>
                <td className={`${td} font-semibold`}>
                  {formatRupiahCell(row.total_cost_idr)}
                </td>
                <td className="pr-3 text-muted-foreground">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold text-foreground">
              <th scope="row" colSpan={2} className="px-4 py-2.5 text-left">
                Total
              </th>
              <td className={td}>{formatCount(total.calls)}</td>
              <td className={td}>{formatCount(total.tokens)}</td>
              <td className={td}>{formatRupiahCell(total.simulation)}</td>
              <td className={td}>{formatRupiahCell(total.review)}</td>
              <td className={td}>{formatRupiahCell(total.other)}</td>
              <td className={td}>{formatRupiahCell(total.cost)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <ul
        aria-label="Biaya per pengguna"
        className="divide-y divide-border md:hidden"
      >
        {rows.map((row) => (
          <li key={row.user_id}>
            <Link
              to="/monitoring/biaya/$pengguna"
              params={{ pengguna: row.user_id }}
              search={search}
              className="flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-muted/40"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-medium text-foreground">
                  {row.user_name || row.user_email || "Tanpa nama"}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatIdr(row.total_cost_idr)}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {usageRoleLabel(row.user_role)} · {formatCount(row.total_calls)}{" "}
                panggilan
              </span>
            </Link>
          </li>
        ))}
        <li className="flex justify-between gap-3 px-4 py-3 font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{formatIdr(total.cost)}</span>
        </li>
      </ul>
    </>
  );
}

export function BiayaTab() {
  const navigate = useNavigate();
  const search = validateBiayaSearch(useSearch({ strict: false }));
  const month = usageMonth(search);
  const isLeader =
    normalizeRole(useAuthStore((s) => s.profile?.role)) === "leader";

  const [rows, setRows] = useState<UsageAggregation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(search.q ?? "");

  const update = (patch: Partial<BiayaSearch>) => {
    const next = validateBiayaSearch({ ...search, ...patch });
    rememberBiayaSearch(next);
    void navigate({ to: "/monitoring/biaya", search: next, replace: true });
  };

  useEffect(() => {
    rememberBiayaSearch(search);
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await unwrapResponse(
          await aiClient["monitoring/aggregation"].$get({
            query: usageQuery(search),
          }),
        );
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(mapError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Pencarian disaring di browser, jadi `q` tidak memicu pemuatan ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, search.modul, attempt]);

  const all = useMemo(() => rows ?? [], [rows]);
  const filtered = useMemo(() => {
    const q = search.q?.toLowerCase();
    const sorted = [...all].sort((a, b) => b.total_cost_idr - a.total_cost_idr);
    if (!q) return sorted;
    return sorted.filter((row) =>
      [row.user_name, row.user_email].some((value) =>
        value?.toLowerCase().includes(q),
      ),
    );
  }, [all, search.q]);
  const models = useMemo(() => usageByModel(all), [all]);

  return (
    <div className="mt-6 flex flex-col gap-4" aria-busy={loading}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <MonthPicker month={month} onChange={(bulan) => update({ bulan })} />
        <Select
          items={MODULE_OPTIONS}
          value={search.modul ?? ALL}
          onValueChange={(value, details) => {
            if (value === null || details.reason === "none") return;
            update({
              modul: value === ALL ? undefined : (value as UsageModule),
            });
          }}
        >
          <SelectTrigger aria-label="Modul" className="min-h-11 md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODULE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative md:ml-auto md:w-64">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Cari pengguna"
            placeholder="Cari pengguna"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              update({ q: event.target.value || undefined });
            }}
            className="min-h-11 pl-9"
          />
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="items-center">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAttempt((n) => n + 1)}
            className="ml-auto min-h-11"
          >
            Coba lagi
          </Button>
        </Alert>
      ) : null}

      {isLeader ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          Menampilkan biaya akun di tim yang aksesnya sudah disetujui.
        </p>
      ) : null}

      {loading && !rows ? (
        <div
          role="status"
          className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        >
          <Skeleton className="size-4 rounded-full" />
          Memuat biaya…
        </div>
      ) : rows ? (
        <>
          <UsageSummary totals={sumUsage(all)} />
          <UsagePanel
            title="Per pengguna"
            aside={`${formatCount(filtered.length)} pengguna`}
          >
            {filtered.length ? (
              <UserTable rows={filtered} search={search} />
            ) : (
              <div className="grid justify-items-center gap-2 px-5 py-10 text-center">
                <p className="font-semibold text-foreground">
                  {all.length
                    ? "Tidak ada pengguna yang cocok"
                    : `Belum ada pemakaian AI di ${formatUsageMonth(month)}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {all.length
                    ? "Ubah kata pencarian untuk melihat pengguna lain."
                    : "Biaya muncul di sini setelah ada panggilan AI pada bulan itu."}
                </p>
              </div>
            )}
          </UsagePanel>
          {models.length ? (
            <UsagePanel title="Per model">
              <ModelTable rows={models} />
            </UsagePanel>
          ) : null}
          <UsageCostNote />
        </>
      ) : null}
    </div>
  );
}
