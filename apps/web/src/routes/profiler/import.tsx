import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Download,
  MinusCircle,
  Loader2,
  FileUp,
} from "lucide-react";
import { useQueryParams } from "../../hooks/useQueryParams";
import { profilerApi } from "../../lib/profilerService";
import { generateProfilerTemplate, readWorkbookRaw } from "../../lib/excel-utils";
import PageHeroHeader from "../../components/PageHeroHeader";
import type { ProfilerPeserta } from "@trainers/types";
import { supabase } from "../../lib/supabase";
import { labelJabatan } from "@trainers/types";

type RowResult = {
  nama: string;
  status: "success" | "error" | "skipped";
  message?: string;
};

const DEFAULT_TIMS = ["Telepon", "Chat", "Email"];

const HUBUNGAN_KONTAK_DARURAT = [
  "Orang Tua",
  "Saudara",
  "Pasangan",
  "Teman",
];

const JENIS_KELAMIN_OPTIONS = ["Laki-laki", "Perempuan"];

const AGAMA_OPTIONS = [
  "Islam",
  "Kristen",
  "Katolik",
  "Hindu",
  "Buddha",
  "Konghucu",
];

const STATUS_PERKAWINAN_OPTIONS = ["Belum Menikah", "Menikah", "Cerai"];

const PENDIDIKAN_OPTIONS = ["SMA", "D3", "S1", "S2", "S3"];

const STATUS_TEMPAT_TINGGAL_OPTIONS = [
  "Milik Sendiri",
  "Milik Orang Tua",
  "Kost/Sewa",
  "Lainnya",
];

const PENGALAMAN_CC_OPTIONS = ["Pernah", "Tidak Pernah"];

const TEMPLATE_COLUMNS = [
  {
    header: "Nama Lengkap",
    key: "nama",
    required: true,
    contoh: "Budi Santoso",
    width: 25,
  },
  {
    header: "Tim",
    key: "tim",
    required: true,
    contoh: "Telepon",
    width: 15,
    choices: DEFAULT_TIMS,
  },
  {
    header: "Jabatan",
    key: "jabatan",
    required: true,
    contoh: "cca",
    width: 20,
    choices: Object.values(labelJabatan),
  },
  {
    header: "NIK OJK",
    key: "nik_ojk",
    required: false,
    contoh: "1234567",
    width: 15,
  },
  {
    header: "Tanggal Bergabung",
    key: "bergabung_date",
    required: false,
    contoh: "2024-01-15",
    width: 18,
    type: "date",
  },
  {
    header: "Email OJK",
    key: "email_ojk",
    required: false,
    contoh: "budi@ojk.go.id",
    width: 25,
  },
  {
    header: "No. Telepon",
    key: "no_telepon",
    required: false,
    contoh: "08123456789",
    width: 15,
  },
  {
    header: "No. Telepon Darurat",
    key: "no_telepon_darurat",
    required: false,
    contoh: "08129876543",
    width: 15,
  },
  {
    header: "Nama Kontak Darurat",
    key: "nama_kontak_darurat",
    required: false,
    contoh: "Siti Aminah",
    width: 20,
  },
  {
    header: "Hubungan Kontak Darurat",
    key: "hubungan_kontak_darurat",
    required: false,
    contoh: "Orang Tua",
    width: 20,
    choices: HUBUNGAN_KONTAK_DARURAT,
  },
  {
    header: "Jenis Kelamin",
    key: "jenis_kelamin",
    required: false,
    contoh: "Laki-laki",
    width: 15,
    choices: JENIS_KELAMIN_OPTIONS,
  },
  {
    header: "Agama",
    key: "agama",
    required: false,
    contoh: "Islam",
    width: 15,
    choices: AGAMA_OPTIONS,
  },
  {
    header: "Tanggal Lahir",
    key: "tgl_lahir",
    required: false,
    contoh: "1998-07-20",
    width: 18,
    type: "date",
  },
  {
    header: "Status Perkawinan",
    key: "status_perkawinan",
    required: false,
    contoh: "Belum Menikah",
    width: 18,
    choices: STATUS_PERKAWINAN_OPTIONS,
  },
  {
    header: "Pendidikan",
    key: "pendidikan",
    required: false,
    contoh: "S1",
    width: 12,
    choices: PENDIDIKAN_OPTIONS,
  },
  {
    header: "No. KTP",
    key: "no_ktp",
    required: false,
    contoh: "3201234567890001",
    width: 20,
  },
  {
    header: "No. NPWP",
    key: "no_npwp",
    required: false,
    contoh: "12.345.678.9-012.345",
    width: 20,
  },
  {
    header: "Nomor Rekening",
    key: "nomor_rekening",
    required: false,
    contoh: "1234567890",
    width: 20,
  },
  {
    header: "Nama Bank",
    key: "nama_bank",
    required: false,
    contoh: "BCA",
    width: 15,
  },
  {
    header: "Alamat Tinggal",
    key: "alamat_tinggal",
    required: false,
    contoh: "Jl. Merdeka No. 1, Jakarta",
    width: 35,
  },
  {
    header: "Status Tempat Tinggal",
    key: "status_tempat_tinggal",
    required: false,
    contoh: "Kost/Sewa",
    width: 25,
    choices: STATUS_TEMPAT_TINGGAL_OPTIONS,
  },
  {
    header: "Nama Lembaga Pendidikan",
    key: "nama_lembaga",
    required: false,
    contoh: "Universitas Indonesia",
    width: 25,
  },
  {
    header: "Jurusan",
    key: "jurusan",
    required: false,
    contoh: "Komunikasi",
    width: 20,
  },
  {
    header: "Previous Company",
    key: "previous_company",
    required: false,
    contoh: "PT Telkom Indonesia",
    width: 25,
  },
  {
    header: "Pengalaman Kontak OJK 157",
    key: "pengalaman_cc",
    required: false,
    contoh: "Pernah",
    width: 25,
    choices: PENGALAMAN_CC_OPTIONS,
  },
  {
    header: "Catatan Tambahan",
    key: "catatan_tambahan",
    required: false,
    contoh: "Juara 1 Public Speaking 2024",
    width: 35,
  },
  {
    header: "Keterangan",
    key: "keterangan",
    required: false,
    contoh: "Dalam masa percobaan",
    width: 30,
  },
];

