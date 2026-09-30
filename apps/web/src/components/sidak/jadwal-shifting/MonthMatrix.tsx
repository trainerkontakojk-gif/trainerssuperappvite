import { useMemo } from "react";
import type { JadwalShiftingMonthRow } from "@trainers/types";
import { cn } from "cn";
import {
  agentTestIdKey,
  isCutiCode,
  isOffCode,
  isTbccCode,
  isWorkCode,
  monthDates,
  shiftKindOf,
  weekdayShort,
} from "./schedule-sections";

/**
 * Format kedua: MATRIKS agen × hari.
 *
 * Barisnya agent, kolomnya tanggal-tanggal bulan terpilih, dan tiap sel berisi
 * kode shift apa adanya dari WFM (`H`, `S1`–`S4`, `TBCCI`, `CUTI`, `OFF`).
 * Kolom paling kanan menghitung rekap dari kode yang benar-benar terbaca.
 *
 * Kenapa matriks, bukan grid tanggal 7 kolom: data WFM adalah satu baris per
 * (agen, tanggal). Grid tanggal hanya bisa menampilkan JUMLAH per hari, sehingga
 * nama orang dan kode shift-nya hilang — padahal justru itulah yang dicari
 * saat bikin jadwal. Matriks juga membuat pola mingguan tiap orang terbaca
 * sekilas, karena baris agen berdampingan horizontal.
 */
type Props = {
  /** Bulan efektif dari backend (`YYYY-MM`), bukan hitungan UI sendiri. */
  month: string;
  /** Baris bulan yang sudah disaring untuk satu bagian. */
  rows: JadwalShiftingMonthRow[];
};

type Summary = { cuti: number; off: number; tbcc: number; kerja: number };
/** Kunci rekap. `work` dibaca dari field `kerja` supaya label UI tetap Inggris. */

const EMPTY_SUMMARY: Summary = { cuti: 0, off: 0, tbcc: 0, kerja: 0 };

/**
 * Empat angka rekap, satu blok. Satu `<td>` — bukan empat `<td>` sticky.
 *
 * Rekap TIDAK sticky. Empat kolom sticky `right-0` saling menumpuk pada offset
 * yang tidak menambah lebar tabel (judul saling menutupi), dan satu blok sticky
 * selebar 10rem menutupi tanggal terakhir saat tabel digulir ke ujung. Karena
 * rekap berada di ujung tabel, mengikutinya saat scroll adalah perilaku yang
 * wajar: yang wajib selalu terlihat adalah kolom identitas (kiri) dan header.
 */
const SUMMARY_FIELDS = [
  { key: "cuti", label: "Cuti", testId: "jadwal-shifting-summary-cuti" },
  { key: "off", label: "Off", testId: "jadwal-shifting-summary-off" },
  { key: "tbcc", label: "TBCCI", testId: "jadwal-shifting-summary-tbcc" },
  { key: "work", label: "Kerja", testId: "jadwal-shifting-summary-work" },
] as const satisfies ReadonlyArray<{
  key: "cuti" | "off" | "tbcc" | "work";
  label: string;
  testId: string;
}>;

const SUMMARY_FIELD_ALIAS: Record<
  (typeof SUMMARY_FIELDS)[number]["key"],
  keyof Summary
> = {
  cuti: "cuti",
  off: "off",
  tbcc: "tbcc",
  work: "kerja",
};

