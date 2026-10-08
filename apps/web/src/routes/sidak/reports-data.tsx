import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Download, Loader2, RefreshCw } from "lucide-react";
import { formatQAIndicatorName, type QAIndicator } from "@trainers/types";
import { useApi, fetchApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { writeFlatExcel } from "../../lib/excel-utils";
import { Pagination } from "../../components/ui/Pagination";
import { Button } from "@/components/ui/button";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import type { AgentDirectoryResponse } from "@trainers/types";
import {
  getReportFindingText,
  getReportRecommendationText,
  getReportTicketText,
  isActionableReportRow,
  normalizeReportAgents,
  validateReportFilters,
} from "./reports-data-utils";

const SERVICE_TYPES = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"] as const;
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};
const MODES = [
  { id: "layanan", label: "Per Layanan" },
  { id: "individu", label: "Per Individu" },
] as const;
/**
 * Nama bulan untuk label opsi "Dari bulan"/"Ke bulan". Satu konstanta dipakai
 * KEDUA select supaya daftar yang sama tidak bisa berbeda satu karakter pun.
 * Ejaan mengikuti konvensi repo (`MonthRangePicker`, `sidak/settings/constants`).
 *
 * Yang berubah hanya label: `value` tetap angka 1..12, default tetap
 * Januari..Desember (1..12), dan body POST tetap `startMonth`/`endMonth`
 * angka. Tidak ada inferensi periode berjalan maupun "bulan terakhir".
 */
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

/** Kelas sel tabel: padat, rata atas, wrap aman untuk teks panjang. */
const CELL = "px-3 py-2.5 align-top";
/** Kontrol form: target sentuh nyata, fokus terlihat, token repo saja. */
const CONTROL =
  "w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * Satu bentuk fakta per baris, dipakai oleh KEDUA representasi hasil (tabel
 * desktop dan daftar ringkas mobile). Jadi isi kolom, urutan, dan nilai selalu
 * sama; yang berbeda hanya density tata letak per breakpoint.
 */
type ReportRowFacts = {
  service: string;
  period: string;
  agent: string;
  batch: string;
  ticket: string;
  parameter: string;
  finding: string;
  recommendation: string;
  score: string;
};

function toRowFacts(row: any): ReportRowFacts {
  return {
    service: SERVICE_LABELS[row.service_type] || row.service_type || "-",
    period: `${String(row.qa_periods?.month || "").padStart(2, "0")}/${row.qa_periods?.year || ""}`,
    agent: row.profiler_peserta?.nama || "-",
    batch: row.profiler_peserta?.batch_name || "",
    ticket: getReportTicketText(row),
    parameter: row.qa_indicators?.name || "-",
    finding: getReportFindingText(row),
    recommendation: getReportRecommendationText(row),
    // Skor ditampilkan apa adanya sebagai angka tabular — tanpa badge/lingkaran
    // dan tanpa warna sebagai satu-satunya penanda Status.
    score: row.nilai === null || row.nilai === undefined ? "-" : String(row.nilai),
  };
}

/** Opsi filter Parameter: nilai = UUID indikator, label = nama terbaca. */
type ParameterOption = { id: string; label: string };

/**
 * Katalog kosong yang identitasnya stabil. Dipakai saat katalog belum siap atau
 * gagal, supaya `parameterOptions` tidak berganti identitas setiap render —
 * efek validasi di bawah bergantung pada identitas itu, dan `[]` literal akan
 * membuat efek berjalan terus-menerus.
 */
const NO_PARAMETER_OPTIONS: ParameterOption[] = [];

/**
 * Hasil katalog parameter untuk SATU cakupan tertentu.
 *
 * `scope` dicatat di sisi pemanggil — bukan diturunkan dari hook — supaya
 * snapshot bisa dibandingkan dengan cakupan yang sedang tampil. Tanpa penanda
 * itu, respons cakupan lama yang tiba belakangan (atau data lama yang masih
 * tertahan selama request berikutnya berjalan) ikut terbaca sebagai katalog
 * cakupan baru; di situlah pilihan yang masih valid ikut terhapus.
 */
type ParameterCatalog = {
  scope: string;
  status: "ready" | "error";
  error: string | null;
  options: ParameterOption[];
};

