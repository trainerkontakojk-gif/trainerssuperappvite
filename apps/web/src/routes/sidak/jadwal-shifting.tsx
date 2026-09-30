import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import type {
  JadwalShiftingMonthResponse,
  JadwalShiftingResponse,
  JadwalShiftingRow,
} from "@trainers/types";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { MonthMatrix } from "../../components/sidak/jadwal-shifting/MonthMatrix";
import { SectionFilter } from "../../components/sidak/jadwal-shifting/SectionFilter";
import {
  calendarSectionOptions,
  matchesSection,
  monthLabel,
  normalizeChannelSlug,
  normalizeSectionSlug,
  breakStartMinutes,
  LONG_BREAK_CODE,
  orderScheduleRows,
  sectionFromSlug,
  shiftMonth,
  todaySectionOptions,
} from "../../components/sidak/jadwal-shifting/schedule-sections";

/**
 * `/sidak/jadwal-shifting` — tampilan read-only jadwal shifting WFM Dash Pro
 * dalam DUA format:
 *
 *   1. **Hari ini** — satu tabel detail jadwal untuk tanggal terpilih, dengan
 *      pilihan bagian layanan (Semua, Call, Digital Chat, Email, Leader).
 *   2. **Kalender** — satu bulan penuh untuk empat bagian itu, lengkap dengan
 *      hitungan masuk/libur per tanggal dan detail nama pada tanggal terpilih.
 *
 * Batas yang halaman ini pegang:
 *   - Read-only. Tidak ada POST/PUT/DELETE, tidak ada sinkron ke database
 *     Trainers, tidak ada pemanggilan AI.
 *   - Tidak pernah menyentuh WFM/GAS langsung. Satu-satunya panggilan keluar
 *     adalah `sidakClient["jadwal-shifting"]` dan
 *     `sidakClient["jadwal-shifting/month"]`, dan `apiKey`/`apiUrl`/credential
 *     WFM tidak pernah masuk ke browser.
 *   - Kegagalan upstream ditampilkan sebagai state gagal. Halaman ini tidak
 *     pernah mengubahnya menjadi "tidak ada jadwal".
 *   - Zona waktu TIDAK dihitung di sini. Tanggal, bulan, dan rentang yang
 *     ditampilkan selalu datang dari backend (`data.date`, `data.month`,
 *     `data.from`, `data.to`), jadi UI tidak pernah mengarang "hari ini" yang
 *     beda dari sumber.
 *   - Filter bagian murni di klien: data sudah diambil untuk seluruh bagian,
 *     jadi mengganti bagian tidak memicu pembacaan baru ke upstream.
 */

type JadwalSearch = {
  date?: string;
  view?: "today" | "calendar";
  channel?: string;
  month?: string;
  section?: string;
};

type View = "today" | "calendar";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `HH:mm` atau `H:mm`; dipakai untuk mendeteksi shift yang melewati tengah malam. */
const CLOCK = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

function toMinutes(hour: string, minute: string): number {
  return Number(hour) * 60 + Number(minute);
}

/**
 * Benar hanya kalau label shift memuat minimal dua jam dan jam akhir tidak
 * lebih besar dari jam awal. Kalau tidak bisa diurai, JAWABANNYA "tidak" —
 * lebih baik tidak menandai daripada salah menandai shift.
 */
function shiftSpansMidnight(shift: string): boolean {
  const matches = [...shift.matchAll(CLOCK)];
  if (matches.length < 2) return false;
  const first = matches[0];
  const last = matches[matches.length - 1];
  if (!first || !last) return false;
  const start = toMinutes(first[1]!, first[2]!);
  const end = toMinutes(last[1]!, last[2]!);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return end <= start;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "ready"; data: JadwalShiftingResponse };

type MonthState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "ready"; data: JadwalShiftingMonthResponse };

