import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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

import { labelJabatan } from "@trainers/types";
import {
  labelTim,
  timTheme,
} from "./utils/profilerFormatters";

import { SlideModeControls, type SlideMode } from "./components/slides/SlideModeControls";
import { ParticipantSlide } from "./components/slides/ParticipantSlide";
import { SlideCanvas, type SlideCanvasRef } from "./components/slides/SlideCanvas";

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
  const canvasRef = useRef<SlideCanvasRef>(null);

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

  const saveAsImage = async () => {
    if (saving || savingPdf || !initialPeserta[index]) return;
    setSaving(true);
    try {
      await canvasRef.current?.saveAsImage(batchName, initialPeserta[index]);
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
      await canvasRef.current?.saveAsPDF(batchName, initialPeserta[index]);
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

        <SlideModeControls
          slideMode={slideMode}
          setSlideMode={setSlideMode}
          onSaveImage={saveAsImage}
          onSavePDF={saveAsPDF}
          saving={saving}
          savingPdf={savingPdf}
          disabled={!p}
        />
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
            <SlideCanvas
              ref={canvasRef}
              slideMode={slideMode}
              fade={fade}
              theme={theme}
            >
              <ParticipantSlide participant={p} slideMode={slideMode} />
            </SlideCanvas>
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