/**
 * Opsi `<select>` Parameter dari katalog indikator AKTIF.
 *
 * `formatQAIndicatorName` sudah menempelkan `parameter_group` ke nama
 * ("Compliance — Kepatuhan prosedur"), jadi grup tidak dikarang ulang di sini.
 * Nama yang sama di layanan berbeda (mis. "Akurasi informasi produk" ada di
 * Call dan Chat) baru diberi prefiks label layanan KETIKA daftar yang sedang
 * tampil melintasi lebih dari satu layanan — hanya di situation itu user tidak
 * punya select Layanan sebagai konteks. Saat satu layanan sudah dipilih,
 * prefiks itu jadi bacaan berulang, jadi dihilangkan demi menjaga daftar
 * tetap ringkas.
 *
 * Nilai tetap `id` (UUID) dari backend, bukan nama: nama tidak unik dan
 * tidak boleh jadi kunci filter.
 */
function buildParameterOptions(indicators: QAIndicator[] | null): ParameterOption[] {
  const catalog = Array.isArray(indicators) ? indicators : [];
  const services = new Set(catalog.map((indicator) => indicator.service_type));
  const needsServiceLabel = services.size > 1;
  return catalog.map((indicator) => ({
    id: indicator.id,
    label: needsServiceLabel
      ? `${SERVICE_LABELS[indicator.service_type] || indicator.service_type} · ${formatQAIndicatorName(indicator)}`
      : formatQAIndicatorName(indicator),
  }));
}