export function MonthMatrix({ month, rows }: Props) {
  const dates = useMemo(() => monthDates(month), [month]);

  // Satu agen = satu baris. Diberi nomor urut sesuai abjad nama supaya baris
  // tidak "berganti tempat" ketika tanggal bergeser.
  const agents = useMemo(() => {
    const byName = new Map<string, { nama: string; tl: string }>();
    for (const row of rows) {
      if (!byName.has(row.nama)) {
        byName.set(row.nama, { nama: row.nama, tl: row.tl });
      }
    }
    return [...byName.values()].sort((a, b) =>
      a.nama.localeCompare(b.nama, "id"),
    );
  }, [rows]);

  // `agent|date` → kode shift. Baris dengan `shift` kosong TIDAK ditulis, supaya
  // sel kosong berarti "tidak ada baris jadwal", bukan "ada baris tapi kosong".
  const cellByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.shift.trim() === "") continue;
      map.set(`${row.nama}|${row.date}`, row.shift.trim());
    }
    return map;
  }, [rows]);

  const summaries = useMemo(() => {
    const map = new Map<string, Summary>();
    for (const agent of agents) {
      const summary: Summary = { ...EMPTY_SUMMARY };
      for (const date of dates) {
        const shift = cellByKey.get(`${agent.nama}|${date}`);
        if (shift === undefined) continue;
        if (isCutiCode(shift)) summary.cuti += 1;
        if (isOffCode(shift)) summary.off += 1;
        if (isTbccCode(shift)) summary.tbcc += 1;
        if (isWorkCode(shift)) summary.kerja += 1;
      }
      map.set(agent.nama, summary);
    }
    return map;
  }, [agents, cellByKey, dates]);

  return (
    <section
      data-testid="jadwal-shifting-calendar"
      role="region"
      aria-label="Matriks jadwal per agen"
      tabIndex={0}
      /*
       * Tinggi dibatasi supaya scrollbar horizontal berada DI DALAM layar.
       * Sebelumnya wadahnya setinggi seluruh isi, jadi scrollbar horizontal
       * baru ketemu setelah menggulir halaman ke bawah — di matriks 30 agen itu
       * ~900px.
       *
       * Cadangan ruangnya dibuat responsif karena kontrol di atas matriks
       * menumpuk di layar sempit. Terukur di aplikasi ini (1rem = 14px, root
       * font-size bukan 16px): ruang-atas 300px di ≥1024px, 368px di 768px,
       * dan 454px di ≤480px — jadi cadangan 24rem/28rem/34rem menyisakan
       * margin ~20px di semua ukuran layar itu.
       *
       * `min-h` sengaja kecil (5rem): fungsinya HANYA mencegah matriks mengerut
       * jadi nol, bukan menjamin tinggi nyaman. Lantai yang lebih besar justru
       * mengalahkan `max-h` dan mendorong scrollbar horizontal kembali ke bawah
       * layar pada jendela pendek — persis masalah yang mau dihilangkan.
       * `overflow-auto` + header sticky membuat konteks kolom tetap terlihat.
       */
      className="min-w-0 max-h-[calc(100dvh-34rem)] min-h-[5rem] overflow-auto rounded-lg border border-border md:max-h-[calc(100dvh-28rem)] lg:max-h-[calc(100dvh-24rem)]"
    >
      <table className="w-max border-collapse text-sm">
        <caption className="sr-only">
          Jadwal tiap agen per tanggal pada bulan {month}. Kolom kiri nama agen
          dan team leader, kolom tengah tanggal, kolom kanan rekap cuti, off,
          TBCCI, dan jumlah hari kerja.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 border-b border-r border-border bg-muted px-3 py-2 text-left align-bottom"
            >
              Agen
            </th>
            {dates.map((date) => (
              <th
                key={date}
                scope="col"
                data-testid={`jadwal-shifting-matrix-col-${date}`}
                className="sticky top-0 z-20 min-w-[2.75rem] border-b border-border bg-muted px-1 py-1.5 text-center align-bottom"
              >
                <span className="block text-[10px] font-medium uppercase text-muted-foreground">
                  {weekdayShort(date)}
                </span>
                <span className="block text-xs font-semibold tabular-nums text-foreground">
                  {date.slice(8)}
                </span>
              </th>
            ))}
            <th
              scope="col"
              data-testid="jadwal-shifting-summary-head"
              className="sticky top-0 z-20 w-[10.5rem] border-b border-l border-border bg-muted px-2 py-1.5 text-center align-bottom"
            >
              <span className="grid grid-cols-[2.25rem_2.25rem_3rem_1fr] items-center">
                {SUMMARY_FIELDS.map((field) => (
                  <span
                    key={field.key}
                    className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {field.label}
                  </span>
                ))}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => {
            const summary = summaries.get(agent.nama) ?? EMPTY_SUMMARY;
            const key = agentTestIdKey(agent.nama);
            return (
              <tr
                key={agent.nama}
                data-testid="jadwal-shifting-matrix-row"
                className="border-b border-border last:border-b-0 hover:bg-muted/30"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[13rem] border-r border-border bg-background px-3 py-1.5 text-left align-middle font-normal"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-foreground">
                        {agent.nama}
                      </span>
                      {agent.tl ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {agent.tl}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </th>

                {dates.map((date) => {
                  const shift = cellByKey.get(`${agent.nama}|${date}`);
                  const kind = shift ? shiftKindOf(shift) : "lainnya";
                  return (
                    <td
                      key={date}
                      data-testid={`jadwal-shifting-cell-${key}-${date}`}
                      className={cn(
                        "border-border px-1 py-1.5 text-center align-middle",
                        kind === "kerja" &&
                          "text-[11px] font-semibold text-foreground",
                        kind === "libur" &&
                          "bg-muted text-[11px] font-semibold text-muted-foreground line-through decoration-muted-foreground/50",
                        kind === "lainnya" &&
                          shift &&
                          "text-[11px] text-foreground",
                      )}
                    >
                      {shift ?? ""}
                    </td>
                  );
                })}

                <td
                  data-testid="jadwal-shifting-matrix-summary"
                  className="border-l border-border bg-background px-2 py-1.5 text-center align-middle"
                >
                  <span className="grid grid-cols-[2.25rem_2.25rem_3rem_1fr] items-center tabular-nums">
                    {SUMMARY_FIELDS.map((field) => (
                      <span
                        key={field.key}
                        data-testid={field.testId}
                        className={
                          field.key === "work"
                            ? "text-[13px] font-semibold text-foreground"
                            : "text-[11px] text-muted-foreground"
                        }
                      >
                        {summary[SUMMARY_FIELD_ALIAS[field.key]]}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
