import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Loader2,
  MinusCircle,
  Upload,
} from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { profilerApi } from "../../../../lib/profilerService";
import {
  generateProfilerTemplate,
  readWorkbookRaw,
} from "../../../../lib/excel-utils";
import { supabase } from "../../../../lib/supabase";
import { notify } from "../../../../lib/toast";
import { Button } from "../../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";
import { cn } from "cn";

type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Unduh template" },
  { step: 2, label: "Unggah file" },
  { step: 3, label: "Periksa" },
  { step: 4, label: "Selesai" },
];

/** Nama kolom (sudah dinormalkan) yang diterima untuk tiap field peserta. */
const HEADER_ALIASES: Record<string, keyof ProfilerPeserta> = {
  "nama lengkap": "nama",
  nama: "nama",
  tim: "tim",
  jabatan: "jabatan",
  "nik ojk": "nik_ojk",
  "nip ojk": "nik_ojk",
  "tanggal bergabung": "bergabung_date",
  "tgl bergabung": "bergabung_date",
  "bergabung di 157": "bergabung_date",
  "email ojk": "email_ojk",
  "no telepon": "no_telepon",
  "no telepon darurat": "no_telepon_darurat",
  "no telp darurat": "no_telepon_darurat",
  "nama kontak darurat": "nama_kontak_darurat",
  "hubungan kontak darurat": "hubungan_kontak_darurat",
  "hubungan kontak": "hubungan_kontak_darurat",
  "jenis kelamin": "jenis_kelamin",
  agama: "agama",
  "tanggal lahir": "tgl_lahir",
  "tgl lahir": "tgl_lahir",
  "status perkawinan": "status_perkawinan",
  pendidikan: "pendidikan",
  "no ktp": "no_ktp",
  "no npwp": "no_npwp",
  "nomor rekening": "nomor_rekening",
  "no rekening": "nomor_rekening",
  "nama bank": "nama_bank",
  "alamat tinggal": "alamat_tinggal",
  "status tempat tinggal": "status_tempat_tinggal",
  "status hunian": "status_tempat_tinggal",
  "nama lembaga pendidikan": "nama_lembaga",
  "nama lembaga": "nama_lembaga",
  jurusan: "jurusan",
  "previous company": "previous_company",
  "perusahaan sebelumnya": "previous_company",
  "pengalaman kontak ojk 157": "pengalaman_cc",
  "pengalaman cc": "pengalaman_cc",
  "catatan tambahan": "catatan_tambahan",
  keterangan: "keterangan",
};

/** Label jabatan dari template lama yang bukan label `labelJabatan`. */
const JABATAN_ALIASES: Record<string, string> = {
  "contact center agent (157)": "cca",
  "contact center agent": "cca",
  "quality assurance": "qa",
  tl: "team_leader",
};

const DATE_FIELDS: { key: keyof ProfilerPeserta; label: string }[] = [
  { key: "tgl_lahir", label: "Tanggal lahir" },
  { key: "bergabung_date", label: "Tanggal bergabung" },
];

const TEMPLATE_GROUPS = [
  { label: "Identitas utama", items: "Nama, tim, jabatan" },
  { label: "Data kerja", items: "NIK, tanggal bergabung, email, telepon" },
  { label: "Data pribadi", items: "Jenis kelamin, agama, tanggal lahir" },
  { label: "Data sensitif", items: "KTP, NPWP, rekening, bank" },
];

const IMPORT_CHUNK_SIZE = 100;

type ReviewRow = {
  /** Nomor baris di file (baris 1 = judul kolom). */
  line: number;
  data: Partial<ProfilerPeserta>;
  status: "ready" | "duplicate" | "invalid";
  reason?: string;
};

type SaveFailure = { nama: string; message: string };

