import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const UNKNOWN = "Tidak diketahui";

const jabatanOf = (p: ProfilerPeserta) =>
  labelJabatan[p.jabatan || ""] || p.jabatan || UNKNOWN;

type Row = { name: string; value: number };

type Dimension = {
  key: "jabatan" | "tim" | "gender" | "pendidikan";
  title: string;
  hint: string;
  category: string;
  valueOf: (p: ProfilerPeserta) => string;
  /** Urutan tetap (mis. jenjang pendidikan); lainnya diurutkan menurut jumlah. */
  order?: string[];
};

const DIMENSIONS: Dimension[] = [
  {
    key: "jabatan",
    title: "Distribusi jabatan",
    hint: "Jumlah peserta per jabatan.",
    category: "Jabatan",
    valueOf: jabatanOf,
  },
  {
    key: "tim",
    title: "Distribusi tim",
    hint: "Jumlah peserta per tim.",
    category: "Tim",
    valueOf: (p) => p.tim || UNKNOWN,
  },
  {
    key: "gender",
    title: "Distribusi gender",
    hint: "Jumlah peserta per jenis kelamin.",
    category: "Gender",
    valueOf: (p) => p.jenis_kelamin || UNKNOWN,
  },
  {
    key: "pendidikan",
    title: "Tingkat pendidikan",
    hint: "Jumlah peserta per jenjang.",
    category: "Pendidikan",
    valueOf: (p) => p.pendidikan || UNKNOWN,
    order: ["SMA", "D3", "S1", "S2", "S3"],
  },
];

function countRows(peserta: ProfilerPeserta[], dimension: Dimension): Row[] {
  const counts = new Map<string, number>();
  for (const p of peserta) {
    const name = dimension.valueOf(p);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const rows = [...counts].map(([name, value]) => ({ name, value }));
  const { order } = dimension;
  if (!order) return rows.sort((a, b) => b.value - a.value);
  const rank = (name: string) => {
    const index = order.indexOf(name);
    return index === -1 ? order.length : index;
  };
  return rows.sort((a, b) => rank(a.name) - rank(b.name));
}

/** Batang mendatar berlabel angka; setiap batang membuka daftar pesertanya. */
function BarList({
  title,
  hint,
  rows,
  total,
  onSelect,
}: {
  title: string;
  hint: string;
  rows: Row[];
  total: number;
  onSelect: (name: string) => void;
}) {
  const max = Math.max(...rows.map((row) => row.value));
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const percent = Math.round((row.value / total) * 100);
          return (
            <li key={row.name}>
              <button
                type="button"
                onClick={() => onSelect(row.name)}
                aria-label={`${row.name}: ${row.value} peserta (${percent}%). Lihat pesertanya`}
                className="grid min-h-11 w-full grid-cols-[minmax(0,8rem)_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-md px-1 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate text-foreground">{row.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-foreground/80"
                    style={{ width: `${(row.value / max) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">
                  <span className="font-medium text-foreground">
                    {row.value}
                  </span>
                  <span className="text-muted-foreground"> · {percent}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface ProfilerStatsPanelProps {
  peserta: ProfilerPeserta[];
}

/** Distribusi jabatan, tim, gender, dan pendidikan untuk satu folder. */
export default function ProfilerStatsPanel({
  peserta,
}: ProfilerStatsPanelProps) {
  const [modalData, setModalData] = useState<{
    title: string;
    participants: ProfilerPeserta[];
  } | null>(null);

  const stats = useMemo(
    () =>
      peserta.length
        ? DIMENSIONS.map((dimension) => ({
            dimension,
            rows: countRows(peserta, dimension),
          }))
        : null,
    [peserta],
  );
  const countOf = (key: Dimension["key"]) =>
    stats?.find((item) => item.dimension.key === key)?.rows.length ?? 0;

  const showParticipants = (
    category: string,
    value: string,
    filter: (participant: ProfilerPeserta) => boolean,
  ) => {
    setModalData({
      title: `${category}: ${value}`,
      participants: peserta.filter(filter),
    });
  };

  if (!stats) {
    return (
      <Empty className="min-h-56 border border-dashed border-border p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3 aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Belum ada data peserta</EmptyTitle>
          <EmptyDescription>
            Statistik muncul setelah folder ini memiliki peserta.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        {countOf("tim")} tim · {countOf("jabatan")} jabatan ·{" "}
        {countOf("pendidikan")} tingkat pendidikan. Klik batang untuk melihat
        pesertanya.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map(({ dimension, rows }) => (
          <BarList
            key={dimension.key}
            title={dimension.title}
            hint={dimension.hint}
            rows={rows}
            total={peserta.length}
            onSelect={(name) =>
              showParticipants(
                dimension.category,
                name,
                (p) => dimension.valueOf(p) === name,
              )
            }
          />
        ))}
      </div>

      <Dialog
        open={Boolean(modalData)}
        onOpenChange={(open) => !open && setModalData(null)}
      >
        <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden p-0">
          {modalData ? (
            <>
              <DialogHeader className="border-b border-border px-5 py-5 pr-12 sm:px-6">
                <DialogTitle>{modalData.title}</DialogTitle>
                <DialogDescription>
                  {modalData.participants.length} peserta
                </DialogDescription>
              </DialogHeader>
              <ul className="grid min-h-0 gap-2 overflow-y-auto p-4 sm:p-5">
                {modalData.participants.map((participant, index) => (
                  <li
                    key={participant.id || index}
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Avatar>
                      <AvatarImage
                        src={participant.foto_url || undefined}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                      <AvatarFallback>
                        {participant.nama?.charAt(0)?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {participant.nama || "Tanpa nama"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[participant.tim, jabatanOf(participant)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
