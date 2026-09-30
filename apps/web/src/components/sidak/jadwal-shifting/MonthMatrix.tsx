import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Lantai tinggi wadah dalam rem. Fungsinya HANYA mencegah matriks mengerut jadi
 * nol — kalau lantai lebih besar daripada ruang yang tersisa, lantai menang dan
 * tepi bawah wadah keluar area gulir. Nilai ini SATU-SATUNYA sumber: dipakai
 * untuk `min-height` (inline) maupun batas bawah perhitungan tinggi.
 * E2E memakai 5rem sebagai kontrak, jadi mengubah angka ini akan gagal di test.
 */
export const FLOOR_REM = 5;

/** Sisa ruang di bawah wadah supaya tepi bawahnya tidak menempel di tepi area gulir. */
const VIEWPORT_MARGIN_PX = 16;

/**
 * Area gulir yang BENAR-BENAR memotong isi halaman. Halaman ini tidak menggulir
 * di window, melainkan di `<section aria-label="Konten halaman">`, dan `<main>`
 * sudah menyisakan ruang untuk tab bar mobile.
 *
 * Tidak semua leluhur ber-`overflow-y: auto` itu area gulir: `overflow-x: hidden`
 * membuat `overflow-y` ikut terhitung `auto` tanpa benar-benar memotong isi
 * (pernah kejadian — pengukuran sempat memakai pembungkus setinggi 1780px alih-
 * alih area gulir 744px). Karena itu yang dipilih adalah leluhur yang isinya
 * melebihi kotaknya; kalau tidak ada, dipakai kandidat terdekat yang tingginya
 * tidak melebihi layar.
 */
function findScrollport(element: HTMLElement): HTMLElement | null {
  let fallback: HTMLElement | null = null;
  let node = element.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    const couldScroll = overflowY === "auto" || overflowY === "scroll";
    if (
      couldScroll &&
      node.clientHeight > 0 &&
      node.clientHeight <= window.innerHeight
    ) {
      if (node.scrollHeight > node.clientHeight + 1) return node;
      fallback ??= node;
    }
    node = node.parentElement;
  }
  return fallback;
}

export function MonthMatrix({ month, rows }: Props) {
  const dates = useMemo(() => monthDates(month), [month]);
  const regionRef = useRef<HTMLElement | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  /*
   * Tinggi wadah dihitung dari ruang yang BENAR-BENAR tersisa, bukan dari
   * cadangan tetap: kontrol di atas matriks bisa tumbuh saat teks diperbesar,
   * label membungkus, atau saat font baru selesai dimuat.
   *
   * Perhitungannya memakai koordinat ISI area gulir (posisi wadah relatif isi
   * area gulir), bukan koordinat viewport, supaya tingginya TIDAK berubah saat
   * pengguna menggulir — kalau memakai koordinat viewport, tinggi wadah akan
   * ikut berubah-ubah dan terasa berkedip.
   */
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;

    let cancelled = false;
    let frame = 0;

    const applyHeight = () => {
      if (cancelled) return;
      const rootFontSize =
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        ) || 16;
      const floor = FLOOR_REM * rootFontSize;
      const regionRect = region.getBoundingClientRect();
      const scrollport = findScrollport(region);
      /*
       * Tanpa suku `scrollTop`: kalau posisi gulir ikut dihitung, tinggi wadah
       * berubah-ubah setiap kali halaman digulir dan tabelnya terasa berkedip.
       * Dengan rumus ini, tepi bawah wadah sudah muat pada posisi gulir paling
       * atas (kasus terburuk) — menggulir ke bawah hanya membuatnya makin muat.
       */
      const available = scrollport
        ? scrollport.clientHeight -
          (regionRect.top - scrollport.getBoundingClientRect().top) -
          VIEWPORT_MARGIN_PX
        : window.innerHeight -
          (regionRect.top + window.scrollY) -
          VIEWPORT_MARGIN_PX;
      setMaxHeight(Math.max(Math.round(floor), Math.round(available)));
    };

    /*
     * Semua pemicu dijadwalkan ke frame berikutnya: saat style berubah,
     * observer bisa terpanggil SEBELUM layout baru dihitung, dan mengukur di
     * saat itu menghasilkan tinggi yang basi (pernah kejadian: tepi bawah
     * meleset ~17px saat teks diperbesar).
     */
    const measure = () => {
      if (cancelled || frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyHeight();
      });
    };
    applyHeight();

    /*
     * Ruang di atas matriks bisa berubah tanpa jendela berubah ukuran: teks
     * diperbesar, label membungkus, atau font baru selesai dimuat. Karena itu
     * yang dipantau bukan cuma viewport, tetapi juga elemen-elemen yang duduk di
     * atas matriks — kalau tingginya berubah, tinggi wadah ikut dihitung ulang.
     */
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    const parent = region.parentElement;
    if (parent) {
      observer.observe(parent);
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== region) observer.observe(sibling);
      }
    }
    const scrollport = findScrollport(region);
    if (scrollport) observer.observe(scrollport);

    // Perubahan CSS (mis. ukuran teks dasar) tidak selalu mengubah kotak elemen
    // yang dipantau, jadi perubahan pada <head> juga jadi pemicu.
    const headObserver = new MutationObserver(measure);
    headObserver.observe(document.head, { childList: true, subtree: true });

    window.addEventListener("resize", measure);
    // Area gulir bisa berubah tinggi tanpa jendela berubah (mis. header ikut
    // menyesuaikan), jadi ukurannya ikut dipantau lewat listener scroll pasif.
    // Catatan: TIDAK ada listener `scroll`. Pemicu gulir membuat tinggi wadah
    // dihitung ulang setiap kali pengguna menggulir, dan tabelnya terasa
    // berkedip. Perubahan ukuran area gulir sudah tertangkap ResizeObserver.
    void document.fonts.ready.then(measure).catch(() => undefined);

    return () => {
      cancelled = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      headObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

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
      ref={regionRef}
      role="region"
      aria-label="Matriks jadwal per agen"
      tabIndex={0}
      style={{
        minHeight: `${FLOOR_REM}rem`,
        maxHeight: maxHeight === null ? undefined : `${maxHeight}px`,
      }}
      /*
       * Tinggi dibatasi supaya scrollbar horizontal berada DI DALAM layar.
       * Sebelumnya wadahnya setinggi seluruh isi, jadi scrollbar horizontal
       * baru ketemu setelah menggulir halaman ke bawah — di matriks 30 agen itu
       * ~900px.
       *
       * Nilai utamanya datang dari `maxHeight` hasil pengukuran (lihat effect di
       * atas), jadi kontrol di atas matriks boleh setinggi apa pun tanpa membuat
       * scrollbar melorot lagi. Kelas `max-h` di bawah hanya cadangan sebelum JS
       * jalan, jadi angkanya sengaja longgar.
       *
       * `min-height: 5rem` (= `FLOOR_REM`, inline) sengaja kecil: fungsinya HANYA mencegah
       * matriks mengerut jadi nol. Lantai yang lebih besar justru mengalahkan
       * batas atas dan mendorong scrollbar kembali ke bawah layar pada jendela
       * pendek — persis masalah yang mau dihilangkan.
       * `overflow-auto` + header sticky membuat konteks kolom tetap terlihat.
       */
      className="min-w-0 max-h-[calc(100dvh-34rem)] overflow-auto rounded-lg border border-border md:max-h-[calc(100dvh-28rem)] lg:max-h-[calc(100dvh-24rem)]"
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
