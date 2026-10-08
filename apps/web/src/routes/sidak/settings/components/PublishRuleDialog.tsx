import { useEffect, useMemo, useState } from "react";
import type { QARuleIndicator, RuleVersion } from "@trainers/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { periodLabel } from "../../../../components/sidak/sidak-input.constants";
import { sidakClient, unwrapResponse } from "../../../../lib/api";
import { CAT_LABEL, SCORING_MODE_LABEL, SERVICE_LABELS } from "../constants";
import {
  diffRuleVersions,
  getIndicatorCategoryTotals,
  hasValidWeightedCategoryTotals,
} from "../utils";

interface Period {
  id: string;
  month: number;
  year: number;
}

interface PublishRuleDialogProps {
  open: boolean;
  version: RuleVersion;
  /** Versi published pembanding; `null` bila ini versi pertama layanan. */
  baseline: RuleVersion | null;
  periods: Period[];
  draftIndicators: QARuleIndicator[];
  periodId: string;
  onPeriodChange: (id: string) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  publishing: boolean;
  previewVersionNumber: number;
  onPublish: () => void;
  onClose: () => void;
}

const FIELD_LABEL = {
  name: "Nama",
  bobot: "Bobot",
  category: "Kategori",
  has_na: "N/A",
  threshold: "Ambang",
} as const;

const pct = (value: number) => `${Math.round(value * 100)}%`;

function fieldValue(
  indicator: QARuleIndicator,
  field: keyof typeof FIELD_LABEL,
): string {
  switch (field) {
    case "name":
      return indicator.name;
    case "bobot":
      return pct(indicator.bobot);
    case "category":
      return CAT_LABEL[indicator.category];
    case "has_na":
      return indicator.has_na ? "diizinkan" : "tidak diizinkan";
    case "threshold":
      return indicator.threshold != null ? String(indicator.threshold) : "-";
  }
}

type BaselineState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; indicators: QARuleIndicator[] };

