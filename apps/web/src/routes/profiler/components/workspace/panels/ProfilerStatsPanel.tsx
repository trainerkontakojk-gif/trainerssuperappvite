import { useMemo, useState, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

const COLORS = [
  "var(--chart-blue)",
  "var(--chart-green)",
  "var(--chart-amber)",
  "var(--chart-orange)",
  "var(--chart-violet)",
  "var(--chart-cyan)",
  "var(--chart-red)",
];

const UNKNOWN = "Tidak Diketahui";

const jabatanOf = (p: ProfilerPeserta) =>
  labelJabatan[p.jabatan || ""] || p.jabatan || UNKNOWN;

/** Teks legenda memakai token netral; ikon tetap berwarna irisan. */
const legendText = (value: string) => (
  <span style={{ color: "var(--muted-foreground)" }}>{value}</span>
);

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const color = item.payload?.fill || item.color || item.fill;
  const name = item.payload?.name || label || item.name || "Data";
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="flex min-w-36 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium">{name}</span>
        <span className="ml-auto pl-2 tabular-nums text-muted-foreground">
          {item.value} peserta
        </span>
      </div>
    </div>
  );
};

type Segment = { name: string; value: number; fill: string };

function ChartSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-outfit text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 h-72">{children}</div>
    </section>
  );
}

interface ProfilerStatsPanelProps {
  peserta: ProfilerPeserta[];
}

/** Distribusi jabatan, tim, gender, dan pendidikan untuk satu batch. */
export default function ProfilerStatsPanel({
  peserta,
}: ProfilerStatsPanelProps) {
  const [modalData, setModalData] = useState<{
    title: string;
    participants: ProfilerPeserta[];
  } | null>(null);

  const stats = useMemo(() => {
    if (!peserta.length) return null;
    const counts = {
      jabatan: {} as Record<string, number>,
      gender: {} as Record<string, number>,
      pendidikan: {} as Record<string, number>,
      tim: {} as Record<string, number>,
    };
    for (const p of peserta) {
      const jabatan = jabatanOf(p);
      const gender = p.jenis_kelamin || UNKNOWN;
      const pendidikan = p.pendidikan || UNKNOWN;
      const tim = p.tim || UNKNOWN;
      counts.jabatan[jabatan] = (counts.jabatan[jabatan] || 0) + 1;
      counts.gender[gender] = (counts.gender[gender] || 0) + 1;
      counts.pendidikan[pendidikan] = (counts.pendidikan[pendidikan] || 0) + 1;
      counts.tim[tim] = (counts.tim[tim] || 0) + 1;
    }
    const formatData = (data: Record<string, number>, offset = 0): Segment[] =>
      Object.entries(data)
        .map(([name, value], index) => ({
          name,
          value,
          fill: COLORS[(index + offset) % COLORS.length],
        }))
        .sort((a, b) => b.value - a.value);
    return {
      jabatan: formatData(counts.jabatan),
      gender: Object.entries(counts.gender)
        .map(([name, value]) => ({
          name,
          value,
          fill:
            name === "Laki-laki"
              ? "var(--chart-blue)"
              : name === "Perempuan"
                ? "var(--chart-orange)"
                : "var(--chart-amber)",
        }))
        .sort((a, b) => b.value - a.value),
      pendidikan: formatData(counts.pendidikan, 5),
      tim: formatData(counts.tim, 3),
    };
  }, [peserta]);

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
            Statistik muncul setelah batch ini memiliki peserta.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        {stats.tim.length} tim · {stats.jabatan.length} jabatan ·{" "}
        {stats.pendidikan.length} tingkat pendidikan. Klik grafik untuk melihat
        pesertanya.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSection
          title="Distribusi jabatan"
          hint="Jumlah peserta per jabatan."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stats.jabatan}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="var(--border)"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "var(--muted-foreground)" }}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={100}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data) =>
                  showParticipants(
                    "Jabatan",
                    data.name || "",
                    (p) => jabatanOf(p) === (data.name || ""),
                  )
                }
              >
                {stats.jabatan.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection title="Distribusi tim" hint="Porsi peserta per tim.">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.tim}
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                cursor="pointer"
                onClick={(data) =>
                  showParticipants(
                    "Tim",
                    data.name || "",
                    (p) => (p.tim || UNKNOWN) === (data.name || ""),
                  )
                }
              >
                {stats.tim.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={32}
                iconType="circle"
                formatter={legendText}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection
          title="Distribusi gender"
          hint="Porsi peserta per gender."
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.gender}
                cx="50%"
                cy="45%"
                outerRadius={90}
                dataKey="value"
                label={({ name, percent, x, y, textAnchor }) => (
                  <text
                    x={x}
                    y={y}
                    textAnchor={textAnchor}
                    dominantBaseline="central"
                    fill="var(--muted-foreground)"
                  >
                    {`${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  </text>
                )}
                cursor="pointer"
                onClick={(data) =>
                  showParticipants(
                    "Gender",
                    data.name || "",
                    (p) => (p.jenis_kelamin || UNKNOWN) === (data.name || ""),
                  )
                }
              >
                {stats.gender.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={32}
                iconType="circle"
                formatter={legendText}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection
          title="Tingkat pendidikan"
          hint="Jumlah peserta per jenjang."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stats.pendidikan}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)" }} />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--muted-foreground)" }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data) =>
                  showParticipants(
                    "Pendidikan",
                    data.name || "",
                    (p) => (p.pendidikan || UNKNOWN) === (data.name || ""),
                  )
                }
              >
                {stats.pendidikan.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>
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
                      <div className="mt-1 flex min-w-0 gap-2">
                        <Badge
                          variant="secondary"
                          className="max-w-[45%] truncate"
                        >
                          {participant.tim || "Tanpa tim"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="max-w-[50%] truncate"
                        >
                          {labelJabatan[participant.jabatan || ""] ||
                            participant.jabatan ||
                            "Tanpa jabatan"}
                        </Badge>
                      </div>
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
