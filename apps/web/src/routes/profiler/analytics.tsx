import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Briefcase,
  GraduationCap,
  PieChart as PieChartIcon,
  Users,
  X,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerPeserta,
  ProfilerYear,
  ProfilerFolder,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { ProfilerPageHeader } from "./components/ProfilerPageHeader";
import { ProfilerFolderSelect } from "./components/ProfilerFolderSelect";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { Alert, AlertDescription } from "../../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

const COLORS = [
  "var(--chart-blue)",
  "var(--chart-green)",
  "var(--chart-amber)",
  "var(--chart-orange)",
  "var(--chart-violet)",
  "var(--chart-cyan)",
  "var(--chart-red)",
];

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

export default function ProfilerAnalytics() {
  const navigate = useNavigate();
  const { batch } = useQueryParams();
  const selectedBatch = batch || "";
  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [years, setYears] = useState<ProfilerYear[]>([]);
  const [folders, setFolders] = useState<ProfilerFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalData, setModalData] = useState<{
    title: string;
    participants: ProfilerPeserta[];
  } | null>(null);
  const { isReadOnly } = useProfilerAccess();

  useEffect(() => {
    Promise.all([profilerApi.getYears(), profilerApi.getFolders()])
      .then(([nextYears, nextFolders]) => {
        setYears(nextYears);
        setFolders(nextFolders);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedBatch) {
      setPeserta([]);
      setLoading(false);
      return;
    }
    if (folders.length > 0) {
      const folderNames = new Set(folders.map((folder) => folder.name));
      if (!folderNames.has(selectedBatch)) {
        const firstFolder = folders[0];
        if (firstFolder?.name) {
          navigate({
            to: "/profiler/analytics",
            search: { batch: firstFolder.name },
            replace: true,
          });
        } else {
          navigate({ to: "/profiler", replace: true });
        }
        return;
      }
    }
    setLoading(true);
    profilerApi
      .getPesertaByBatch(selectedBatch)
      .then(setPeserta)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedBatch, folders, navigate]);

  const stats = useMemo(() => {
    if (!peserta.length) return null;
    const counts = {
      jabatan: {} as Record<string, number>,
      gender: {} as Record<string, number>,
      pendidikan: {} as Record<string, number>,
      tim: {} as Record<string, number>,
    };
    peserta.forEach((p) => {
      const jabatan =
        labelJabatan[p.jabatan || ""] || p.jabatan || "Tidak Diketahui";
      const gender = p.jenis_kelamin || "Tidak Diketahui";
      const pendidikan = p.pendidikan || "Tidak Diketahui";
      const tim = p.tim || "Tidak Diketahui";
      counts.jabatan[jabatan] = (counts.jabatan[jabatan] || 0) + 1;
      counts.gender[gender] = (counts.gender[gender] || 0) + 1;
      counts.pendidikan[pendidikan] = (counts.pendidikan[pendidikan] || 0) + 1;
      counts.tim[tim] = (counts.tim[tim] || 0) + 1;
    });
    const formatData = (data: Record<string, number>, offset = 0) =>
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
      total: peserta.length,
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

  const chartCard = (
    title: string,
    description: string,
    children: React.ReactNode,
  ) => (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-80">{children}</CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProfilerPageHeader
        backHref={`/profiler?batch=${encodeURIComponent(selectedBatch)}`}
        backLabel="Kembali ke workspace KTP"
        eyebrow="Profiler analytics"
        title="Baca komposisi batch dengan cepat."
        description="Distribusi tim, jabatan, gender, dan pendidikan disajikan dalam kartu yang mudah dipindai."
        icon={<BarChart3 className="size-3.5" aria-hidden="true" />}
        actions={
          <ProfilerFolderSelect
            years={years}
            folders={folders}
            value={selectedBatch}
            label="Filter folder"
            className="w-full sm:w-64"
            onChange={(nextBatch) =>
              navigate({
                to: "/profiler/analytics",
                search: { batch: nextBatch },
              })
            }
          />
        }
      />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card size="sm" className="shadow-none">
              <CardContent className="grid gap-1 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Batch aktif
                </p>
                <p className="truncate font-semibold">
                  {selectedBatch || "Belum dipilih"}
                </p>
              </CardContent>
            </Card>
            <Card size="sm" className="shadow-none">
              <CardContent className="grid gap-1 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Total peserta
                </p>
                <p className="font-semibold tabular-nums">
                  {peserta.length} orang
                </p>
              </CardContent>
            </Card>
            <Card size="sm" className="shadow-none">
              <CardContent className="grid gap-1 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Mode akses
                </p>
                <p className="font-semibold">
                  {isReadOnly ? "Read only leader" : "Interactive analytics"}
                </p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-96 rounded-xl" />
              ))}
            </div>
          ) : !stats ? (
            <Card className="shadow-none">
              <Empty className="border-0 py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3 aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Belum ada data peserta</EmptyTitle>
                  <EmptyDescription>
                    Tidak ada data peserta untuk folder ini.
                  </EmptyDescription>
                </EmptyHeader>
                {!isReadOnly ? (
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11"
                    onClick={() =>
                      navigate({
                        to: "/profiler/add",
                        search: { batch: selectedBatch },
                      })
                    }
                  >
                    Tambah peserta pertama
                  </Button>
                ) : null}
              </Empty>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Total peserta", value: stats.total, icon: Users },
                  {
                    label: "Total jabatan",
                    value: stats.jabatan.length,
                    icon: Briefcase,
                  },
                  {
                    label: "Total pendidikan",
                    value: stats.pendidikan.length,
                    icon: GraduationCap,
                  },
                  {
                    label: "Total tim",
                    value: stats.tim.length,
                    icon: PieChartIcon,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Card key={item.label} size="sm" className="shadow-none">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Icon aria-hidden="true" className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {item.label}
                          </p>
                          <p className="text-2xl font-semibold tabular-nums">
                            {item.value}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {chartCard(
                  "Distribusi jabatan",
                  "Klik batang untuk melihat peserta.",
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
                      <XAxis type="number" />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={100}
                        tick={{ fontSize: 12 }}
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
                            (p) =>
                              (labelJabatan[p.jabatan || ""] ||
                                p.jabatan ||
                                "Tidak Diketahui") === (data.name || ""),
                          )
                        }
                      >
                        {stats.jabatan.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>,
                )}
                {chartCard(
                  "Distribusi tim",
                  "Klik potongan untuk melihat peserta.",
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.tim}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        cursor="pointer"
                        onClick={(data) =>
                          showParticipants(
                            "Tim",
                            data.name || "",
                            (p) =>
                              (p.tim || "Tidak Diketahui") ===
                              (data.name || ""),
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
                      />
                    </PieChart>
                  </ResponsiveContainer>,
                )}
                {chartCard(
                  "Distribusi gender",
                  "Klik potongan untuk melihat peserta.",
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.gender}
                        cx="50%"
                        cy="45%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${((percent || 0) * 100).toFixed(0)}%`
                        }
                        cursor="pointer"
                        onClick={(data) =>
                          showParticipants(
                            "Gender",
                            data.name || "",
                            (p) =>
                              (p.jenis_kelamin || "Tidak Diketahui") ===
                              (data.name || ""),
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
                      />
                    </PieChart>
                  </ResponsiveContainer>,
                )}
                {chartCard(
                  "Tingkat pendidikan",
                  "Klik batang untuk melihat peserta.",
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
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar
                        dataKey="value"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(data) =>
                          showParticipants(
                            "Pendidikan",
                            data.name || "",
                            (p) =>
                              (p.pendidikan || "Tidak Diketahui") ===
                              (data.name || ""),
                          )
                        }
                      >
                        {stats.pendidikan.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>,
                )}
              </div>
            </>
          )}
        </div>
      </main>

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
              <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
                {modalData.participants.length > 0 ? (
                  <div className="grid gap-2">
                    {modalData.participants.map((participant, index) => (
                      <div
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
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <X aria-hidden="true" />
                    <AlertDescription>Tidak ada data peserta.</AlertDescription>
                  </Alert>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