const normalizeHeader = (header: string) =>
  header
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[*.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function resolveJabatan(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (labelJabatan[value]) return value;
  const byLabel = Object.entries(labelJabatan).find(
    ([, label]) => label.toLowerCase() === value,
  );
  if (byLabel) return byLabel[0];
  return JABATAN_ALIASES[value] ?? null;
}

async function readRows(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) {
    const { parseCsv } = await import("../../../../lib/excel-utils");
    return parseCsv(await file.text());
  }
  const { names, sheets } = await readWorkbookRaw(await file.arrayBuffer());
  return (sheets[names[0]] ?? []).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );
}

/** "Kolom Nama kosong, jabatan "X" tidak dikenal": satu kalimat per baris. */
const joinReasons = (problems: string[]) =>
  problems
    .map((problem, index) =>
      (index === 0 ? problem.charAt(0).toUpperCase() : problem.charAt(0).toLowerCase()) +
      problem.slice(1),
    )
    .join(", ");

/** Ubah tabel mentah jadi baris pemeriksaan; `null` jika kolomnya tidak dikenali. */
function reviewRows(
  table: string[][],
  batchName: string,
  existingNames: Set<string>,
): ReviewRow[] | null {
  const header = (table[0] ?? []).map(
    (cell) => HEADER_ALIASES[normalizeHeader(cell)] ?? null,
  );
  if (!header.includes("nama")) return null;

  const firstLineByName = new Map<string, number>();
  const rows: ReviewRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((cell) => !cell.trim())) return;

    const data: Partial<ProfilerPeserta> = { batch_name: batchName };
    header.forEach((field, column) => {
      const value = (cells[column] ?? "").trim();
      if (field && value) (data as Record<string, string>)[field] = value;
    });
    const nama = data.nama ?? "";
    // Baris contoh di template lama.
    if (nama.toLowerCase().includes("budi santoso")) return;

    const problems: string[] = [];
    if (!nama) problems.push("Kolom Nama kosong");
    if (!data.tim) problems.push("Kolom Tim kosong");
    if (!data.jabatan) {
      problems.push("Kolom Jabatan kosong");
    } else {
      const jabatan = resolveJabatan(data.jabatan);
      if (jabatan) data.jabatan = jabatan;
      else problems.push(`jabatan "${data.jabatan}" tidak dikenal`);
    }
    for (const { key, label } of DATE_FIELDS) {
      const value = data[key] as string | undefined;
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        problems.push(`${label} harus berformat TTTT-BB-HH`);
      }
    }

    if (problems.length > 0) {
      rows.push({ line, data, status: "invalid", reason: joinReasons(problems) });
      return;
    }

    const key = nama.toLowerCase();
    const earlierLine = firstLineByName.get(key);
    if (existingNames.has(key)) {
      rows.push({
        line,
        data,
        status: "duplicate",
        reason: `Sudah ada di ${batchName}`,
      });
    } else if (earlierLine) {
      rows.push({
        line,
        data,
        status: "duplicate",
        reason: `Nama sama dengan baris ${earlierLine}`,
      });
    } else {
      firstLineByName.set(key, line);
      rows.push({ line, data, status: "ready" });
    }
  });
  return rows;
}

interface ProfilerImportFlowProps {
  batchName: string;
  onCancel: () => void;
  /** Dipanggil setelah ada peserta tersimpan, supaya daftar folder dimuat ulang. */
  onImported: (count: number) => void;
  onFinish: () => void;
}

