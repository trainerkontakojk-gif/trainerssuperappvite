import type { ReactNode } from "react";
import type { TnaPeriodMetrics } from "@trainers/types";
import { number, type useTnaMutation } from "./utils";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Button } from "../../components/ui/button";

export function Surface({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-8 break-words p-4 pb-28 sm:p-6 lg:p-8">
      <header>
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </header>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}
export function State({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => unknown;
}) {
  if (loading) return <QaStatePanel type="loading" title="Memuat data TNA…" />;
  if (error)
    return (
      <QaStatePanel
        type="error"
        title={error}
        action={
          <Button variant="outline" onClick={retry}>
            Coba lagi
          </Button>
        }
      />
    );
  return null;
}
export function Metrics({ metrics: m }: { metrics: TnaPeriodMetrics }) {
  if (m.auditStatus === "no_audit")
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada audit pada periode ini. Tingkat dan sebaran belum tersedia.
      </p>
    );
  return (
    <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">Tingkat ketidaksesuaian</dt>
        <dd className="mt-1 font-semibold tabular-nums">
          {number(m.ratePer100)} per 100 sesi sampel
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Sebaran agent</dt>
        <dd className="mt-1 font-semibold tabular-nums">
          {number(m.spreadPct)}% ({m.affectedAgents} dari {m.auditedAgents}{" "}
          diaudit)
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Temuan / sesi sampel</dt>
        <dd className="mt-1 font-semibold tabular-nums">
          {m.findings} / {m.sampledSessions}
        </dd>
      </div>
    </dl>
  );
}
export function MutationState({
  mutation,
  reload,
}: {
  mutation: ReturnType<typeof useTnaMutation>;
  reload: () => unknown;
}) {
  return (
    <>
      {mutation.error && (
        <QaStatePanel
          type="error"
          title={mutation.error}
          action={
            mutation.conflict ? (
              <Button variant="outline" onClick={reload}>
                Muat ulang
              </Button>
            ) : undefined
          }
        />
      )}
      {mutation.success && (
        <p role="status" className="text-sm text-muted-foreground">
          {mutation.success}
        </p>
      )}
    </>
  );
}