const IMPORT_CHUNK_SIZE = 100;

export default function ProfilerImport() {
  const { batch } = useQueryParams();
  const batchName = batch || "";
  const navigate = useNavigate();

  const [timList, setTimList] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    profilerApi
      .getTeams()
      .then((t) => setTimList(t.map((x) => x.nama)))
      .catch(console.error);
  }, []);

  const downloadTemplate = async () => {
    try {
      await generateProfilerTemplate(batchName || "Batch", timList);
    } catch (error) {
      console.error("Error generating template:", error);
      alert("Gagal membuat template Excel");
    }
  };

  const processFile = async (file: File) => {
    setProcessing(true);
    setResults([]);
    setDone(false);

    try {
      let rows: Record<string, string>[];
      if (/\.csv$/i.test(file.name)) {
        // CSV path (kept after dropping the `xlsx` package): parse with the
        // in-house RFC-4180 parser, first row = header.
        const { parseCsv } = await import("../../lib/excel-utils");
        const table = parseCsv(await file.text());
        if (table.length === 0) throw new Error("File kosong");
        const header = table[0].map((h) => h.trim());
        rows = table.slice(1).map((cells) => {
          const obj: Record<string, string> = {};
          header.forEach((h, c) => {
            obj[h] = cells[c] ?? "";
          });
          return obj;
        });
      } else {
        const buffer = await file.arrayBuffer();
        const { names, sheets } = await readWorkbookRaw(buffer);
        const table = sheets[names[0]] ?? [];
        if (table.length === 0) throw new Error("File kosong");

        // Header row -> header/value pairs per data row (replaces xlsx's
        // sheet_to_json objects). cellDates:true is no longer needed:
        // readWorkbookRaw renders dates as YYYY-MM-DD strings.
        const header = table[0].map((h) => String(h ?? "").trim());
        rows = [];
        for (let i = 1; i < table.length; i++) {
          const rowObj: Record<string, string> = {};
          for (let c = 0; c < header.length; c++) {
            rowObj[header[c]] = String(table[i][c] ?? "");
          }
          rows.push(rowObj);
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const existing = await profilerApi.getPesertaByBatch(batchName);
      const existingNames = new Set(
        existing.map((p) => p.nama?.toLowerCase().trim() ?? ""),
      );
      const importedThisRun = new Set<string>();

      const res: RowResult[] = [];
      const validRows: Partial<ProfilerPeserta>[] = [];

      const HEADER_MAP: Record<string, keyof ProfilerPeserta> = {};
      TEMPLATE_COLUMNS.forEach((c) => {
        HEADER_MAP[c.header.trim()] = c.key as keyof ProfilerPeserta;
      });

      for (const row of rows) {
        const mapped: Partial<ProfilerPeserta> = {
          batch_name: batchName,
          trainer_id: user?.id,
        };

        for (const [rawHeader, rawVal] of Object.entries(row)) {
          const field = HEADER_MAP[rawHeader.trim()];
          if (!field) continue;
          // Values arrive as plain strings from readWorkbookRaw
          // (dates already rendered as YYYY-MM-DD).
          (mapped as any)[field] = String(rawVal ?? "").trim();
        }

        const nama = mapped.nama || "";
        if (!nama || nama.toLowerCase().includes("budi santoso")) continue;

        const namaKey = nama.toLowerCase().trim();
        if (existingNames.has(namaKey) || importedThisRun.has(namaKey)) {
          res.push({
            nama,
            status: "skipped",
            message: "Sudah ada di folder ini",
          });
          continue;
        }

        importedThisRun.add(namaKey);
        validRows.push(mapped);
      }

      for (
        let index = 0;
        index < validRows.length;
        index += IMPORT_CHUNK_SIZE
      ) {
        const chunk = validRows.slice(index, index + IMPORT_CHUNK_SIZE);
        try {
          await profilerApi.bulkCreatePeserta(chunk);
          chunk.forEach((item) => {
            res.push({ nama: item.nama || "Tanpa Nama", status: "success" });
          });
        } catch (_chunkError) {
          for (const item of chunk) {
            try {
              await profilerApi.createPeserta(item);
              res.push({ nama: item.nama || "Tanpa Nama", status: "success" });
            } catch (rowError: any) {
              res.push({
                nama: item.nama || "Tanpa Nama",
                status: "error",
                message: rowError.message,
              });
            }
          }
        }
      }

      setResults(res);
      setDone(true);
    } catch (err: any) {
      alert("Gagal membaca file: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      alert("Format file harus .xlsx atau .csv (untuk .xls, simpan ulang sebagai .xlsx)");
      return;
    }
    processFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <main className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeroHeader
            backHref={`/profiler/table?batch=${encodeURIComponent(batchName)}`}
            backLabel="Kembali ke tabel batch"
            eyebrow="Profiler import"
            title="Impor peserta ke batch aktif dengan alur yang lebih jelas."
            description="Unduh template, unggah file, lalu validasi hasil impor dalam alur kerja yang konsisten dengan modul lain."
            icon={<FileUp className="h-3.5 w-3.5" />}
          />

          <div className="mb-5 rounded-[1.75rem] border border-border/60 bg-card/75 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              Batch tujuan
            </p>
            <p className="mt-2 text-sm font-semibold">{batchName}</p>
          </div>

          <div className="space-y-5">
            <div className="rounded-[2rem] border border-border/50 bg-card/80 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-sm font-semibold text-foreground">
                    Langkah 1 — Download Template
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Template Excel dengan{" "}
                    <strong className="text-foreground">
                      dropdown otomatis
                    </strong>{" "}
                    untuk kolom pilihan dan format tanggal yang benar.
                  </p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                >
                  <Download className="w-4 h-4" />
                  Download .xlsx
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { label: "Identitas Utama", items: "Nama, Tim, Jabatan" },
                  {
                    label: "Data Kerja",
                    items: "NIP, Bergabung, Email, Telepon",
                  },
                  {
                    label: "Data Pribadi",
                    items: "JK, Agama, Lahir, Pendidikan",
                  },
                  {
                    label: "Data Sensitif",
                    items: "KTP, NPWP, Rekening, Bank",
                  },
                ].map((g) => (
                  <div
                    key={g.label}
                    className="rounded-xl border border-border/60 bg-background/75 px-3 py-2"
                  >
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      {g.label}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {g.items}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {!done && (
              <div className="rounded-[2rem] border border-border/50 bg-card/80 p-5 shadow-sm">
                <p className="mb-4 text-sm font-semibold text-foreground">
                  Langkah 2 — Upload File
                </p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`rounded-[1.75rem] border-2 border-dashed p-10 text-center transition-colors ${
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background/75"
                  }`}
                >
                  {processing ? (
                    <div className="space-y-3">
                      <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Memproses data...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Drag & drop file Excel di sini
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Format: .xlsx, .xls, atau .csv
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110">
                        <Upload className="w-4 h-4" />
                        Pilih File
                        <input
                          type="file"
                          accept=".xlsx,.csv"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {done && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 rounded-2xl border border-green-200/50 bg-green-50 p-4 text-center dark:border-green-500/20 dark:bg-green-500/10">
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {successCount}
                    </p>
                    <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
                      Berhasil
                    </p>
                  </div>
                  {skippedCount > 0 && (
                    <div className="flex-1 rounded-2xl border border-yellow-200/50 bg-yellow-50 p-4 text-center dark:border-yellow-500/20 dark:bg-yellow-500/10">
                      <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                        {skippedCount}
                      </p>
                      <p className="mt-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                        Duplikat
                      </p>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="flex-1 rounded-2xl border border-red-200/50 bg-red-50 p-4 text-center dark:border-red-500/20 dark:bg-red-500/10">
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {errorCount}
                      </p>
                      <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                        Gagal
                      </p>
                    </div>
                  )}
                </div>

                <div className="max-h-64 divide-y divide-border overflow-hidden overflow-y-auto rounded-2xl border border-border/60 bg-card/85 shadow-sm">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      {r.status === "success" ? (
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
                      ) : r.status === "skipped" ? (
                        <MinusCircle className="h-4 w-4 flex-shrink-0 text-yellow-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                      )}
                      <span
                        className={`flex-1 truncate text-sm ${
                          r.status === "skipped"
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {r.nama}
                      </span>
                      {r.message && (
                        <span
                          className={`max-w-[180px] flex-shrink-0 truncate text-xs ${
                            r.status === "skipped"
                              ? "text-yellow-500"
                              : "text-red-400"
                          }`}
                        >
                          {r.message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setDone(false);
                      setResults([]);
                    }}
                    className="flex-1 rounded-2xl bg-muted/70 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
                  >
                    Import Lagi
                  </button>
                  <button
                    onClick={() =>
                      navigate({
                        to: "/profiler/table",
                        search: { batch: batchName },
                      })
                    }
                    className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                  >
                    Lihat Tabel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