export default function SidakReportsData() {
  const { data: periods } = useApi<any[]>("/sidak/periods");

  const [mode, setMode] = useState<"layanan" | "individu">("layanan");
  const [serviceType, setServiceType] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: agentDirectory, loading: agentsLoading } =
    useApi<AgentDirectoryResponse>(`/sidak/agents?year=${year}`);
  const agents = normalizeReportAgents(agentDirectory);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [pesertaId, setPesertaId] = useState("");
  const [indicatorId, setIndicatorId] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Katalog parameter mengikuti CAKUPAN filter yang sedang terlihat: Per
  // Layanan yang sudah memilih satu layanan memanggil katalog aktif layanan itu
  // saja, sedangkan "Semua Layanan" — dan Per Individu yang tidak punya select
  // Layanan sama sekali — memakai seluruh katalog aktif. Path hanya berubah
  // saat cakupannya berubah, jadi katalog tidak pernah diminta ulang tanpa
  // alasan. Katalog ini hanya indikator AKTIF: parameter yang sudah
  // dinonaktifkan tidak bisa dipilih, dan filter ini sengaja tidak dipulihkan
  // lewat ID basi.
  //
  // Katalog diambil lewat `fetchApi` + snapshot ber-`scope`, bukan `useApi`:
  // hook itu sengaja menahan `data` lama selama request berikutnya berjalan,
  // jadi tidak ada satu pun render yang bisa membuktikan respons tersebut
  // milik cakupan yang sedang aktif. Di sini setiap snapshot membawa cakupan
  // yang memintanya, sehingga "katalog ini untuk scope mana?" selalu terjawab.
  const parameterScope = mode === "layanan" ? serviceType : "";
  const [parameterCatalog, setParameterCatalog] = useState<ParameterCatalog | null>(null);
  // Nomor request: hanya respons terakhir yang boleh memasang katalog. Klik
  // cepat (Call → Email → semua) menghasilkan request tumpang tindih, dan
  // respons cakupan lama yang tiba belakangan harus dibuang, bukan menimpa
  // katalog cakupan yang sekarang.
  const parameterRequestRef = useRef(0);

  const loadParameterCatalog = useCallback(async (scope: string) => {
    const requestId = ++parameterRequestRef.current;
    try {
      const indicators = await fetchApi<QAIndicator[]>(
        scope
          ? `/sidak/indicators?service_type=${encodeURIComponent(scope)}`
          : "/sidak/indicators",
      );
      if (requestId !== parameterRequestRef.current) return;
      setParameterCatalog({
        scope,
        status: "ready",
        error: null,
        options: buildParameterOptions(indicators),
      });
    } catch (e: any) {
      if (requestId !== parameterRequestRef.current) return;
      setParameterCatalog({
        scope,
        status: "error",
        error: e?.message || "Gagal memuat daftar parameter.",
        // Katalog gagal tidak boleh dipresentasikan sebagai "Semuanya" yang
        // sah: daftar dikosongkan dan tombol cari ditutup supaya tidak ada
        // laporan tak terfilter yang diklaim sebagai hasil filter Parameter.
        options: [],
      });
    }
  }, []);

  useEffect(() => {
    loadParameterCatalog(parameterScope);
  }, [loadParameterCatalog, parameterScope]);

  // Katalog hanya boleh dipakai kalau snapshot-nya memang milik cakupan yang
  // sedang tampil. Selama cakupan berubah, snapshot yang ada masih milik
  // cakupan SEBELUMNYA: daftar itu tidak boleh ditawarkan sebagai daftar
  // Parameter cakupan baru, dan filter terpilih tidak boleh dikirim sebelum
  // divalidasi ulang. Daftar cakupan baru dianggap belum ada — persis seperti
  // "belum ada pencarian" pada hasil laporan.
  const settledCatalog = parameterCatalog?.scope === parameterScope ? parameterCatalog : null;
  const parameterPending = settledCatalog === null;
  const parameterFailed = settledCatalog !== null && settledCatalog.status === "error";

  // Parameter terpilih harus selalu masih ada di katalog yang sedang tampil, dan
  // itu baru bisa dipastikan setelah katalog BARU BERHASIL selesai: pilihan
  // dibuang hanya kalau UUID-nya terbukti tidak ada di sana (Call → Email, atau
  // katalog aktif berubah). Katalog yang GAGAL tidak membuktikan apa pun — daftar
  // kosong karena request-nya error bukan daftar kosong karena parameternya tidak
  // ada, jadi pilihan harus tetap disimpan untuk dicoba lagi. Selama transisi,
  // UUID itu juga tidak boleh terlihat sebagai pilihan dan tidak boleh ikut
  // ter-`value` maupun terkirim.
  const parameterValidated = settledCatalog !== null && settledCatalog.status === "ready";
  const parameterOptions =
    settledCatalog?.status === "ready" ? settledCatalog.options : NO_PARAMETER_OPTIONS;
  const selectedParameterIsValid = parameterOptions.some((option) => option.id === indicatorId);
  const activeIndicatorId = selectedParameterIsValid ? indicatorId : "";
  useEffect(() => {
    if (!parameterValidated) return;
    // Bentuk `updater`, bukan `indicatorId` yang ditutup di dalam effect: nilai
    // itu bisa sudah usang saat effect dijalankan, sehingga `setIndicatorId("")`
    // akan menimpa pilihan yang baru saja diklik user pada rentang waktu yang
    // sama. `current` selalu dibaca dari state terbaru.
    setIndicatorId((current) =>
      current && !parameterOptions.some((option) => option.id === current) ? "" : current,
    );
  }, [parameterValidated, parameterOptions]);

  // Filter yang sudah disubmit berubah → hasil lama tidak boleh lagi diklaim
  // sebagai hasil filter baru. Menaikkan token juga membatalkan request yang
  // masih in-flight untuk filter sebelumnya: responsnya bisa saja tiba setelah
  // filter berubah, dan baris lamanya bukan hasil filter yang sedang terlihat.
  // `error` ikut dibersihkan karena panel error menang atas semua state lain:
  // pesan lama yang menyebut "rentang bulan terbalik" akan terus menyalahkan
  // filter yang sekarang sudah valid, persis seperti `results` yang basi.
  const latestRequestRef = useRef(0);
  useEffect(() => {
    latestRequestRef.current += 1;
    setPage(1);
    setResults(null);
    setError(null);
  }, [serviceType, year, startMonth, endMonth, pesertaId, mode, activeIndicatorId]);

  const availableYears = periods
    ? [...new Set(periods.map((p: any) => p.year))].sort((a, b) => b - a)
    : [new Date().getFullYear()];

  const fetchReport = async () => {
    const validationError = validateReportFilters({
      mode,
      pesertaId,
      startMonth,
      endMonth,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    const requestToken = ++latestRequestRef.current;
    try {
      // `activeIndicatorId` (bukan `indicatorId`) yang dikirim: kalau katalog
      // sudah menyingkirkan pilihan itu, request ini tidak boleh lagi memakai
      // ID yang tidak bisa dilihat user di layar. Field lain tidak berubah,
      // dan `undefined` berarti field-nya tidak ada di body — "Semuanya"
      // berarti POST yang persis sama seperti sebelum filter ini ada.
      const data = await unwrapResponse(await sidakClient.reports.data.$post({ json: {
        serviceType: mode === "layanan" ? (serviceType || undefined) : undefined,
        indicatorId: activeIndicatorId || undefined,
        year,
        startMonth,
        endMonth,
        pesertaId: mode === "individu" ? (pesertaId || undefined) : undefined,
      }}));
      // Seleksi sekali pada respons: count, tabel, pagination, dan Excel
      // memakai satu array hasil terseleksi yang sama.
      const selected = (Array.isArray(data) ? (data as any[]) : []).filter(isActionableReportRow);
      // Respons basi: filter sudah berubah atau ada pencarian yang lebih baru,
      // jadi baris ini bukan hasil filter yang sedang terlihat. Jangan dipasang
      // ke state — count, tabel, dan export akan ikut memalsukan filter baru.
      if (requestToken === latestRequestRef.current) setResults(selected);
    } catch (e: any) {
      if (requestToken === latestRequestRef.current) setError(e.message);
    }
    // `loading` dan `page` tetap dilepas untuk setiap request yang selesai —
    // termasuk yang basi — supaya tombol "Cari Data" tidak pernah terkunci
    // disabled hanya karena responsnya sudah tidak berlaku.
    setLoading(false);
    setPage(1);
  };

  const exportExcel = async () => {
    if (!results || results.length === 0) return;
    // `results` sudah terseleksi (tanpa phantom, Temuan + Rekomendasi terisi),
    // jadi export memakai dataset yang sama dengan layar. Header `Seharusnya`
    // dipertahankan untuk kompatibilitas file.
    //
    // `No. Tiket`, `Temuan`, dan `Seharusnya` diambil dari `toRowFacts` — bentuk
    // fakta yang sama dengan tabel desktop dan daftar mobile. Tiga sel itu
    // dinormalisasi di sana (nomor tiket dipangkas, atau `-` bila kosong/
    // tidak ada; Temuan dan Rekomendasi dipangkas), jadi file tidak boleh menulis
    // field mentah: dari situ spasi tepi ikut masuk dan tiket kosong menjadi sel
    // kosong. Kolom lain apa adanya di bawah ini.
    const rows = results.map((r: any) => {
      const facts = toRowFacts(r);
      return {
        Layanan: SERVICE_LABELS[r.service_type] || r.service_type,
        Periode: `${String(r.qa_periods?.month || "").padStart(2, "0")}/${r.qa_periods?.year || ""}`,
        Agen: r.profiler_peserta?.nama || "",
        Batch: r.profiler_peserta?.batch_name || "",
        "No. Tiket": facts.ticket,
        Parameter: r.qa_indicators?.name || "",
        Temuan: facts.finding,
        Seharusnya: facts.recommendation,
        Skor: r.nilai,
      };
    });
    await writeFlatExcel("Data Laporan", rows, `laporan-data-${year}.xlsx`);
  };

  const pageRows = results ? results.slice((page - 1) * pageSize, page * pageSize) : [];
  // `Pagination` sendiri mengembalikan null untuk satu halaman; tanpa kondisi
  // ini ia tetap meninggalkan strip kosong berbatas di bawah tabel.
  const hasMultiplePages = results !== null && results.length > pageSize;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        data-testid="reports-data-scroll"
        // Padding bawah tetap besar sampai `lg`: di bawah breakpoint itu
        // navigasi bawah masih fixed dan menutupi tepi viewport, jadi konten
        // terakhir butuh ruang aman. `lg` ke atas navbar sudah hilang.
        className="flex-1 overflow-y-auto p-4 pb-14 md:px-8 md:pt-8 lg:pb-8"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header: tipografi + spasi, tanpa ikon dekoratif dan tanpa motion. */}
          <header className="space-y-3">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance text-foreground">
                Laporan Data
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg2">
                Daftar temuan QA per layanan atau per agen, lengkap dengan nomor
                tiket, Temuan, dan Rekomendasi. Data ini berasal dari input QA,
                bukan ringkasan AI.
              </p>
            </div>
          </header>

          {/* Filter: section datar, tanpa kartu di dalam kartu. */}
          <section aria-label="Filter temuan" className="border-y border-border py-4 md:py-5">
            <div className="space-y-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Cakupan data</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-fg2">Cakupan</span>
                  {MODES.map((m) => {
                    const selected = mode === m.id;
                    return (
                      <Button
                        key={m.id}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="lg"
                        aria-pressed={selected}
                        onClick={() => {
                          setMode(m.id);
                          setPesertaId("");
                        }}
                        className="min-h-[44px]"
                      >
                        {m.label}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {mode === "layanan" ? (
                  <div className="space-y-1">
                    <label htmlFor="reports-data-service" className="text-xs font-medium text-fg2">
                      Layanan
                    </label>
                    <select
                      id="reports-data-service"
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value)}
                      className={CONTROL}
                    >
                      <option value="">Semua Layanan</option>
                      {SERVICE_TYPES.map((st) => (
                        <option key={st} value={st}>{SERVICE_LABELS[st]}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label htmlFor="reports-data-agent" className="text-xs font-medium text-fg2">
                      Agen
                    </label>
                    <select
                      id="reports-data-agent"
                      value={pesertaId}
                      onChange={(e) => setPesertaId(e.target.value)}
                      className={CONTROL}
                    >
                      <option value="">
                        {agentsLoading ? "Memuat agen..." : "Pilih Agen"}
                      </option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nama}{a.batch_name ? ` — ${a.batch_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label htmlFor="reports-data-year" className="text-xs font-medium text-fg2">
                    Tahun
                  </label>
                  <select
                    id="reports-data-year"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className={CONTROL}
                  >
                    {availableYears.map((y) => (<option key={y} value={y}>{y}</option>))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="reports-data-from" className="text-xs font-medium text-fg2">
                    Dari bulan
                  </label>
                  <select
                    id="reports-data-from"
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    className={CONTROL}
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="reports-data-to" className="text-xs font-medium text-fg2">
                    Ke bulan
                  </label>
                  <select
                    id="reports-data-to"
                    value={endMonth}
                    onChange={(e) => setEndMonth(Number(e.target.value))}
                    className={CONTROL}
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </div>
                {/* Filter parameter: satu kontrol native untuk KEDUA mode, jadi
                    nama label dan urutan Tab sama di Per Layanan dan Per
                    Individu. "Semuanya" = tidak ada `indicatorId` di request.
                    Selama katalog cakupan ini belum tervalidasi, kontrol
                    dinonaktifkan dan statusnya diumumkan, karena pilihan dari
                    cakupan sebelumnya tidak boleh terlihat seolah-olah cocok
                    dengan cakupan yang baru. */}
                <div className="space-y-1">
                  <label htmlFor="reports-data-parameter" className="text-xs font-medium text-fg2">
                    Parameter
                  </label>
                  <select
                    id="reports-data-parameter"
                    value={activeIndicatorId}
                    onChange={(e) => setIndicatorId(e.target.value)}
                    disabled={parameterPending || parameterFailed}
                    aria-busy={parameterPending}
                    className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <option value="">Semuanya</option>
                    {parameterOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  {parameterPending ? (
                    <p role="status" className="text-xs leading-relaxed text-fg2">
                      Memuat daftar parameter...
                    </p>
                  ) : parameterFailed ? (
                    <div role="alert" className="space-y-1.5">
                      <p className="text-xs leading-relaxed text-destructive">
                        {settledCatalog?.error}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => loadParameterCatalog(parameterScope)}
                        className="min-h-[44px]"
                      >
                        <RefreshCw data-icon="inline-start" aria-hidden="true" />
                        Coba lagi
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={fetchReport}
                  disabled={
                    loading ||
                    parameterPending ||
                    parameterFailed ||
                    (mode === "individu" && (!pesertaId || agentsLoading))
                  }
                  className="min-h-[44px]"
                >
                  {loading ? (
                    <Loader2 data-icon="inline-start" className="motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Search data-icon="inline-start" aria-hidden="true" />
                  )}
                  {loading ? "Memuat..." : "Cari Data"}
                </Button>
                {results && results.length > 0 && (
                  <Button type="button" variant="outline" size="lg" onClick={exportExcel} className="min-h-[44px]">
                    <Download data-icon="inline-start" aria-hidden="true" />
                    Export Excel
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Status: error → loading → belum pernah mencari. */}
          {error ? (
            <QaStatePanel type="error" title={error} />
          ) : loading && results === null ? (
            <QaStatePanel
              type="loading"
              title="Memuat data temuan"
              description="Mengambil temuan QA sesuai filter yang dipilih."
            />
          ) : results === null ? (
            <p className="max-w-2xl text-sm leading-relaxed text-fg2">
              Belum ada pencarian. Pilih cakupan, layanan, dan periode, lalu tekan Cari Data.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2
                  data-testid="results-count"
                  className="text-sm font-semibold tabular-nums text-foreground"
                >
                  {results.length} temuan
                </h2>
                <p className="text-xs leading-relaxed text-fg2">
                  Temuan dan Rekomendasi berasal dari input QA, bukan ringkasan AI.
                </p>
              </div>

              {results.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Tidak ada temuan"
                  description="Tidak ada temuan dengan Temuan dan Rekomendasi lengkap untuk filter yang dipilih."
                />
              ) : (
                <div
                  data-testid="results-surface"
                  className="overflow-hidden rounded-xl border border-border"
                >
                  {/* Desktop: tabel scan-friendly. `lg` = 64rem; html 14px → 896px. */}
                  <div className="hidden lg:block">
                    <div className="overflow-x-auto">
                      <table data-testid="results-table" className="w-full min-w-[900px] border-collapse text-sm">
                        <caption className="sr-only">
                          Temuan QA beserta Rekomendasi per layanan, periode, agen, dan nomor tiket
                        </caption>
                        <thead>
                          <tr className="border-b border-border">
                            <th scope="col" className="w-[5.5rem] px-3 py-2 text-left text-xs font-medium text-fg2">Layanan</th>
                            <th scope="col" className="w-[5rem] px-3 py-2 text-left text-xs font-medium text-fg2">Periode</th>
                            <th scope="col" className="w-[9rem] px-3 py-2 text-left text-xs font-medium text-fg2">Agen</th>
                            <th scope="col" className="w-[8rem] px-3 py-2 text-left text-xs font-medium text-fg2">No. Tiket</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-fg2">Parameter</th>
                            <th scope="col" className="w-[26%] min-w-[15rem] px-3 py-2 text-left text-xs font-medium text-foreground">Temuan</th>
                            <th scope="col" className="w-[26%] min-w-[15rem] px-3 py-2 text-left text-xs font-medium text-foreground">Rekomendasi</th>
                            <th scope="col" className="w-[3.5rem] px-3 py-2 text-right text-xs font-medium text-fg2">Skor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {pageRows.map((row: any, i: number) => {
                            const facts = toRowFacts(row);
                            return (
                              <tr
                                key={row.id || i}
                                className="even:bg-muted/40 transition-colors hover:bg-muted"
                              >
                                <td className={`${CELL} text-foreground`}>{facts.service}</td>
                                <td className={`${CELL} font-mono text-xs tabular-nums text-fg2`}>{facts.period}</td>
                                <td className={`${CELL} text-foreground`}>
                                  <span className="font-medium">{facts.agent}</span>
                                  {facts.batch ? (
                                    <span className="text-fg2"> · {facts.batch}</span>
                                  ) : null}
                                </td>
                                <td className={`${CELL} whitespace-nowrap font-mono text-xs text-foreground`}>
                                  {facts.ticket}
                                </td>
                                <td className={`${CELL} text-fg2`}>{facts.parameter}</td>
                                <td className={`${CELL} max-w-[26rem] whitespace-normal break-words leading-relaxed text-foreground`}>
                                  {facts.finding}
                                </td>
                                <td className={`${CELL} max-w-[26rem] whitespace-normal break-words leading-relaxed text-foreground`}>
                                  {facts.recommendation}
                                </td>
                                <td className={`${CELL} text-right font-mono tabular-nums text-foreground`}>
                                  {facts.score}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile: fakta per baris, dipisah divider — bukan mini-card. */}
                  <ul data-testid="results-list" aria-label="Daftar temuan QA" className="divide-y divide-border lg:hidden">
                    {pageRows.map((row: any, i: number) => {
                      const facts = toRowFacts(row);
                      return (
                        <li key={row.id || i} className="px-4 py-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="min-w-0 text-sm font-medium break-words text-foreground">
                              {facts.agent}
                              {facts.batch ? (
                                <span className="font-normal text-fg2"> · {facts.batch}</span>
                              ) : null}
                            </p>
                            <p className="whitespace-nowrap font-mono text-xs text-foreground">
                              <span className="font-sans text-fg2">Tiket </span>
                              {facts.ticket}
                            </p>
                          </div>
                          <p className="mt-1 text-xs break-words text-fg2">
                            {facts.service} · {facts.period} · {facts.parameter}
                          </p>
                          <p className="mt-1 text-xs text-fg2">
                            Skor{" "}
                            <span className="font-mono tabular-nums text-foreground">{facts.score}</span>
                          </p>
                          <dl className="mt-3 space-y-2.5">
                            <div>
                              <dt className="text-xs font-medium text-foreground">Temuan</dt>
                              <dd className="mt-0.5 whitespace-normal break-words text-sm leading-relaxed text-fg2">
                                {facts.finding}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-foreground">Rekomendasi</dt>
                              <dd className="mt-0.5 whitespace-normal break-words text-sm leading-relaxed text-fg2">
                                {facts.recommendation}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>

                  {hasMultiplePages && (
                    <div className="border-t border-border px-4 py-3">
                      <Pagination page={page} pageSize={pageSize} total={results.length}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                        showPageSizeSelector
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
