import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ImageDown,
  Loader2,
  ChevronDown,
  Check,
  Search,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryParams } from "../../hooks/useQueryParams";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerPeserta,
  ProfilerYear,
  ProfilerFolder,
} from "@trainers/types";
import { getPhotoFrame, getPhotoImageStyle } from "../../lib/photo-frame";

import { labelJabatan } from "@trainers/types";

const labelTim: Record<string, string> = {
  Telepon: "Telepon",
  Chat: "Chat",
  Email: "Email",
};

const timTheme = (tim: string) => {
  const t = tim?.toLowerCase();
  if (t === "telepon")
    return {
      accent: "#007AFF",
      light: "#EBF4FF",
      label: "Tim Telepon",
      tailwind: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-500/10",
      border: "border-blue-200 dark:border-blue-500/20",
    };
  if (t === "chat")
    return {
      accent: "#34C759",
      light: "#EDFAF1",
      label: "Tim Chat",
      tailwind: "text-green-500",
      bg: "bg-green-50 dark:bg-green-500/10",
      border: "border-green-200 dark:border-green-500/20",
    };
  if (t === "email")
    return {
      accent: "#FF9500",
      light: "#FFF6E8",
      label: "Tim Email",
      tailwind: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-500/10",
      border: "border-orange-200 dark:border-orange-500/20",
    };
  return {
    accent: "#AF52DE",
    light: "#F5EEFF",
    label: labelTim[tim || ""] || tim || "-",
    tailwind: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/20",
  };
};

export const hitungMasaDinas = (joinDate: string): string => {
  const join = new Date(joinDate);
  const now = new Date();
  let years = now.getFullYear() - join.getFullYear();
  let months = now.getMonth() - join.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years > 0) return `${years} thn ${months} bln`;
  return `${months} bln`;
};