/**
 * Kode error backend → kalimat yang bisa ditindaklanjuti. `WFM_NOT_CONFIGURED`
 * dipisah karena itu satu-satunya kondisi yang tidak bisa diperbaiki dengan
 * menekan "Coba lagi".
 */
function describeError(code: string, serverMessage: string): string {
  switch (code) {
    case "WFM_NOT_CONFIGURED":
      return "Integrasi jadwal belum dikonfigurasi di server. Hubungi administrator Trainers SuperApp.";
    case "WFM_UNAUTHORIZED":
      return "Server tidak diizinkan membaca jadwal dari sumber WFM. Hubungi administrator Trainers SuperApp.";
    case "WFM_INVALID_RESPONSE":
      return "Sumber jadwal WFM membalas data yang tidak bisa dibaca. Silakan coba lagi.";
    case "WFM_UNAVAILABLE":
      return "Sumber jadwal WFM sedang tidak dapat dihubungi. Silakan coba lagi.";
    case "VALIDATION_ERROR":
      return serverMessage;
    default:
      return (
        serverMessage ||
        "Jadwal shifting tidak dapat ditampilkan. Silakan coba lagi."
      );
  }
}

function formatAsOf(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

const SHIFT_TIME_BY_CODE: Record<string, { start: string; end: string }> = {
  H: { start: "07:45", end: "16:50" },
  S1: { start: "06:00", end: "15:00" },
  S2: { start: "08:00", end: "17:00" },
  S3: { start: "13:00", end: "22:00" },
  S4: { start: "22:00", end: "07:00" },
};

function formatIntervalTime(totalMinutes: number): string {
  if (totalMinutes === 24 * 60) return "24:00";
  const minutesInDay = totalMinutes % (24 * 60);
  const hours = String(Math.floor(minutesInDay / 60)).padStart(2, "0");
  const minutes = String(minutesInDay % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** WFM stores each activity slot as 15 minutes; LB is Long Break. */
function longBreakIntervals(
  activities: JadwalShiftingRow["activities"],
): string[] {
  const slots = [
    ...new Set(
      activities
        .filter(
          (activity) =>
            activity.value.trim().toUpperCase() === LONG_BREAK_CODE &&
            Number.isSafeInteger(activity.slot) &&
            activity.slot >= 0 &&
            activity.slot < 96,
        )
        .map((activity) => activity.slot),
    ),
  ].sort((a, b) => a - b);

  if (slots.length === 0) return [];

  const ranges: string[] = [];
  let startSlot = slots[0]!;
  let previousSlot = startSlot;

  const flushRange = () => {
    ranges.push(
      `${formatIntervalTime(startSlot * 15)}–${formatIntervalTime((previousSlot + 1) * 15)}`,
    );
  };

  for (const slot of slots.slice(1)) {
    if (slot === previousSlot + 1) {
      previousSlot = slot;
      continue;
    }
    flushRange();
    startSlot = slot;
    previousSlot = slot;
  }
  flushRange();
  return ranges;
}

function WorkTimeSummary({ row }: { row: JadwalShiftingRow }) {
  const shiftTimes = SHIFT_TIME_BY_CODE[row.shift.trim()];
  if (!shiftTimes) {
    return (
      <span
        className="text-muted-foreground"
        aria-label="Waktu kerja dan istirahat tidak tersedia"
      >
        &mdash;
      </span>
    );
  }

  const breaks = longBreakIntervals(row.activities);
  return (
    <dl
      className="flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed"
      aria-label={`Jam kerja shift ${row.shift}`}
    >
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Mulai</dt>
        <dd className="tabular-nums text-foreground">{shiftTimes.start}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Istirahat</dt>
        <dd
          className="tabular-nums text-foreground"
          aria-label={
            breaks.length
              ? `Interval istirahat ${breaks.join(", ")}`
              : "Interval istirahat tidak tersedia"
          }
        >
          {breaks.length ? breaks.join(", ") : "—"}
        </dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Pulang</dt>
        <dd className="tabular-nums text-foreground">{shiftTimes.end}</dd>
      </div>
    </dl>
  );
}

export default function SidakJadwalShiftingPage() {
  const search = useSearch({ strict: false }) as JadwalSearch;
  const navigate = useNavigate();

  const view: View = search.view === "calendar" ? "calendar" : "today";
  const channelSlug = normalizeChannelSlug(search.channel);
  const sectionSlug = normalizeSectionSlug(search.section);
  const monthParam = search.month ?? "";
  const urlDate = search.date && ISO_DATE.test(search.date) ? search.date : "";

  const [draftDate, setDraftDate] = useState(urlDate);
  const [dayState, setDayState] = useState<LoadState>({ kind: "loading" });
  const [monthState, setMonthState] = useState<MonthState>({ kind: "idle" });
  /** Pencarian nama agen — murni klien, tidak memicu bacaan baru. */
  const [agentQuery, setAgentQuery] = useState("");

  // `requestSeq` mencegah respons lambat menimpa permintaan yang lebih baru —
  // pola yang sama dengan `useApi`, ditulis lokal supaya kontrak tetap typed.
  const daySeq = useRef(0);
  const monthSeq = useRef(0);

  const loadDay = useCallback(async (date: string, signal?: AbortSignal) => {
    const seq = ++daySeq.current;
    setDayState({ kind: "loading" });
    try {
      const data = await unwrapResponse(
        await sidakClient["jadwal-shifting"].$get({
          ...(date ? { query: { date } } : {}),
          ...(signal ? { signal } : {}),
        }),
      );
      if (seq === daySeq.current) setDayState({ kind: "ready", data });
    } catch (error) {
      if (seq !== daySeq.current) return;
      // Dibatalkan karena tampilan/parameter berpindah: itu bukan kegagalan,
      // jadi tidak boleh mengubah layar menjadi state error.
      if (signal?.aborted) return;
      const err = error as { code?: string; message?: string };
      const code = err?.code ?? "WFM_UNAVAILABLE";
      setDayState({
        kind: "error",
        code,
        message: describeError(code, err?.message ?? ""),
      });
    }
  }, []);

  const loadMonth = useCallback(async (month: string, signal?: AbortSignal) => {
    const seq = ++monthSeq.current;
    setMonthState({ kind: "loading" });
    try {
      const data = await unwrapResponse(
        await sidakClient["jadwal-shifting/month"].$get({
          ...(month ? { query: { month } } : {}),
          ...(signal ? { signal } : {}),
        }),
      );
      if (seq === monthSeq.current) setMonthState({ kind: "ready", data });
    } catch (error) {
      if (seq !== monthSeq.current) return;
      if (signal?.aborted) return;
      const err = error as { code?: string; message?: string };
      const code = err?.code ?? "WFM_UNAVAILABLE";
      setMonthState({
        kind: "error",
        code,
        message: describeError(code, err?.message ?? ""),
      });
    }
  }, []);

  // Satu format memuat pada waktunya sendiri: memuat kalender saat pengguna
  // masih melihat tampilan hari ini hanya membuang satu bacaan upstream.
  useEffect(() => {
    if (view !== "today") return;
    const controller = new AbortController();
    void loadDay(urlDate, controller.signal);
    return () => controller.abort();
  }, [loadDay, view, urlDate]);

  useEffect(() => {
    if (view !== "calendar") return;
    const controller = new AbortController();
    void loadMonth(monthParam, controller.signal);
    return () => controller.abort();
  }, [loadMonth, view, monthParam]);

  // Tanggal effective dari backend yang jadi nilai filter, supaya layar dan
  // query tidak pernah berbeda. Kalau user belum memilih apa-apa, backend yang
  // memilih tanggal berjalan — UI tidak menghitungnya sendiri.
  useEffect(() => {
    if (dayState.kind === "ready") setDraftDate(dayState.data.date);
  }, [dayState]);

  /** Tulis parameter tampilan; nilai kosong dibuang supaya URL tetap pendek. */
  const updateSearch = useCallback(
    (patch: Partial<JadwalSearch>, opts: { replace?: boolean } = {}) => {
      const next: JadwalSearch = { ...search, ...patch };
      const cleaned: JadwalSearch = {};
      if (next.date) cleaned.date = next.date;
      if (next.view === "calendar") cleaned.view = "calendar";
      if (next.channel) cleaned.channel = next.channel;
      if (next.month) cleaned.month = next.month;
      if (next.section) cleaned.section = next.section;
      void navigate({
        to: "/sidak/jadwal-shifting",
        search: cleaned,
        replace: opts.replace ?? false,
      });
    },
    [navigate, search],
  );

  function submitDate() {
    const next = ISO_DATE.test(draftDate) ? draftDate : "";
    // Navigasi ke search state yang sama tidak mengubah `urlDate`, jadi efek
    // pemuatan tidak akan berjalan lagi. Kalau tetap mengandalkan navigasi,
    // state `loading` yang sudah di-set akan menggantung selamanya —
    // "Tampilkan" untuk tanggal yang sudah terpilih harus tetap memuat ulang.
    if (next === urlDate) {
      void loadDay(next);
      return;
    }
    setDayState({ kind: "loading" });
    updateSearch({ date: next || undefined }, { replace: true });
  }

  const data = dayState.kind === "ready" ? dayState.data : null;
  // Filter bagian tetap berjalan di klien, lalu baris tabel diurutkan menurut
  // prioritas layanan → shift → jam istirahat → TL → nama tanpa bergantung
  // urutan sumber. Jadi seluruh baris satu layanan tampil berurutan dulu (di
  // dalamnya per shift), baru layanan berikutnya. Jam istirahat dibaca dari
  // slot `LB` pada grid aktivitas WFM, jadi yang break lebih dulu tampil lebih
  // dulu di dalam layanan dan shift yang sama.
  const detailRows = useMemo(
    () =>
      orderScheduleRows(
        (data?.rows ?? []).filter((row) =>
          matchesSection(row.channel, channelSlug),
        ),
        (row) => breakStartMinutes(row.activities),
      ),
    [data, channelSlug],
  );
  const activeSectionLabel =
    (channelSlug ? sectionFromSlug(channelSlug) : null) ?? "Semua layanan";
  const monthData = monthState.kind === "ready" ? monthState.data : null;
  const activeMonth = monthData?.month ?? "";
  const sectionRows = useMemo(
    () =>
      (monthData?.rows ?? []).filter((row) =>
        matchesSection(row.channel, sectionSlug),
      ),
    [monthData, sectionSlug],
  );
  const needle = agentQuery.trim().toLowerCase();
  const visibleMonthRows = useMemo(
    () =>
      needle === ""
        ? sectionRows
        : sectionRows.filter((row) => row.nama.toLowerCase().includes(needle)),
    [sectionRows, needle],
  );
  const agents = useMemo(
    () => [...new Set(visibleMonthRows.map((row) => row.nama))],
    [visibleMonthRows],
  );

  return (
    <div
      data-testid="jadwal-shifting-page"
      className="min-w-0 overflow-x-hidden pb-16"
    >
      <div className="mx-auto flex min-w-0 max-w-[110rem] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <header className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <h1 className="font-outfit text-xl font-bold tracking-tight text-foreground">
              Jadwal Shifting
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Dibaca langsung dari WFM Dash Pro. Hanya-baca.
            </p>
          </div>
          <Tabs
            value={view}
            onValueChange={(next) =>
              updateSearch({
                view: next === "calendar" ? "calendar" : undefined,
              })
            }
            className="w-full"
          >
            <TabsList
              variant="line"
              aria-label="Format tampilan jadwal"
              className="w-full justify-start gap-1 sm:w-fit"
            >
              <TabsTrigger value="today" className="min-h-11 px-3 sm:px-4">
                Hari ini
              </TabsTrigger>
              <TabsTrigger value="calendar" className="min-h-11 px-3 sm:px-4">
                Kalender
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        {view === "today" ? (
          <section
            data-testid="jadwal-shifting-view-today"
            aria-label="Tampilan hari ini"
            className="flex min-w-0 flex-col gap-5"
          >
            <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label
                  htmlFor="jadwal-shifting-date"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Tanggal jadwal
                </label>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    id="jadwal-shifting-date"
                    data-testid="jadwal-shifting-date-input"
                    type="date"
                    aria-label="Tanggal jadwal"
                    value={draftDate}
                    onChange={(event) => setDraftDate(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitDate();
                      }
                    }}
                    className="h-[44px] w-full sm:w-[170px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={submitDate}
                    disabled={dayState.kind === "loading"}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    <RefreshCw
                      data-icon="inline-start"
                      aria-hidden="true"
                      className={
                        dayState.kind === "loading"
                          ? "animate-spin motion-reduce:animate-none"
                          : undefined
                      }
                    />
                    <span>Tampilkan</span>
                  </Button>
                </div>
              </div>
              <SectionFilter
                id="jadwal-shifting-section"
                label="Bagian layanan"
                value={channelSlug}
                options={todaySectionOptions()}
                onChange={(value) =>
                  updateSearch({ channel: value || undefined })
                }
              />
            </div>

            {dayState.kind === "loading" ? (
              <div
                className="flex flex-col gap-3"
                data-testid="jadwal-shifting-state-loading"
              >
                <QaStatePanel
                  type="loading"
                  title="Memuat jadwal shifting"
                  description="Mengambil jadwal satu tanggal dari sumber WFM."
                />
                <div className="flex flex-col gap-2" aria-hidden="true">
                  {[0, 1, 2].map((row) => (
                    <Skeleton
                      key={row}
                      className="h-12 w-full rounded-lg motion-reduce:animate-none"
                    />
                  ))}
                </div>
              </div>
            ) : dayState.kind === "error" ? (
              <div data-testid="jadwal-shifting-state-error">
                <QaStatePanel
                  type="error"
                  title="Jadwal shifting tidak dapat ditampilkan"
                  description={dayState.message}
                  action={
                    dayState.code === "WFM_NOT_CONFIGURED" ? undefined : (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => void loadDay(urlDate)}
                        className="min-h-[44px]"
                      >
                        <RefreshCw
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        <span>Coba lagi</span>
                      </Button>
                    )
                  }
                />
              </div>
            ) : data && data.rows.length === 0 ? (
              <div data-testid="jadwal-shifting-state-empty">
                <QaStatePanel
                  type="empty"
                  title="Belum ada jadwal pada tanggal ini"
                  description={`Sumber WFM tidak mengirim baris jadwal untuk ${data.date}. Coba pilih tanggal lain.`}
                />
              </div>
            ) : (
              data && (
                <div className="flex min-w-0 flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span aria-live="polite">
                      {detailRows.length} jadwal pada {data.date}
                      {channelSlug ? ` — bagian ${activeSectionLabel}` : ""}
                    </span>
                    <span
                      data-testid="jadwal-shifting-asof"
                      data-as-of={data.asOf}
                      className="ml-auto"
                    >
                      Diperbarui {formatAsOf(data.asOf)}
                    </span>
                  </div>

                  {data.truncated ? (
                    <div data-testid="jadwal-shifting-truncated">
                      <QaStatePanel
                        type="warning"
                        title="Daftar dipotong oleh batas server"
                        description={`Hanya ${data.total} baris pertama yang ditampilkan. Baris sisanya tidak dimuat, jadi daftar ini belum tentu lengkap.`}
                      />
                    </div>
                  ) : null}

                  {/*
                    Region inilah yang harus jadi scroller horizontal, BUKAN wrapper
                    `data-slot="table-container"` milik komponen `Table` bersama.
                    Kalau wrapper itu yang menggulir, wrapper tetap `w-full` dan
                    tidak pernah meluber, sehingga `scrollLeft` region selalu 0:
                    `tabindex` + ArrowRight tidak menjangkau kolom di luar layar.
                    Karena komponen `Table` dipakai bersama dan tidak boleh diubah
                    per halaman, overflow-nya dinetralkan dari sini — isi tabel
                    lalu meluar ke region, dan region yang benar-benar menggulir.
                  */}
                  <section
                    role="region"
                    aria-label="Tabel jadwal shifting"
                    tabIndex={0}
                    className="min-w-0 overflow-x-auto rounded-lg border border-border [&>[data-slot=table-container]]:overflow-x-visible"
                  >
                    <Table data-testid="jadwal-shifting-table">
                      <TableCaption className="sr-only">
                        Detail jadwal shifting per tanggal {data.date}
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Nama</TableHead>
                          <TableHead scope="col">Team Leader</TableHead>
                          <TableHead scope="col">Channel</TableHead>
                          <TableHead scope="col">Shift</TableHead>
                          <TableHead scope="col">Shift sebelumnya</TableHead>
                          <TableHead scope="col">
                            Jam kerja & istirahat
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-muted-foreground"
                            >
                              Tidak ada jadwal untuk bagian layanan ini pada{" "}
                              {data.date}.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detailRows.map((row, index) => {
                            const spansMidnight = shiftSpansMidnight(row.shift);
                            return (
                              <TableRow
                                key={`${row.nama}-${row.channel}-${row.date}-${index}`}
                                data-testid="jadwal-shifting-row"
                                data-spans-midnight={
                                  spansMidnight ? "true" : "false"
                                }
                              >
                                <TableCell className="font-medium text-foreground">
                                  {row.nama}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {row.tl || (
                                    <span aria-label="Kosong">&mdash;</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {row.channel || (
                                    <span aria-label="Kosong">&mdash;</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                                    {row.shift || (
                                      <span aria-label="Kosong">&mdash;</span>
                                    )}
                                    {spansMidnight ? (
                                      <span
                                        title="Shift melintasi tengah malam"
                                        className="text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                                      >
                                        <span className="sr-only">
                                          Shift melintasi tengah malam
                                        </span>
                                        <span aria-hidden="true">+1</span>
                                      </span>
                                    ) : null}
                                  </span>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {row.shiftPrev || (
                                    <span aria-label="Kosong">&mdash;</span>
                                  )}
                                </TableCell>
                                <TableCell className="min-w-[220px]">
                                  <WorkTimeSummary row={row} />
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </section>
                </div>
              )
            )}
          </section>
        ) : (
          <section
            data-testid="jadwal-shifting-view-calendar"
            aria-label="Tampilan kalender"
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Bulan jadwal
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    data-testid="jadwal-shifting-month-prev"
                    aria-label="Bulan sebelumnya"
                    disabled={!activeMonth || monthState.kind === "loading"}
                    onClick={() =>
                      updateSearch({ month: shiftMonth(activeMonth, -1) })
                    }
                    className="min-h-11 w-11 px-0"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </Button>
                  <span
                    data-testid="jadwal-shifting-month-label"
                    className="min-w-[9.5rem] text-center text-base font-bold tracking-tight text-foreground"
                  >
                    {activeMonth ? monthLabel(activeMonth) : "\u00a0"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    data-testid="jadwal-shifting-month-next"
                    aria-label="Bulan berikutnya"
                    disabled={!activeMonth || monthState.kind === "loading"}
                    onClick={() =>
                      updateSearch({ month: shiftMonth(activeMonth, 1) })
                    }
                    className="min-h-11 w-11 px-0"
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label
                    htmlFor="jadwal-shifting-agent-search"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Cari nama
                  </label>
                  <div className="relative min-w-0">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="jadwal-shifting-agent-search"
                      data-testid="jadwal-shifting-agent-search"
                      type="search"
                      placeholder="Nama agen"
                      value={agentQuery}
                      onChange={(event) => setAgentQuery(event.target.value)}
                      className="h-[44px] w-full pl-9 sm:w-[13rem]"
                    />
                  </div>
                </div>
                <SectionFilter
                  id="jadwal-shifting-section"
                  label="Bagian layanan"
                  value={sectionSlug}
                  options={calendarSectionOptions()}
                  onChange={(value) => updateSearch({ section: value })}
                />
              </div>
            </div>

            {monthState.kind === "idle" || monthState.kind === "loading" ? (
              <div
                className="flex flex-col gap-3"
                data-testid="jadwal-shifting-month-state-loading"
              >
                <QaStatePanel
                  type="loading"
                  title="Memuat kalender jadwal"
                  description="Mengambil jadwal satu bulan dari sumber WFM."
                />
                <Skeleton
                  className="h-72 w-full rounded-lg motion-reduce:animate-none"
                  aria-hidden="true"
                />
              </div>
            ) : monthState.kind === "error" ? (
              <div data-testid="jadwal-shifting-month-state-error">
                <QaStatePanel
                  type="error"
                  title="Kalender jadwal tidak dapat ditampilkan"
                  description={monthState.message}
                  action={
                    monthState.code === "WFM_NOT_CONFIGURED" ? undefined : (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => void loadMonth(monthParam)}
                        className="min-h-[44px]"
                      >
                        <RefreshCw
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        <span>Coba lagi</span>
                      </Button>
                    )
                  }
                />
              </div>
            ) : monthData && monthData.rows.length === 0 ? (
              <div data-testid="jadwal-shifting-month-state-empty">
                <QaStatePanel
                  type="empty"
                  title="Belum ada jadwal pada bulan ini"
                  description={`Sumber WFM tidak mengirim baris jadwal untuk ${monthLabel(
                    monthData.month,
                  )}. Coba pilih bulan lain.`}
                />
              </div>
            ) : (
              monthData && (
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span aria-live="polite">
                      {visibleMonthRows.length} baris untuk {agents.length} agen
                      pada bagian {sectionFromSlug(sectionSlug) ?? "—"}
                      {agentQuery.trim()
                        ? ` —contains "${agentQuery.trim()}"`
                        : ""}
                    </span>
                    <span className="text-xs">
                      {monthData.from} s/d {monthData.to}
                    </span>
                    <span
                      data-testid="jadwal-shifting-asof"
                      data-as-of={monthData.asOf}
                      className="ml-auto"
                    >
                      Diperbarui {formatAsOf(monthData.asOf)}
                    </span>
                  </div>

                  {monthData.truncated ? (
                    <div data-testid="jadwal-shifting-month-truncated">
                      <QaStatePanel
                        type="warning"
                        title="Kalender dipotong oleh batas server"
                        description={`Hanya ${monthData.total} baris pertama yang ditampilkan. Beberapa tanggal mungkin belum lengkap.`}
                      />
                    </div>
                  ) : null}

                  {agents.length === 0 ? (
                    <QaStatePanel
                      type="empty"
                      title="Tidak ada agen yang cocok"
                      description={`Tidak ada nama agen yang mengandung "${agentQuery.trim()}" pada bagian ini.`}
                    />
                  ) : (
                    <MonthMatrix
                      month={monthData.month}
                      rows={visibleMonthRows}
                    />
                  )}

                  <p className="text-xs text-muted-foreground">
                    Satu bulan per permintaan. Rekap dihitung dari kode shift
                    yang terbaca: cuti, off, TBCCI, dan sisanya hari kerja.
                  </p>
                </div>
              )
            )}
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Hanya-baca: jadwal tidak disimpan di Trainers SuperApp, jadi perubahan
          di WFM baru terlihat setelah muat ulang.
        </p>
      </div>
    </div>
  );
}
