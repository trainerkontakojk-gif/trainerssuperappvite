import { useId, type ReactNode } from "react";
import { formatScoreValue } from "../../utils/formatting";

/** Kartu berjudul; judulnya juga nama region untuk pembaca layar. */
export function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        {aside ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {aside}
          </span>
        ) : null}
      </header>
      <div className="flex flex-col gap-4 px-4 py-3">{children}</div>
    </section>
  );
}

/** Skor panel di kepala kartu, mis. "82 / 100". */
export function PanelScore({
  score,
  scale,
}: {
  score: number | null | undefined;
  scale: 10 | 100;
}) {
  if (typeof score !== "number") return null;
  return (
    <>
      <b className="font-semibold text-foreground">{formatScoreValue(score)}</b>{" "}
      / {scale}
    </>
  );
}

export function KeyValueList({
  rows,
}: {
  rows: Array<[string, ReactNode | null | undefined]>;
}) {
  return (
    <dl className="divide-y divide-border/60 text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(7rem,2fr)_3fr] gap-3 py-2 first:pt-0 last:pb-0"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words font-medium text-foreground">
            {value ?? (
              <span className="font-normal text-muted-foreground">-</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface ScoreRow {
  label: string;
  value: number | null;
  note?: string | null;
  /** Penjelasan tambahan di bawah baris, mis. tip perbaikan. */
  detail?: string | null;
}

/** Skor per aspek: label, batang tipis, dan angka rata kanan. */
export function ScoreRows({
  rows,
  scale,
}: {
  rows: ScoreRow[];
  scale: 10 | 100;
}) {
  return (
    <ul
      aria-label="Skor per aspek"
      className="divide-y divide-border/60 text-sm"
    >
      {rows.map((row) => {
        const width =
          row.value === null
            ? 0
            : Math.max(0, Math.min(100, (row.value / scale) * 100));
        return (
          <li key={row.label} className="py-2 first:pt-0 last:pb-0">
            <div className="grid grid-cols-[minmax(0,1fr)_6rem_3rem] items-center gap-3">
              <span className="min-w-0 text-foreground">
                {row.label}
                {row.note ? (
                  <span className="text-muted-foreground"> · {row.note}</span>
                ) : null}
              </span>
              <span
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-foreground/70"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums text-foreground">
                {row.value === null ? (
                  <span className="font-normal text-muted-foreground">-</span>
                ) : (
                  formatScoreValue(row.value)
                )}
              </span>
            </div>
            {row.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TextBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="text-sm">
      <h3 className="font-medium text-muted-foreground">{title}</h3>
      <div className="mt-0.5 text-foreground">{children}</div>
    </div>
  );
}

export function BulletList({
  items,
  ordered = false,
}: {
  items: readonly string[];
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <List
      className={`${ordered ? "list-decimal" : "list-disc"} flex flex-col gap-0.5 pl-5`}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </List>
  );
}

/** Kekuatan dan kelemahan berdampingan bila keduanya ada. */
export function StrengthsWeaknesses({
  strengths,
  weaknesses,
}: {
  strengths: readonly string[] | null | undefined;
  weaknesses: readonly string[] | null | undefined;
}) {
  if (!strengths?.length && !weaknesses?.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {strengths?.length ? (
        <TextBlock title="Kekuatan">
          <BulletList items={strengths} />
        </TextBlock>
      ) : null}
      {weaknesses?.length ? (
        <TextBlock title="Perlu diperbaiki">
          <BulletList items={weaknesses} />
        </TextBlock>
      ) : null}
    </div>
  );
}

/** Satu baris transkrip: pembicara, isi, dan waktu. */
export function TranscriptLine({
  speaker,
  time,
  children,
}: {
  speaker: "agent" | "consumer";
  time: string | null;
  children: ReactNode;
}) {
  const agent = speaker === "agent";
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-3 py-2.5 text-sm first:pt-1 last:pb-1">
      <span
        className={
          agent ? "font-semibold text-foreground" : "text-muted-foreground"
        }
      >
        {agent ? "Agen" : "Konsumen"}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-foreground">
        {children}
      </span>
      <span className="text-muted-foreground tabular-nums">{time ?? ""}</span>
    </li>
  );
}

export function TranscriptList({ children }: { children: ReactNode }) {
  return <ol className="divide-y divide-border/60">{children}</ol>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