export const hitungUsia = (birthDate: string): number => {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export const formatTanggal = (date: string): string => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const Cell = ({
  label,
  value,
  icon: Icon,
  multiline = false,
}: {
  label: string;
  value?: string | null;
  icon?: any;
  multiline?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      <span className="text-[9px] font-bold uppercase leading-none tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
    <span
      className={`text-xs font-semibold leading-tight text-gray-900 dark:text-gray-100 ${
        multiline ? "break-words whitespace-normal" : "truncate"
      }`}
    >
      {value || "-"}
    </span>
  </div>
);

type SlideMode = "original" | "portraitA4";

export default function ProfilerSlides() {
  const navigate = useNavigate();
  const { batch, participant } = useQueryParams();
  const batchName = batch || "";

  const [initialPeserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [initialYears, setInitialYears] = useState<ProfilerYear[]>([]);
  const [initialFolders, setInitialFolders] = useState<ProfilerFolder[]>([]);

  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);
  const [slideMode, setSlideMode] = useState<SlideMode>("original");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const activeTab: string = "slides";

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getPesertaByBatch(batchName),
    ])
      .then(([y, f, pList]) => {
        const folderNames = new Set(f.map((folder: any) => folder.name));
        if (batchName && f.length > 0 && !folderNames.has(batchName)) {
          const firstFolder = f[0];
          if (firstFolder?.name) {
            navigate({
              to: "/profiler/slides",
              search: { batch: firstFolder.name },
              replace: true,
            });
          } else {
            navigate({ to: "/profiler", replace: true });
          }
          return;
        }
        setInitialYears(y);
        setInitialFolders(f);
        setPeserta(pList);
      })
      .catch(console.error);
  }, [batchName]);

  useEffect(() => {
    if (initialPeserta.length === 0) {
      if (participant) {
        navigate({ to: "/profiler/slides", search: { batch: batchName } });
      }
      setIndex(0);
      return;
    }
    if (participant) {
      const foundIndex = initialPeserta.findIndex((p) => p.id === participant);
      if (foundIndex !== -1) {
        setIndex(foundIndex);
      } else {
        setIndex(0);
        navigate({ to: "/profiler/slides", search: { batch: batchName } });
      }
    } else {
      setIndex(0);
    }
  }, [batchName, initialPeserta, participant, navigate]);

  const updateUrl = useCallback(
    (id: string) => {
      navigate({
        to: "/profiler/slides",
        search: { batch: batchName, participant: id },
      });
    },
    [navigate, batchName]
  );

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= initialPeserta.length) return;
      setFade(false);
      setTimeout(() => {
        setIndex(i);
        setFade(true);
        updateUrl(initialPeserta[i].id);
      }, 110);
    },
    [initialPeserta, updateUrl]
  );

  const prev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);

  const next = useCallback(() => {
    if (index < initialPeserta.length - 1) goTo(index + 1);
  }, [goTo, index, initialPeserta.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, prev]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowFolderDropdown(false);
      }
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setShowParticipantPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const captureElementCanvas = async (target: HTMLElement | null) => {
    if (!target) return null;
    const html2canvas = (await import("html2canvas")).default;
    const { prepareHtml2CanvasClone } = await import("../../lib/html2canvas-tailwind-fix");
    return await html2canvas(target, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#FFFFFF",
      foreignObjectRendering: true,
      onclone: (_clonedDoc: Document, clonedRoot: HTMLElement) => {
        prepareHtml2CanvasClone(_clonedDoc, clonedRoot, target);
      },
    });
  };

  const captureSlideCanvas = async () => captureElementCanvas(slideRef.current);

  const saveAsImage = async () => {
    if (saving || savingPdf || !initialPeserta[index]) return;
    setSaving(true);
    try {
      const canvas = await captureSlideCanvas();
      if (!canvas) return;
      const modeSuffix =
        slideMode === "portraitA4" ? "opsi2-portrait-a4" : "original";
      const link = document.createElement("a");
      link.download = `${batchName}_${
        initialPeserta[index].nama?.replace(/\s+/g, "_") || index + 1
      }_${modeSuffix}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err: any) {
      alert("Gagal simpan gambar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveAsPDF = async () => {
    if (saving || savingPdf || !initialPeserta[index]) return;
    setSavingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const isA4Portrait = slideMode === "portraitA4";

      const canvas = await captureSlideCanvas();
      if (!canvas) return;

      const pdfFormat: [number, number] = [canvas.width, canvas.height];
      const pdf = new jsPDF({
        orientation: isA4Portrait ? "p" : "l",
        unit: "px",
        format: pdfFormat,
        hotfixes: ["px_scaling"],
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);

      const modeSuffix = isA4Portrait ? "opsi2-portrait-a4" : "original";
      pdf.save(
        `${batchName}_${
          initialPeserta[index].nama?.replace(/\s+/g, "_") || index + 1
        }_${modeSuffix}.pdf`
      );
    } catch (err: any) {
      alert("Gagal simpan PDF: " + err.message);
    } finally {
      setSavingPdf(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const filteredPeserta = useMemo(() => {
    if (!searchQuery.trim()) return initialPeserta;
    const q = searchQuery.toLowerCase();
    return initialPeserta.filter(
      (p) =>
        p.nama?.toLowerCase().includes(q) ||
        p.tim?.toLowerCase().includes(q) ||
        labelTim[p.tim || ""]?.toLowerCase().includes(q) ||
        p.jabatan?.toLowerCase().includes(q) ||
        labelJabatan[p.jabatan || ""]?.toLowerCase().includes(q)
    );
  }, [initialPeserta, searchQuery]);

  const p = initialPeserta[index];
  const theme = p ? timTheme(p.tim || "") : timTheme("");
  const isA4Portrait = slideMode === "portraitA4";

  const renderPolishedContent = (participant: ProfilerPeserta) => {
    const headlineGradient = {
      background: `linear-gradient(160deg, ${theme.accent}14 0%, ${theme.accent}08 36%, transparent 100%)`,
    };

    return (
      <div
        className="relative flex flex-1 overflow-hidden"
        style={headlineGradient}
      >
        <div
          className="absolute -left-20 -top-20 h-56 w-56 rounded-full blur-3xl"
          style={{ background: `${theme.accent}24` }}
        />
        <div className="bg-primary/10 absolute -right-20 bottom-[-7rem] h-64 w-64 rounded-full blur-3xl" />

        <div className="relative z-10 box-border flex flex-1 flex-col gap-5 overflow-y-auto p-7">
          <section className="bg-card/80 dark:border-white/10 dark:bg-card/55 rounded-[1.5rem] border border-white/45 p-5 shadow-lg backdrop-blur-xl">
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[132px_1fr]">
              {participant.foto_url ? (
                <div
                  className="ring-card relative h-40 w-40 overflow-hidden rounded-[2rem] shadow-xl ring-[5px]"
                  style={{ boxShadow: `0 10px 24px ${theme.accent}32` }}
                >
                  <img
                    src={participant.foto_url}
                    alt={participant.nama || ""}
                    className="h-full w-full object-cover"
                    style={getPhotoImageStyle(
                      getPhotoFrame(participant.id, participant.photo_frame)
                    )}
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div
                  className="ring-card flex h-40 w-40 items-center justify-center rounded-[2rem] text-5xl font-black shadow-lg ring-[5px]"
                  style={{
                    background: theme.light,
                    color: theme.accent,
                    border: `1px solid ${theme.accent}40`,
                  }}
                >
                  {participant.nama?.charAt(0)}
                </div>
              )}

              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: theme.accent }}
                >
                  Opsi 2 · Portrait A4
                </p>
                <h3 className="text-foreground mt-2 text-3xl font-black leading-tight tracking-tight">
                  {participant.nama}
                </h3>
                <p className="text-muted-foreground mt-2 text-[11px] font-bold uppercase tracking-[0.2em]">
                  {labelJabatan[participant.jabatan || ""] ||
                    participant.jabatan}{" "}
                  · {theme.label}
                </p>
                <div className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.15em]">
                  <span className="border-border/50 bg-background/75 rounded-full border px-2.5 py-1">
                    Masa dinas:{" "}
                    {participant.bergabung_date
                      ? hitungMasaDinas(participant.bergabung_date)
                      : "-"}
                  </span>
                  <span className="border-border/50 bg-background/75 rounded-full border px-2.5 py-1">
                    Usia:{" "}
                    {participant.tgl_lahir
                      ? `${hitungUsia(participant.tgl_lahir)} tahun`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-card/80 dark:border-white/10 dark:bg-card/55 rounded-[1.5rem] border border-white/45 p-5 shadow-lg backdrop-blur-xl">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: theme.accent }}
            >
              Identitas dan Kontak
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cell label="Email OJK" value={participant.email_ojk} />
              <Cell label="No. Telepon" value={participant.no_telepon} />
              <Cell
                label="Tanggal Bergabung"
                value={
                  participant.bergabung_date
                    ? formatTanggal(participant.bergabung_date)
                    : null
                }
              />
              <Cell label="NIK OJK" value={participant.nik_ojk} />
              <Cell
                label="Kontak Darurat"
                value={participant.no_telepon_darurat}
              />
              <Cell
                label="Hubungan Darurat"
                value={participant.hubungan_kontak_darurat}
              />
            </div>
          </section>

          <section className="border-border bg-muted/10 rounded-[1.5rem] border p-5 shadow-lg">
            <p className="text-primary text-[10px] font-bold uppercase tracking-[0.24em]">
              Data Pribadi dan Latar Belakang
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cell label="Jenis Kelamin" value={participant.jenis_kelamin} />
              <Cell
                label="Status Perkawinan"
                value={participant.status_perkawinan}
              />
              <Cell label="Agama" value={participant.agama} />
              <Cell
                label="Tanggal Lahir"
                value={
                  participant.tgl_lahir
                    ? formatTanggal(participant.tgl_lahir)
                    : null
                }
              />
              <Cell label="Pendidikan" value={participant.pendidikan} />
              <Cell label="Lembaga" value={participant.nama_lembaga} />
              <Cell label="Jurusan" value={participant.jurusan} />
              <Cell
                label="Previous Company"
                value={participant.previous_company}
              />
              <Cell label="Pengalaman CC" value={participant.pengalaman_cc} />
              <Cell
                label="Status Hunian"
                value={participant.status_tempat_tinggal}
              />
            </div>
          </section>

          <section className="bg-destructive/10 border-destructive/20 rounded-[1.5rem] border p-5 shadow-sm">
            <p className="text-destructive text-[10px] font-bold uppercase tracking-[0.24em]">
              Data Sensitif
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cell label="No. KTP" value={participant.no_ktp} />
              <Cell label="No. NPWP" value={participant.no_npwp} />
              <Cell
                label="No. Rekening"
                value={
                  participant.nomor_rekening
                    ? `${participant.nomor_rekening}${
                        participant.nama_bank
                          ? ` · ${participant.nama_bank}`
                          : ""
                      }`
                    : null
                }
              />
              <Cell
                label="Alamat Tinggal"
                value={participant.alamat_tinggal}
                multiline={true}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 pb-1 sm:grid-cols-2">
            <div className="bg-amber-500/10 border-amber-500/25 rounded-[1.4rem] border p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
                Catatan Tambahan
              </p>
              <p className="text-foreground/85 mt-2 text-sm leading-6">
                {participant.catatan_tambahan || "Tidak ada catatan tambahan."}
              </p>
            </div>
            <div className="border-border/55 bg-card/75 rounded-[1.4rem] border p-4 shadow-sm">
              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.24em]">
                Keterangan Internal
              </p>
              <p className="text-foreground/80 mt-2 text-sm leading-6">
                {participant.keterangan || "Tidak ada keterangan internal."}
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* ── Tabs Navigation ── */}
      <div className="flex justify-center p-4 pb-0">
        <div className="bg-muted/30 border-border/40 flex w-fit items-center gap-1 rounded-2xl border p-1">
          <button
            onClick={() =>
              navigate({ to: "/profiler/table", search: { batch: batchName } })
            }
            className={`focus-visible:ring-ring rounded-xl px-6 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 ${
              activeTab === "table"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Daftar Peserta
          </button>
          <button
            className={`focus-visible:ring-ring rounded-xl px-6 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 ${
              activeTab === "slides"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tampilan Slide
          </button>
        </div>
      </div>

      {/* Top Bar */}
      <div className="bg-background/80 border-border/40 sticky top-0 z-[60] flex items-center justify-between border-b px-5 py-3 shadow-sm backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/profiler" })}
          className="text-primary focus-visible:ring-ring -ml-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold tracking-tight transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2"
        >
          <ArrowLeft size={15} /> Kembali
        </button>

        <div className="flex items-center gap-2">
          {/* Batch Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowFolderDropdown(!showFolderDropdown)}
              className="bg-muted/50 hover:bg-muted border-border/40 focus-visible:ring-ring flex h-10 items-center gap-2 rounded-xl border px-4 transition-all focus-visible:outline-none focus-visible:ring-2"
            >
              <span className="text-foreground max-w-[120px] truncate text-xs font-black tracking-tight">
                {batchName}
              </span>
              <ChevronDown
                className={`text-primary h-3.5 w-3.5 transition-transform duration-300 ${
                  showFolderDropdown ? "rotate-180" : ""
                }`}
              />
            </button>

            <AnimatePresence>
              {showFolderDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="bg-card border-border/40 absolute left-0 top-full z-[100] mt-2 w-[calc(100vw-2.5rem)] overflow-hidden rounded-3xl border shadow-2xl md:w-64"
                >
                  <div className="custom-scrollbar max-h-80 space-y-4 overflow-y-auto p-3">
                    {initialYears.map((year) => {
                      const yearFolders = initialFolders.filter(
                        (f) => f.year_id === year.id
                      );
                      if (yearFolders.length === 0) return null;
                      return (
                        <div key={year.id} className="space-y-1">
                          <p className="text-muted-foreground px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em]">
                            {year.label}
                          </p>
                          <div className="space-y-0.5">
                            {yearFolders.map((folder) => (
                              <button
                                key={folder.id}
                                onClick={() => {
                                  navigate({
                                    to: "/profiler/slides",
                                    search: { batch: folder.name },
                                  });
                                  setShowFolderDropdown(false);
                                }}
                                className={`focus-visible:ring-ring flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 ${
                                  folder.name === batchName
                                    ? "bg-primary text-primary-foreground font-bold"
                                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <span className="truncate">{folder.name}</span>
                                {folder.name === batchName && (
                                  <Check className="h-3 w-3" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Participant Picker (Combobox) */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => {
                setShowParticipantPicker(!showParticipantPicker);
                if (!showParticipantPicker) {
                  setSearchQuery("");
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }
              }}
              disabled={initialPeserta.length === 0}
              className="bg-muted/50 hover:bg-muted border-border/40 focus-visible:ring-ring flex min-w-[180px] h-10 flex-col items-center justify-center rounded-xl border px-4 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground max-w-[150px] truncate text-xs font-bold">
                  {initialPeserta.length > 0
                    ? p?.nama || "Pilih Peserta"
                    : "Belum ada peserta"}
                </span>
                <ChevronDown
                  className={`text-primary h-3.5 w-3.5 transition-transform duration-300 ${
                    showParticipantPicker ? "rotate-180" : ""
                  }`}
                />
              </div>
              {initialPeserta.length > 0 && (
                <p className="text-muted-foreground text-[9px] font-black uppercase tracking-tighter">
                  {index + 1} / {initialPeserta.length}
                </p>
              )}
            </button>

            <AnimatePresence>
              {showParticipantPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="bg-card border-border/40 absolute left-1/2 top-full z-[100] mt-2 flex w-[calc(100vw-2.5rem)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border shadow-2xl md:w-80"
                >
                  <div className="border-border/40 relative border-b p-3">
                    <Search
                      className="text-muted-foreground absolute left-6 top-1/2 -translate-y-1/2"
                      size={14}
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Cari nama, tim, jabatan..."
                      className="bg-muted/50 border-border/40 focus:ring-primary/20 w-full rounded-xl border py-2 pl-9 pr-4 text-xs transition-all focus:outline-none focus:ring-2"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="text-muted-foreground hover:text-foreground absolute right-6 top-1/2 -translate-y-1/2"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="custom-scrollbar max-h-80 overflow-y-auto p-2">
                    {filteredPeserta.length === 0 ? (
                      <div className="text-muted-foreground py-8 text-center">
                        <p className="text-xs font-medium">
                          Tidak ada peserta ditemukan
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredPeserta.map((peserta) => {
                          const isActive = peserta.id === p?.id;
                          return (
                            <button
                              key={peserta.id}
                              onClick={() => {
                                const newIndex = initialPeserta.findIndex(
                                  (item) => item.id === peserta.id
                                );
                                if (newIndex !== -1) goTo(newIndex);
                                setShowParticipantPicker(false);
                              }}
                              className={`hover:bg-muted group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-all ${
                                isActive ? "bg-primary/5 ring-primary/20 ring-1" : ""
                              }`}
                            >
                              <div className="bg-muted border-border/40 relative h-10 w-10 shrink-0 overflow-hidden rounded-full border">
                                {peserta.foto_url ? (
                                  <img
                                    src={peserta.foto_url}
                                    alt={peserta.nama || ""}
                                    className="h-full w-full object-cover"
                                    crossOrigin="anonymous"
                                  />
                                ) : (
                                  <div className="bg-primary/10 text-primary flex h-full w-full items-center justify-center text-sm font-bold">
                                    {peserta.nama?.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate text-xs font-bold ${
                                    isActive ? "text-primary" : "text-foreground"
                                  }`}
                                >
                                  {peserta.nama}
                                </p>
                                <p className="text-muted-foreground truncate text-[10px] uppercase tracking-tighter">
                                  {peserta.tim} •{" "}
                                  {labelJabatan[peserta.jabatan || ""] ||
                                    peserta.jabatan}
                                </p>
                              </div>
                              {isActive && (
                                <Check className="text-primary h-4 w-4 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Slide Mode Toggle */}
          <div className="bg-muted/30 border-border/40 flex items-center rounded-xl border p-1">
            <button
              onClick={() => {
                setSlideMode("original");
              }}
              className={`focus-visible:ring-ring rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 ${
                slideMode === "original"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Versi Original"
            >
              Original
            </button>
            <button
              onClick={() => {
                setSlideMode("portraitA4");
              }}
              className={`focus-visible:ring-ring rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 ${
                slideMode === "portraitA4"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Opsi 2 (Portrait A4)"
            >
              Opsi 2
            </button>
          </div>

          <button
            onClick={saveAsImage}
            disabled={saving || savingPdf || !p}
            className="text-primary-foreground bg-primary border-primary/10 focus-visible:ring-ring flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ImageDown size={13} />
            )}
            {saving ? "Menyimpan..." : "Simpan Gambar"}
          </button>

          <button
            onClick={saveAsPDF}
            disabled={savingPdf || saving || !p}
            className="text-destructive-foreground bg-destructive border-destructive/10 focus-visible:ring-ring flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2"
          >
            {savingPdf ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ImageDown size={13} />
            )}
            {savingPdf ? "Menyimpan..." : "Simpan PDF"}
          </button>
        </div>
      </div>

      {/* Slide Stage */}
      <div
        className={`flex min-h-0 flex-1 flex-col items-center p-4 ${
          isA4Portrait ? "justify-start overflow-auto" : "justify-center overflow-hidden"
        }`}
      >
        {!p ? (
          <p className="text-muted-foreground text-sm font-medium tracking-tight">
            Belum ada peserta.
          </p>
        ) : (
          <div
            className={`relative flex w-full justify-center ${
              isA4Portrait ? "min-h-full items-start" : "h-full items-center"
            }`}
          >
            <div
              className={`relative duration-300 transition-all ${
                isA4Portrait
                  ? "aspect-[210/297] w-full max-w-[820px]"
                  : "aspect-video max-h-full w-full max-w-[1000px]"
              }`}
              style={{
                opacity: fade ? 1 : 0,
                transform: fade ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <div
                ref={slideRef}
                className={`bg-card border-border/40 flex h-full w-full flex-col rounded-[2rem] border shadow-2xl dark:shadow-black/60 ${
                  isA4Portrait ? "overflow-y-auto" : "overflow-hidden"
                }`}
              >
                <div
                  className="h-[6px] w-full shrink-0"
                  style={{ background: theme.accent }}
                />

                {slideMode === "original" ? (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    {/* LEFT SIDEBAR 30% */}
                    <div className="bg-muted/20 border-border/40 flex w-[30%] shrink-0 flex-col items-center gap-6 overflow-y-auto border-r box-border px-6 pb-12 pt-8">
                      {p.foto_url ? (
                        <div
                          className="ring-card relative h-32 w-32 shrink-0 overflow-hidden rounded-[2rem] shadow-lg ring-[6px]"
                          style={{ boxShadow: `0 8px 24px ${theme.accent}30` }}
                        >
                          <img
                            src={p.foto_url}
                            alt={p.nama || ""}
                            className="h-full w-full object-cover"
                            style={getPhotoImageStyle(
                              getPhotoFrame(p.id, p.photo_frame)
                            )}
                            crossOrigin="anonymous"
                          />
                        </div>
                      ) : (
                        <div
                          className="ring-card flex h-32 w-32 shrink-0 items-center justify-center rounded-[2rem] text-4xl font-bold shadow-md ring-[6px]"
                          style={{
                            background: theme.light,
                            color: theme.accent,
                            border: `1px solid ${theme.accent}40`,
                          }}
                        >
                          {p.nama?.charAt(0)}
                        </div>
                      )}

                      <div className="w-full shrink-0 text-center">
                        <h2 className="text-foreground truncate text-2xl font-black leading-tight tracking-tight">
                          {p.nama}
                        </h2>
                        <p
                          className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-80"
                          style={{ color: theme.accent }}
                        >
                          {labelJabatan[p.jabatan || ""] || p.jabatan}
                        </p>
                        <div
                          className="bg-card border-border/40 mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-bold shadow-sm"
                          style={{ fontSize: "9px", color: theme.accent }}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: theme.accent }}
                          />
                          {theme.label}
                        </div>
                      </div>

                      <div className="bg-card border-border/40 w-full shrink-0 rounded-3xl border p-4 text-center shadow-sm">
                        <p className="text-muted-foreground mb-1 text-[9px] font-bold uppercase tracking-[0.15em]">
                          Masa Dinas
                        </p>
                        <p className="text-foreground text-[22px] font-black leading-none tracking-tight">
                          {p.bergabung_date
                            ? hitungMasaDinas(p.bergabung_date)
                            : "-"}
                        </p>
                        <p className="text-muted-foreground mt-1.5 text-[10px] font-medium tracking-tight">
                          {p.bergabung_date
                            ? `Sejak ${formatTanggal(p.bergabung_date)}`
                            : "-"}
                        </p>
                      </div>

                      <div className="mt-auto flex w-full shrink-0 flex-col gap-2">
                        {(
                          [
                            ["NIK OJK", p.nik_ojk],
                            ["Kelamin", p.jenis_kelamin],
                            ["Agama", p.agama],
                            [
                              "Usia",
                              p.tgl_lahir
                                ? `${hitungUsia(p.tgl_lahir)} Tahun`
                                : null,
                            ],
                            [
                              "Tgl Lahir",
                              p.tgl_lahir ? formatTanggal(p.tgl_lahir) : null,
                            ],
                            ["Status", p.status_perkawinan],
                          ] as Array<[string, string | null | undefined]>
                        )
                          .filter(([, v]) => v)
                          .map(([label, value]) => (
                            <div
                              key={label as string}
                              className="flex items-center justify-between gap-2 px-1"
                            >
                              <span className="text-muted-foreground shrink-0 text-[9px] font-bold uppercase tracking-widest">
                                {label}
                              </span>
                              <span className="text-foreground/80 truncate text-right text-[10px] font-bold tracking-tight">
                                {value as string}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* RIGHT CONTENT 70% */}
                    <div className="box-border flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-10 pb-12 pt-8">
                      <div className="flex shrink-0 flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">
                            Data Pekerjaan
                          </span>
                          <div className="bg-border/40 h-px flex-1" />
                        </div>
                        <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                          <Cell label="Email OJK" value={p.email_ojk} />
                          <Cell label="No. Telepon" value={p.no_telepon} />
                          <Cell
                            label="Bergabung"
                            value={
                              p.bergabung_date
                                ? formatTanggal(p.bergabung_date)
                                : null
                            }
                          />
                          <Cell
                            label="Telepon Darurat"
                            value={p.no_telepon_darurat}
                          />
                          <Cell
                            label="Nama Kontak Darurat"
                            value={p.nama_kontak_darurat}
                          />
                          <Cell
                            label="Hubungan"
                            value={p.hubungan_kontak_darurat}
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">
                            Latar Belakang
                          </span>
                          <div className="bg-border/40 h-px flex-1" />
                        </div>
                        <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                          <Cell label="Pendidikan" value={p.pendidikan} />
                          <Cell label="Lembaga" value={p.nama_lembaga} />
                          <Cell label="Jurusan" value={p.jurusan} />
                          <Cell
                            label="Prev. Company"
                            value={p.previous_company}
                          />
                          <Cell label="Pengalaman CC" value={p.pengalaman_cc} />
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-destructive text-[10px] font-black uppercase tracking-[0.2em]">
                            🔒 Data Sensitif
                          </span>
                          <div className="bg-destructive/20 h-px flex-1" />
                        </div>
                        <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                          <Cell label="No. KTP" value={p.no_ktp} />
                          <Cell label="No. NPWP" value={p.no_npwp} />
                          <Cell
                            label="No. Rekening"
                            value={
                              p.nomor_rekening
                                ? `${p.nomor_rekening}${
                                    p.nama_bank ? ` · ${p.nama_bank}` : ""
                                  }`
                                : null
                            }
                          />
                          <Cell
                            label="Status Hunian"
                            value={p.status_tempat_tinggal}
                          />
                          <div className="col-span-2">
                            <Cell
                              label="Alamat Tinggal"
                              value={p.alamat_tinggal}
                              multiline={true}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-auto flex shrink-0 gap-4">
                        {p.catatan_tambahan && (
                          <div className="bg-amber-500/10 border-amber-500/20 shadow-sm flex-1 rounded-3xl border p-4">
                            <p className="text-amber-600 dark:text-amber-500 mb-1.5 text-[9px] font-black uppercase tracking-[0.2em]">
                              ⭐ Catatan
                            </p>
                            <p className="text-amber-900 dark:text-amber-200/80 line-clamp-2 text-[11px] font-medium leading-relaxed">
                              {p.catatan_tambahan}
                            </p>
                          </div>
                        )}
                        {p.keterangan && (
                          <div className="bg-muted/30 border-border/40 shadow-sm flex-1 rounded-3xl border p-4">
                            <p className="text-muted-foreground mb-1.5 text-[9px] font-black uppercase tracking-[0.2em]">
                              Keterangan
                            </p>
                            <p className="text-foreground/70 line-clamp-2 text-[11px] font-medium leading-relaxed tracking-tight">
                              {p.keterangan}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  renderPolishedContent(p)
                )}

                <div className="h-6 shrink-0" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="bg-background/60 border-border/40 flex items-center justify-center gap-4 border-t py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] backdrop-blur-xl">
        <button
          onClick={prev}
          disabled={index === 0}
          className="bg-card border-border/40 text-primary focus-visible:ring-ring flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-all hover:bg-muted disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="bg-muted/30 border-border/40 flex items-center gap-2 rounded-full border px-4 py-1.5">
          <span className="text-foreground text-sm font-bold tracking-tight tabular-nums">
            {index + 1}
          </span>
          <span className="text-muted-foreground text-xs font-bold">/</span>
          <span className="text-muted-foreground text-xs font-bold tracking-tight tabular-nums">
            {initialPeserta.length}
          </span>
        </div>
        <button
          onClick={next}
          disabled={index === initialPeserta.length - 1}
          className="bg-card border-border/40 text-primary focus-visible:ring-ring flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-all hover:bg-muted disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