function useBaselineIndicators(baselineId: string | null): BaselineState {
  const [state, setState] = useState<{ id: string | null; value: BaselineState }>({
    id: null,
    value: { status: "none" },
  });
  useEffect(() => {
    if (!baselineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await unwrapResponse(
          await sidakClient["rule-versions"][":id"].indicators.$get({
            param: { id: baselineId },
          }),
        );
        if (!cancelled)
          setState({
            id: baselineId,
            value: { status: "ready", indicators: (rows as QARuleIndicator[]) ?? [] },
          });
      } catch (e) {
        if (!cancelled)
          setState({
            id: baselineId,
            value: {
              status: "error",
              message: e instanceof Error ? e.message : "Terjadi kesalahan",
            },
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baselineId]);

  if (!baselineId) return { status: "none" };
  return state.id === baselineId ? state.value : { status: "loading" };
}

function DiffSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

function ChangeSummary({
  version,
  baseline,
  draftIndicators,
}: Pick<PublishRuleDialogProps, "version" | "baseline" | "draftIndicators">) {
  const state = useBaselineIndicators(baseline?.id ?? null);
  const diff = useMemo(
    () =>
      baseline && state.status === "ready"
        ? diffRuleVersions(
            {
              indicators: state.indicators,
              nonCriticalWeight: baseline.non_critical_weight,
              criticalWeight: baseline.critical_weight,
            },
            {
              indicators: draftIndicators,
              nonCriticalWeight: version.non_critical_weight,
              criticalWeight: version.critical_weight,
            },
          )
        : null,
    [baseline, state, draftIndicators, version],
  );

  if (!baseline) {
    return (
      <p className="text-sm text-muted-foreground">
        Versi pertama untuk layanan ini.
      </p>
    );
  }
  if (state.status === "loading") {
    return <Skeleton className="h-[72px] w-full" />;
  }
  if (state.status === "error" || !diff) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Gagal memuat versi berlaku untuk perbandingan
          {state.status === "error" ? `: ${state.message}` : ""}. Periksa
          parameter secara manual sebelum publish.
        </AlertDescription>
      </Alert>
    );
  }

  const empty =
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    !diff.categoryWeights;

  return (
    <div className="space-y-3">
      {empty && (
        <p className="text-sm text-muted-foreground">
          Tidak ada perubahan parameter atau bobot dibanding v{baseline.version_number}.
        </p>
      )}
      {diff.categoryWeights && (
        <DiffSection title="Bobot kategori">
          <p className="text-sm text-foreground">
            Non-critical {diff.categoryWeights.before.nonCritical}% →{" "}
            {diff.categoryWeights.after.nonCritical}%
            <span className="text-muted-foreground"> · </span>
            Critical {diff.categoryWeights.before.critical}% →{" "}
            {diff.categoryWeights.after.critical}%
          </p>
        </DiffSection>
      )}
      {diff.added.length > 0 && (
        <DiffSection title={`Ditambah (${diff.added.length})`}>
          <ul className="space-y-1">
            {diff.added.map((item) => (
              <li key={item.id} className="text-sm text-foreground">
                {item.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {CAT_LABEL[item.category]} · {pct(item.bobot)}
                </span>
              </li>
            ))}
          </ul>
        </DiffSection>
      )}
      {diff.removed.length > 0 && (
        <DiffSection title={`Dihapus (${diff.removed.length})`}>
          <ul className="space-y-1">
            {diff.removed.map((item) => (
              <li key={item.id} className="text-sm text-foreground">
                {item.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {CAT_LABEL[item.category]} · {pct(item.bobot)}
                </span>
              </li>
            ))}
          </ul>
        </DiffSection>
      )}
      {diff.changed.length > 0 && (
        <DiffSection title={`Diubah (${diff.changed.length})`}>
          <ul className="space-y-1.5">
            {diff.changed.map(({ before, after, fields }) => (
              <li key={after.id} className="text-sm text-foreground">
                {after.name}
                <span className="block text-[12px] text-muted-foreground">
                  {fields
                    .map(
                      (field) =>
                        `${FIELD_LABEL[field]} ${fieldValue(before, field)} → ${fieldValue(after, field)}`,
                    )
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </DiffSection>
      )}
    </div>
  );
}

export function PublishRuleDialog(props: PublishRuleDialogProps) {
  const {
    open,
    version,
    baseline,
    periods,
    draftIndicators,
    periodId,
    onPeriodChange,
    reason,
    onReasonChange,
    confirmed,
    onConfirmedChange,
    publishing,
    previewVersionNumber,
    onPublish,
    onClose,
  } = props;

  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => b.year - a.year || b.month - a.month),
    [periods],
  );
  const periodItems = sortedPeriods.map((p) => ({
    value: p.id,
    label: periodLabel(p),
  }));
  const isSlik = version.service_type === "slik";
  const invalidSlikWeights =
    isSlik && !hasValidWeightedCategoryTotals(draftIndicators);
  const totals = getIndicatorCategoryTotals(draftIndicators);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !publishing) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-4 pt-4 pr-12">
          <DialogTitle>Publish versi</DialogTitle>
          <DialogDescription>
            Publish mengubah skor semua agen mulai periode efektif. Versi yang
            sudah dipublish tidak dapat diubah.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
          <p className="text-sm text-foreground">
            {SERVICE_LABELS[version.service_type]} · terbit sebagai{" "}
            <span className="font-semibold">v{previewVersionNumber}</span> · Mode{" "}
            {SCORING_MODE_LABEL[version.scoring_mode]}
            <span className="text-muted-foreground">
              {" "}
              · {draftIndicators.length} parameter
            </span>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="publish-period" className="text-sm">
              Periode efektif
            </Label>
            <Select
              items={periodItems}
              value={periodId || null}
              onValueChange={(value) => {
                if (value !== null) onPeriodChange(value);
              }}
            >
              <SelectTrigger
                id="publish-period"
                aria-label="Periode efektif"
                className="!h-[44px] w-full min-w-0 bg-background px-3 text-sm"
              >
                <SelectValue placeholder="Pilih periode" />
              </SelectTrigger>
              <SelectContent align="start">
                {periodItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <section aria-labelledby="publish-changes" className="space-y-2">
            <h3
              id="publish-changes"
              className="text-sm font-semibold text-foreground"
            >
              {baseline
                ? `Perubahan dari versi berlaku (v${baseline.version_number})`
                : "Perubahan"}
            </h3>
            <ChangeSummary
              version={version}
              baseline={baseline}
              draftIndicators={draftIndicators}
            />
          </section>

          {invalidSlikWeights && (
            <Alert variant="destructive">
              <AlertDescription>
                Total bobot per kategori harus tepat 100% sebelum dipublish.
                Non-critical {Math.round(totals.nonCritical * 100)}% · Critical{" "}
                {Math.round(totals.critical * 100)}%
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="publish-reason" className="text-sm">
              Alasan perubahan (opsional)
            </Label>
            <Textarea
              id="publish-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Jelaskan mengapa parameter ini diubah"
              className="min-h-20"
            />
          </div>

          <Label
            htmlFor="publish-confirm"
            className="min-h-[44px] cursor-pointer items-start gap-3 text-sm leading-snug"
          >
            <input
              id="publish-confirm"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => onConfirmedChange(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            Saya telah meninjau perubahan di atas dan memahami versi ini tidak
            dapat diubah setelah dipublish.
          </Label>
        </div>

        <DialogFooter className="mx-0 mb-0">
          <Button
            type="button"
            variant="outline"
            className="h-[44px] px-4"
            disabled={publishing}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="h-[44px] px-4"
            disabled={
              publishing || !confirmed || !periodId || invalidSlikWeights
            }
            onClick={onPublish}
          >
            {publishing ? "Mempublish…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