/** Impor 4 langkah di area utama workspace (`?view=impor`). */
export default function ProfilerImportFlow({
  batchName,
  onCancel,
  onImported,
  onFinish,
}: ProfilerImportFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [timList, setTimList] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [failures, setFailures] = useState<SaveFailure[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    profilerApi
      .getTeams()
      .then((teams) => setTimList(teams.map((team) => team.nama)))
      .catch((error) => console.error("Gagal memuat tim", error));
  }, []);

  const downloadTemplate = async () => {
    try {
      await generateProfilerTemplate(batchName, timList);
      setStep((current) => (current === 1 ? 2 : current));
    } catch (error) {
      console.error("Gagal membuat template:", error);
      notify.error("Gagal membuat template Excel");
    }
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setFileError(
        "Format file harus .xlsx atau .csv. File .xls disimpan ulang sebagai .xlsx dulu.",
      );
      return;
    }
    setBusy(true);
    try {
      const table = await readRows(file);
      const existing = await profilerApi.getPesertaByBatch(batchName);
      const existingNames = new Set(
        existing.map((p) => p.nama?.toLowerCase().trim() ?? ""),
      );
      const reviewed = reviewRows(table, batchName, existingNames);
      if (!reviewed) {
        setStep(2);
        setFileError(
          "Kolom di file tidak cocok dengan template. Unduh template lalu salin data ke sana.",
        );
        return;
      }
      if (reviewed.length === 0) {
        setStep(2);
        setFileError("File tidak berisi baris peserta.");
        return;
      }
      setFileName(file.name);
      setRows(reviewed);
      setStep(3);
    } catch (error: any) {
      setStep(2);
      setFileError(`File tidak bisa dibaca. ${error?.message ?? ""}`.trim());
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const ready = rows.filter((row) => row.status === "ready");
  const duplicateCount = rows.filter(
    (row) => row.status === "duplicate",
  ).length;
  const invalidCount = rows.filter((row) => row.status === "invalid").length;

  const save = async () => {
    setBusy(true);
    let saved = 0;
    const failed: SaveFailure[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const items = ready.map((row) => ({ ...row.data, trainer_id: user?.id }));
      for (let index = 0; index < items.length; index += IMPORT_CHUNK_SIZE) {
        const chunk = items.slice(index, index + IMPORT_CHUNK_SIZE);
        try {
          await profilerApi.bulkCreatePeserta(chunk);
          saved += chunk.length;
        } catch {
          // Satu baris bermasalah menggagalkan satu potongan; simpan per baris
          // supaya alasan gagalnya jelas.
          for (const item of chunk) {
            try {
              await profilerApi.createPeserta(item);
              saved += 1;
            } catch (rowError: any) {
              failed.push({
                nama: item.nama || "Tanpa nama",
                message: rowError?.message || "Gagal disimpan",
              });
            }
          }
        }
      }
    } catch (error: any) {
      notify.error("Impor terhenti", error?.message);
    } finally {
      setBusy(false);
    }
    const unsaved = ready.length - saved - failed.length;
    if (unsaved > 0) {
      failed.push({
        nama: `${unsaved} peserta lain`,
        message: "Belum disimpan karena impor terhenti",
      });
    }
    setSavedCount(saved);
    setFailures(failed);
    setStep(4);
    if (saved > 0) onImported(saved);
  };

  const restart = () => {
    setRows([]);
    setFileName("");
    setFailures([]);
    setSavedCount(0);
    setFileError(null);
    setStep(2);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <section
      aria-labelledby="profiler-import-title"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{batchName}</p>
          <h1
            id="profiler-import-title"
            className="font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Impor peserta dari Excel
          </h1>
        </div>
        {step !== 4 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 shrink-0"
            onClick={onCancel}
            disabled={busy}
          >
            Batal
          </Button>
        ) : null}
      </header>

      <ol
        aria-label="Langkah impor"
        className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm"
      >
        {STEPS.map(({ step: value, label }, index) => {
          const done = value < step;
          const current = value === step;
          return (
            <li key={value} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="h-px w-6 bg-border" />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-xs tabular-nums",
                  current
                    ? "border-foreground bg-foreground text-background"
                    : done
                      ? "border-foreground text-foreground"
                      : "border-border text-muted-foreground",
                )}
              >
                {done ? <CheckCircle className="size-3.5" /> : value}
              </span>
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  current
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {step === 1 || step === 2 ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
              1. Unduh template
            </h2>
            <p className="text-sm text-muted-foreground">
              Template Excel berisi pilihan isian dan format tanggal yang benar.
              Kolom wajib: Nama lengkap, Tim, Jabatan.
            </p>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {TEMPLATE_GROUPS.map((group) => (
                <div
                  key={group.label}
                  className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-4 border-b border-border py-2 text-sm"
                >
                  <dt className="text-foreground">{group.label}</dt>
                  <dd className="text-muted-foreground">{group.items}</dd>
                </div>
              ))}
            </dl>
            <div>
              <Button
                type="button"
                variant={step === 1 ? "default" : "outline"}
                size="lg"
                className="min-h-11"
                onClick={() => void downloadTemplate()}
              >
                <Download data-icon="inline-start" aria-hidden="true" />
                Unduh template .xlsx
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
              2. Unggah file
            </h2>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                dragging ? "border-foreground bg-muted/50" : "border-border",
              )}
            >
              {busy ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  Membaca file…
                </p>
              ) : (
                <>
                  <FileSpreadsheet
                    aria-hidden="true"
                    className="size-8 text-muted-foreground"
                  />
                  <p className="text-sm text-foreground">
                    Seret file ke sini atau pilih dari perangkat.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Format .xlsx atau .csv
                  </p>
                  <Button
                    type="button"
                    variant={step === 2 ? "default" : "outline"}
                    size="lg"
                    className="min-h-11"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload data-icon="inline-start" aria-hidden="true" />
                    Pilih file
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    aria-label="Pilih file"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                    }}
                  />
                </>
              )}
            </div>
            {fileError ? (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {fileName} · {rows.length} baris · folder tujuan{" "}
            <span className="font-medium text-foreground">{batchName}</span>
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <li className="flex items-center gap-1.5 text-foreground">
              <CheckCircle aria-hidden="true" className="size-4" />
              {ready.length} siap disimpan
            </li>
            {duplicateCount > 0 ? (
              <li className="flex items-center gap-1.5 text-muted-foreground">
                <MinusCircle aria-hidden="true" className="size-4" />
                {duplicateCount} duplikat, dilewati
              </li>
            ) : null}
            {invalidCount > 0 ? (
              <li className="flex items-center gap-1.5 text-destructive">
                <CircleAlert aria-hidden="true" className="size-4" />
                {invalidCount} perlu diperbaiki
              </li>
            ) : null}
          </ul>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table aria-label="Hasil pemeriksaan">
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-16">Baris</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tim</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>NIK OJK</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                      {row.line}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.data.nama || (
                        <span className="font-normal text-muted-foreground">
                          (kosong)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{row.data.tim || "-"}</TableCell>
                    <TableCell>
                      {row.data.jabatan
                        ? labelJabatan[row.data.jabatan] || row.data.jabatan
                        : "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.data.nik_ojk || "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <StatusText row={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Baris yang perlu diperbaiki tidak ikut disimpan. Perbaiki di file
              lalu unggah ulang, atau lanjutkan tanpa baris itu.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11"
                onClick={restart}
                disabled={busy}
              >
                <Upload data-icon="inline-start" aria-hidden="true" />
                Unggah ulang
              </Button>
              <Button
                type="button"
                size="lg"
                className="min-h-11"
                onClick={() => void save()}
                disabled={busy || ready.length === 0}
              >
                {busy ? (
                  <Loader2
                    data-icon="inline-start"
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                {busy ? "Menyimpan…" : `Simpan ${ready.length} peserta`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            {savedCount} peserta disimpan ke {batchName}.
            {failures.length > 0 ? ` ${failures.length} gagal disimpan:` : ""}
          </p>
          {failures.length > 0 ? (
            <ul className="flex flex-col border-t border-border text-sm">
              {failures.map((failure, index) => (
                <li
                  key={`${failure.nama}-${index}`}
                  className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-4 border-b border-border py-2"
                >
                  <span className="text-foreground">{failure.nama}</span>
                  <span className="text-destructive">{failure.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={restart}
            >
              Impor file lain
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={onFinish}
            >
              Lihat peserta
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatusText({ row }: { row: ReviewRow }) {
  if (row.status === "ready") {
    return (
      <span className="flex items-center gap-1.5 text-foreground">
        <CheckCircle aria-hidden="true" className="size-4 shrink-0" />
        Siap
      </span>
    );
  }
  if (row.status === "duplicate") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <MinusCircle aria-hidden="true" className="size-4 shrink-0" />
        {row.reason}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-destructive">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {row.reason}
    </span>
  );
}
