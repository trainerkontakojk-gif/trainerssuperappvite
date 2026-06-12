import { useState, useMemo } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import type { QAIndicator, QAPeriod, QATemuan } from "@trainers/types";

interface AgentEntry {
  id: string;
  nama: string;
  batch_name?: string | null;
  tim?: string | null;
  jabatan?: string | null;
}

interface UseTemuanFormParams {
  selectedAgent: AgentEntry | null;
  selectedPeriod: QAPeriod | null;
  selectedService: string;
  activeIndicators: QAIndicator[];
  unlinkedIndicatorIds: Set<string>;
  temuan: QATemuan[];
  setTemuan: React.Dispatch<React.SetStateAction<QATemuan[]>>;
  setErrorMsg: (msg: string | null) => void;
  setSuccessMsg: (msg: string | null) => void;
}

export interface FormEntry {
  uid: string;
  indicator_id: string;
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
}

export function newEntry(): FormEntry {
  return {
    uid: Math.random().toString(36).slice(2),
    indicator_id: "",
    nilai: 3,
    ketidaksesuaian: "",
    sebaiknya: "",
  };
}

export function useTemuanForm({
  selectedAgent,
  selectedPeriod,
  selectedService,
  activeIndicators,
  unlinkedIndicatorIds,
  temuan,
  setTemuan,
  setErrorMsg,
  setSuccessMsg,
}: UseTemuanFormParams) {
  const [showForm, setShowForm] = useState(false);
  const [noTiket, setNoTiket] = useState("");
  const [entries, setEntries] = useState<FormEntry[]>([newEntry()]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);

  const updateEntry = (uid: string, patch: Partial<FormEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, ...patch } : e))
    );
  };

  const resetForm = () => {
    setNoTiket("");
    setEntries([newEntry()]);
    setShowForm(false);
    setErrorMsg(null);
  };

  const handleSave = async () => {
    if (!selectedAgent || !selectedPeriod) return;
    if (entries.some((e) => !e.indicator_id)) {
      setErrorMsg("Semua parameter wajib dipilih.");
      return;
    }
    if (
      unlinkedIndicatorIds.size > 0 &&
      entries.some((e) => unlinkedIndicatorIds.has(e.indicator_id))
    ) {
      setErrorMsg(
        "Beberapa parameter yang dipilih belum terhubung ke database global. Gunakan parameter yang sudah dilink di halaman Settings QA."
      );
      return;
    }
    const normalizedTicket = noTiket.trim();
    if (normalizedTicket) {
      const seenManual = new Set<string>();
      for (const entry of entries) {
        if (!entry.indicator_id) continue;
        const key = `${normalizedTicket.toLowerCase()}::${entry.indicator_id}`;
        if (seenManual.has(key)) {
          const indicatorName =
            activeIndicators.find((i) => i.id === entry.indicator_id)?.name ||
            "parameter tersebut";
          setErrorMsg(
            `Duplicate temuan ditemukan: No. Tiket ${normalizedTicket} dengan parameter ${indicatorName} muncul lebih dari sekali.`
          );
          return;
        }
        seenManual.add(key);
      }
    }
    if (!normalizedTicket) {
      const ok = window.confirm(
        "No. Tiket kosong. Setiap temuan tanpa no. tiket dihitung sebagai sesi terpisah. Lanjutkan?"
      );
      if (!ok) return;
    }
    setPreviewing(true);
    setErrorMsg(null);
    try {
      const temuanList = entries.map((entry) => ({
        indicator_id: entry.indicator_id,
        no_tiket: normalizedTicket || undefined,
        nilai: entry.nilai,
        ketidaksesuaian: entry.ketidaksesuaian || undefined,
        sebaiknya: entry.sebaiknya || undefined,
      }));
      const preview: any = await unwrapResponse(await sidakClient.temuan.batch.preview.$post({
        json: {
          peserta_id: selectedAgent.id,
          period_id: selectedPeriod.id,
          service_type: selectedService,
          no_tiket: normalizedTicket || null,
          items: temuanList,
        },
      }));
      if (preview.stats.invalid_count > 0) {
        setPreviewResult(preview);
        setErrorMsg(
          `${preview.stats.invalid_count} parameter tidak valid. Periksa preview dan perbaiki.`
        );
        return;
      }
      if (preview.stats.skipped_count > 0) {
        const ok = window.confirm(
          `${preview.stats.skipped_count} parameter sudah ada (duplikat) dan akan di-skip. ${preview.stats.valid_count} akan disimpan. Lanjutkan?`
        );
        if (!ok) return;
      }
      setSaving(true);
      const created = await unwrapResponse(await sidakClient.temuan.batch.$post({
        json: {
          peserta_id: selectedAgent.id,
          period_id: selectedPeriod.id,
          service_type: selectedService,
          no_tiket: normalizedTicket || null,
          items: temuanList,
        },
      }));
      const updated = await unwrapResponse(await sidakClient.temuan.$get({
        query: {
          peserta_id: selectedAgent.id,
          period_id: selectedPeriod.id,
          service_type: selectedService,
          limit: "200",
        },
      }));
      setTemuan((updated as any).items ?? []);
      resetForm();
      setPreviewResult(null);
      setSuccessMsg(`${(created as any)?.inserted ?? 0} temuan berhasil disimpan!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || "Gagal menyimpan temuan");
    } finally {
      setSaving(false);
      setPreviewing(false);
    }
  };

  const handlePerfectScore = async () => {
    if (!selectedAgent || !selectedPeriod) return;
    setSaving(true);
    try {
      const res = await unwrapResponse(await sidakClient.temuan["perfect-session"].$post({
        json: {
          peserta_id: selectedAgent.id,
          period_id: selectedPeriod.id,
          service_type: selectedService,
        },
      }));
      if ((res as any[])?.length > 0) {
        setTemuan((prev) => [...(res as any[]).reverse(), ...prev]);
      }
      setSuccessMsg(
        "Sesi Tanpa Temuan berhasil ditambahkan (phantom padding 5 sesi)."
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || "Gagal membuat sesi tanpa temuan.");
    } finally {
      setSaving(false);
    }
  };

  const hasBadFindings = useMemo(() => {
    return temuan.some((t) => t.nilai < 3);
  }, [temuan]);

  return {
    showForm,
    setShowForm,
    noTiket,
    setNoTiket,
    entries,
    setEntries,
    saving,
    setSaving,
    previewing,
    setPreviewing,
    previewResult,
    setPreviewResult,
    updateEntry,
    resetForm,
    handleSave,
    handlePerfectScore,
    hasBadFindings,
  };
}
