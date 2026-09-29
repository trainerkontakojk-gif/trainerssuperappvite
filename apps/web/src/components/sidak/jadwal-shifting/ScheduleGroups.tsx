import type { JadwalShiftingRow } from "@trainers/types";
import { cn } from "cn";
import { dutyOf, groupByDuty } from "./schedule-sections";

/**
 * Format pertama: jadwal hari ini dipecah menjadi dua kelompok tegas — siapa
 * MASUK dan siapa LIBUR — bukan satu daftar yang harus dibaca satu per satu.
 *
 * Dua kelompok memakai section datar yang dipisah `border-b-2`, bukan dua kartu
 * berisi kartu.	Tujuan halaman ini adalah daftar orang yang banyak (puluhan
 * per hari per bagian), dan kartu-per-kartu untuk tiap orang berubah jadi
 * tembok kotak yang menutupi informasi shift-nya sendiri. Baris dense dengan
 * pemisah satu piksel menyimpan nama, bagian, TL, dan shift dalam satu baris
 * yang bisa dibandingkan sekilas.
 *
 * Baris sudah difilter sesuai pilihan bagian, jadi kelompok yang kosong harus
 * menyatakan dirinya kosong; mengosongkan kelompok tanpa penjelasan akan
 * terbaca sebagai "data hilang".
 */
type Props = {
  rows: JadwalShiftingRow[];
  /** Tanggal yang benar-benar di-query, untuk pesan kelompok kosong. */
  date: string;
};

function RowItem({
  row,
  kind,
}: {
  row: JadwalShiftingRow;
  kind: "masuk" | "libur";
}) {
  const libur = dutyOf(row.shift) === "libur";
  return (
    <li
      data-testid={`jadwal-shifting-${kind}-item`}
      className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border/60 py-1.5 last:border-b-0"
    >
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
        {row.nama}
      </span>
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        {row.shift || "Tanpa shift"}
      </span>
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        {row.tl ? `TL ${row.tl}` : "Tanpa TL"}
      </span>
      {libur ? null : <span className="sr-only">Masuk pada tanggal ini</span>}
    </li>
  );
}

function GroupPanel({
  kind,
  rows,
  date,
}: {
  kind: "masuk" | "libur";
  rows: JadwalShiftingRow[];
  date: string;
}) {
  const masuk = kind === "masuk";
  return (
    <section
      data-testid={`jadwal-shifting-${kind}`}
      aria-labelledby={`jadwal-shifting-${kind}-heading`}
      className="min-w-0"
    >
      <header
        className={cn(
          "flex items-baseline justify-between gap-2 border-b-2 pb-1.5",
          masuk ? "border-emerald-600" : "border-border",
        )}
      >
        <h2
          id={`jadwal-shifting-${kind}-heading`}
          className={cn(
            "text-sm font-bold uppercase tracking-wide",
            masuk
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-foreground",
          )}
        >
          {masuk ? "Masuk" : "Libur"}
        </h2>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          {rows.length} orang
        </span>
      </header>

      {rows.length === 0 ? (
        <p
          data-testid={`jadwal-shifting-${kind}-empty`}
          className="py-2 text-sm leading-relaxed text-muted-foreground"
        >
          {masuk
            ? `Tidak ada yang masuk pada pilihan ini untuk ${date}.`
            : `Tidak ada yang libur pada pilihan ini untuk ${date}.`}
        </p>
      ) : (
        <ul className="min-w-0">
          {rows.map((row, index) => (
            <RowItem
              key={`${row.nama}-${row.channel}-${row.date}-${index}`}
              row={row}
              kind={kind}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScheduleGroups({ rows, date }: Props) {
  const { masuk, libur } = groupByDuty(rows);
  return (
    <div className="grid min-w-0 gap-x-8 gap-y-5 lg:grid-cols-2">
      <GroupPanel kind="masuk" rows={masuk} date={date} />
      <GroupPanel kind="libur" rows={libur} date={date} />
    </div>
  );
}
