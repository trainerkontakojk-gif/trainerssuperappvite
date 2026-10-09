import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { QAPeriod } from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { ConfirmDialog } from "../../components/sidak/ConfirmDialog";
import { MONTHS, periodLabel } from "../../components/sidak/sidak-input.constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Kasus "sudah punya temuan" datang dari backend dalam bahasa Indonesia; cadangan
// ini untuk kegagalan lain (jaringan, error mentah) sehingga tidak menebak penyebab.
const DELETE_FALLBACK = "Periode gagal dihapus. Coba lagi.";

/** Pesan backend dipakai hanya bila sudah berbahasa Indonesia. */
function deleteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /\b(periode|temuan|dihapus|gagal|tidak|sudah)\b/i.test(message)
    ? message
    : DELETE_FALLBACK;
}

const monthItems = MONTHS.map((label, i) => ({
  value: String(i + 1),
  label,
}));

export default function SidakPeriodsPage() {
  const {
    data: periods,
    loading,
    error,
    refetch,
  } = useApi<QAPeriod[]>("/sidak/periods");
  const now = new Date();
  const currentYear = now.getFullYear();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QAPeriod | null>(null);
  const [deleting, setDeleting] = useState(false);

  const yearItems = useMemo(() => {
    const oldest = Math.min(...(periods ?? []).map((p) => p.year), currentYear);
    const first = Math.min(oldest - 1, currentYear - 1);
    const items: { value: string; label: string }[] = [];
    for (let y = currentYear + 1; y >= first; y -= 1) {
      items.push({ value: String(y), label: String(y) });
    }
    return items;
  }, [periods, currentYear]);

  const grouped = useMemo(() => {
    const byYear = new Map<number, QAPeriod[]>();
    for (const p of periods ?? []) {
      byYear.set(p.year, [...(byYear.get(p.year) ?? []), p]);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, rows]) => ({
        year: y,
        rows: [...rows].sort((a, b) => b.month - a.month),
      }));
  }, [periods]);

  const duplicate = (periods ?? []).some(
    (p) => p.month === month && p.year === year,
  );
  const selectedLabel = periodLabel({ month, year });

  const handleAdd = async () => {
    if (saving || duplicate) return;
    setSaving(true);
    try {
      await unwrapResponse(
        await sidakClient.periods.$post({ json: { month, year } }),
      );
      notify.success(`Periode ${selectedLabel} ditambahkan.`);
      await refetch();
    } catch {
      notify.error("Periode gagal ditambahkan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await unwrapResponse(
        await sidakClient.periods[":id"].$delete({ param: { id: target.id } }),
      );
      notify.success(`Periode ${periodLabel(target)} dihapus.`);
      setDeleteTarget(null);
      await refetch();
    } catch (e) {
      notify.error(deleteErrorMessage(e));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const showSkeleton = loading && !periods;
  const showError = !periods && !loading && error;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-6 md:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-1">
            <h1 className="font-outfit text-2xl font-bold tracking-tight text-foreground">
              Periode QA
            </h1>
            <p className="text-sm text-muted-foreground">
              Kelola periode audit bulanan yang dipakai Input Temuan, Parameter
              QA, dan analitik.
            </p>
          </header>

          <section aria-label="Tambah periode" className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5 sm:w-48">
                <Label htmlFor="period-month" className="text-sm">
                  Bulan
                </Label>
                <Select
                  items={monthItems}
                  value={String(month)}
                  disabled={saving}
                  onValueChange={(value) => {
                    if (value !== null) setMonth(Number(value));
                  }}
                >
                  <SelectTrigger
                    id="period-month"
                    aria-label="Bulan"
                    className="!h-[44px] w-full min-w-0 bg-background px-3 text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {monthItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:w-32">
                <Label htmlFor="period-year" className="text-sm">
                  Tahun
                </Label>
                <Select
                  items={yearItems}
                  value={String(year)}
                  disabled={saving}
                  onValueChange={(value) => {
                    if (value !== null) setYear(Number(value));
                  }}
                >
                  <SelectTrigger
                    id="period-year"
                    aria-label="Tahun"
                    className="!h-[44px] w-full min-w-0 bg-background px-3 text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {yearItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="h-[44px] px-4"
                disabled={saving || duplicate || showSkeleton}
                onClick={() => void handleAdd()}
              >
                {saving ? "Menyimpan…" : "Tambah periode"}
              </Button>
            </div>
            {duplicate && (
              <p className="text-[12px] text-muted-foreground" role="status">
                Periode {selectedLabel} sudah ada.
              </p>
            )}
          </section>

          {showSkeleton && (
            <div className="space-y-3" aria-busy="true" aria-label="Memuat periode">
              <Skeleton className="h-5 w-16" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[44px] w-full" />
              ))}
            </div>
          )}

          {showError && (
            <QaStatePanel
              type="error"
              title="Periode gagal dimuat"
              description="Daftar periode tidak dapat dimuat. Periksa koneksi lalu coba lagi."
              action={
                <Button
                  type="button"
                  variant="outline"
                  className="h-[44px] px-4"
                  onClick={() => void refetch()}
                >
                  Coba lagi
                </Button>
              }
            />
          )}

          {periods && grouped.length === 0 && (
            <QaStatePanel
              type="empty"
              title="Belum ada periode"
              description="Tambahkan periode pertama lewat form di atas."
            />
          )}

          {grouped.length > 0 && (
            <div className="space-y-6">
              {grouped.map(({ year: y, rows }) => (
                <section key={y} className="space-y-1">
                  <h2 className="font-outfit text-base font-semibold text-foreground">
                    {y}
                  </h2>
                  <ul
                    aria-label={`Periode ${y}`}
                    className="divide-y divide-border border-y border-border"
                  >
                    {rows.map((period) => (
                      <li
                        key={period.id}
                        className="flex min-h-[44px] items-center justify-between gap-3 py-1"
                      >
                        <span className="text-sm text-foreground">
                          {MONTHS[period.month - 1]}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-[44px] w-[44px] text-muted-foreground hover:text-destructive"
                          aria-label={`Hapus ${periodLabel(period)}`}
                          onClick={() => setDeleteTarget(period)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus periode?"
        description={
          deleteTarget
            ? `Periode ${periodLabel(deleteTarget)} akan dihapus dan tidak dapat dibatalkan. Periode yang sudah punya data temuan tidak dapat dihapus.`
            : ""
        }
        confirmLabel="Hapus"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
