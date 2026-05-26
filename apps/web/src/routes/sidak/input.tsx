import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useApi, getApi, postApi, putApi, deleteApi } from "../../hooks/useApi";
import { useAuthStore } from "../../store/authStore";
import type { QAIndicator, QAPeriod, QATemuan, ServiceWeight, RuleVersion, AgentDirectoryResponse } from "@trainers/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, FolderOpen, User as UserIcon, CalendarDays, Plus,
  Upload, Download, Check, X, ChevronRight,
  Loader2, AlertCircle,
  AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import TemuanGroupCard from "../../components/sidak/TemuanGroupCard";
import SidakInputScoreCard from "../../components/sidak/SidakInputScoreCard";
import SidakInputManualForm from "../../components/sidak/SidakInputManualForm";
import SidakInputImportPanel from "../../components/sidak/SidakInputImportPanel";
import type { ParsedImportRow as ImportRowType } from "../../components/sidak/SidakInputImportPanel";
import {
  resolveServiceTypeFromTeam, calculateQAScoreFromTemuan,
} from "../../lib/scoring";

const MONTHS = [
  "Januari", "Februari", "Maret", "April",
  "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember",
];

type Step = "folder" | "agent" | "period" | "list";

const SERVICE_TYPES = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"];
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};

function newEntry() {
  return { uid: Math.random().toString(36).slice(2), indicator_id: "", nilai: 3, ketidaksesuaian: "", sebaiknya: "" };
}

interface AgentEntry {
  id: string;
  nama: string;
  batch_name?: string | null;
  tim?: string | null;
  jabatan?: string | null;
}

export function normalizeAgentsResponse(raw: unknown): AgentEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.agents)) return obj.agents as AgentEntry[];
  if (Array.isArray(raw)) return raw as AgentEntry[];
  return [];
}

export default function SidakInputPage() {
  const [step, setStep] = useState<Step>("folder");
  const [showAllData, setShowAllData] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<QAPeriod | null>(null);
  const [selectedService, setSelectedService] = useState("call");
  const [activeWeight, setActiveWeight] = useState<ServiceWeight | null>(null);

  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "trainer";

  const { data: folders } = useApi<{ id: string; name: string }[]>("/sidak/folders");
  const { data: periods } = useApi<QAPeriod[]>("/sidak/periods");
  const { data: indicators, refetch: refetchIndicators } = useApi<QAIndicator[]>(
    selectedService ? `/sidak/indicators?service_type=${selectedService}` : null,
  );
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [temuan, setTemuan] = useState<QATemuan[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [noTiket, setNoTiket] = useState("");
  const [entries, setEntries] = useState([newEntry()]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNilai, setEditNilai] = useState(3);
  const [editKetidaksesuaian, setEditKetidaksesuaian] = useState("");
  const [editSebaiknya, setEditSebaiknya] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<"download" | "upload">("download");
  const [importRows, setImportRows] = useState<ImportRowType[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rule version snapshot for input
  const [activeRuleVersionId, setActiveRuleVersionId] = useState<string | null>(null);
  const [hasDraftVersion, setHasDraftVersion] = useState(false);
  const [ruleIndicatorsRaw, setRuleIndicatorsRaw] = useState<any[]>([]);
  const [loadingRuleIndicators, setLoadingRuleIndicators] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);

  const fetchRuleVersionIndicators = useCallback(async (svc: string) => {
    setLoadingRuleIndicators(true);
    setActiveRuleVersionId(null);
    setHasDraftVersion(false);
    setRuleIndicatorsRaw([]);
    try {
      const versions = await getApi<RuleVersion[]>(`/sidak/rule-versions?service_type=${svc}`);
      const published = versions?.find((v) => v.status === "published");
      const draft = versions?.find((v) => v.status === "draft");
      if (draft) setHasDraftVersion(true);
      if (published) {
        setActiveRuleVersionId(published.id);
        const allIndicators: QAIndicator[] = indicators ?? [];
        const rawInds = await getApi<any[]>(`/sidak/rule-versions/${published.id}/indicators`);
        if (rawInds && rawInds.length > 0) {
          const mapping = rawInds.map((ri: any) => {
            const legacyIndicator = ri.legacy_indicator_id
              ? allIndicators.find((gi) => gi.id === ri.legacy_indicator_id)
              : allIndicators.find((gi) => gi.name === ri.name);
            return {
              ruleIndicatorId: ri.id,
              name: ri.name,
              category: ri.category,
              bobot: ri.bobot,
              has_na: ri.has_na,
              legacyIndicatorId: legacyIndicator?.id ?? ri.legacy_indicator_id,
              threshold: ri.threshold,
              sort_order: ri.sort_order,
            };
          });
          setRuleIndicatorsRaw(mapping);
        }
      }
    } catch {
      // fallback to global indicators
    } finally {
      setLoadingRuleIndicators(false);
    }
  }, [indicators]);

  useEffect(() => {
    if (selectedService) {
      fetchRuleVersionIndicators(selectedService);
    }
  }, [selectedService, fetchRuleVersionIndicators]);

  const activeIndicators = useMemo(() => {
    if (ruleIndicatorsRaw.length > 0) {
      return ruleIndicatorsRaw.map((ri) => ({
        id: ri.legacyIndicatorId || ri.ruleIndicatorId,
        service_type: selectedService,
        name: ri.name,
        category: ri.category,
        bobot: ri.bobot,
        has_na: ri.has_na,
        ruleIndicatorId: ri.ruleIndicatorId,
        legacyIndicatorId: ri.legacyIndicatorId,
      })) as QAIndicator[];
    }
    return indicators ?? [];
  }, [ruleIndicatorsRaw, indicators, selectedService]);

  const indicatorLookup = useMemo(() => {
    const map = new Map<string, QAIndicator>();
    activeIndicators.forEach((i) => map.set(i.id, i));
    return map;
  }, [activeIndicators]);

  const indicatorLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    activeIndicators.forEach((i) => map.set(i.id, i.name));
    return map;
  }, [activeIndicators]);

  const unlinkedIndicatorIds = useMemo(() => {
    if (ruleIndicatorsRaw.length === 0) return new Set<string>();
    return new Set(
      ruleIndicatorsRaw
        .filter((ri: any) => !ri.legacyIndicatorId)
        .map((ri: any) => ri.ruleIndicatorId as string),
    );
  }, [ruleIndicatorsRaw]);

  const displayFolders = folders ?? [];

  const fetchWeights = useCallback(async (svc: string) => {
    try {
      const res = await getApi<{ data?: ServiceWeight[] }>("/sidak/service-weights");
      if (res?.data) {
        const found = res.data.find((w: ServiceWeight) => w.service_type === svc);
        if (found) setActiveWeight(found);
      }
    } catch {
      // fallback: activeWeight stays null
    }
  }, []);

  const handleAgentClick = async (agent: AgentEntry) => {
    setSelectedAgent(agent);
    setSelectedPeriod(null);
    setTemuan([]);
    setLoading(true);
    setErrorMsg(null);

    try {
      const agentService = resolveServiceTypeFromTeam(agent.tim);
      setSelectedService(agentService);
      await refetchIndicators();
      setActiveWeight(null);
      setStep("period");
    } catch {
      setErrorMsg("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodClick = async (period: QAPeriod) => {
    if (!selectedAgent) return;
    setSelectedPeriod(period);
    setLoading(true);
    setErrorMsg(null);

    try {
      const svc = selectedService;
      const [weightsRes, result] = await Promise.all([
        getApi<{ data?: ServiceWeight[] }>("/sidak/service-weights"),
        getApi<{ items: QATemuan[]; total: number }>(
          `/sidak/temuan?peserta_id=${selectedAgent.id}&period_id=${period.id}&service_type=${svc}&limit=200`,
        ),
      ]);
      if (weightsRes?.data) {
        const found = weightsRes.data.find((w: ServiceWeight) => w.service_type === svc);
        if (found) setActiveWeight(found);
      }
      setTemuan(result.items ?? []);
      setStep("list");
    } catch {
      setErrorMsg("Gagal memuat temuan");
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = useCallback(async (newService: string) => {
    setSelectedService(newService);
    setLoading(true);
    setErrorMsg(null);
    try {
      const [weightsRes] = await Promise.all([
        getApi<{ data?: ServiceWeight[] }>("/sidak/service-weights"),
        refetchIndicators(),
      ]);
      if (weightsRes?.data) {
        const found = weightsRes.data.find((w: ServiceWeight) => w.service_type === newService);
        if (found) setActiveWeight(found);
      }
      setEntries([newEntry()]);
      if (selectedAgent && selectedPeriod) {
        const result = await getApi<{ items: QATemuan[]; total: number }>(
          `/sidak/temuan?peserta_id=${selectedAgent.id}&period_id=${selectedPeriod.id}&service_type=${newService}&limit=200`,
        );
        setTemuan(result.items ?? []);
      }
    } catch {
      setErrorMsg("Gagal memuat data untuk layanan baru");
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, selectedPeriod, refetchIndicators]);

  const handleFolderClick = async (folder: string) => {
    setSelectedFolder(folder);
    setSelectedAgent(null);
    setSelectedPeriod(null);
    setTemuan([]);
    setLoading(true);

    try {
      const year = new Date().getFullYear();
      const result = await getApi<AgentDirectoryResponse>(
        `/sidak/agents?year=${year}`,
      );
      const allAgents = normalizeAgentsResponse(result);
      const folderAgents = allAgents.filter(
        (a) => (a.batch_name ?? "").toLowerCase() === folder.toLowerCase(),
      );
      setAgents(folderAgents);
      setStep("agent");
    } catch {
      setErrorMsg("Gagal memuat agen");
    } finally {
      setLoading(false);
    }
  };

  const loadFolderAndPreSelectAgent = useCallback(async (folder: string, agentId: string) => {
    setIsPrefilling(true);
    setErrorMsg(null);
    try {
      const year = new Date().getFullYear();
      const result = await getApi<AgentDirectoryResponse>(`/sidak/agents?year=${year}`);
      const allAgents = normalizeAgentsResponse(result);
      const folderAgents = allAgents.filter(
        (a) => (a.batch_name ?? "").toLowerCase() === folder.toLowerCase(),
      );
      const found = folderAgents.find((a) => a.id === agentId);
      if (!found) {
        setErrorMsg("Agen tidak ditemukan. Silakan pilih manual.");
        setAgents(folderAgents);
        setSelectedFolder(folder);
        setStep("agent");
        return;
      }
      setAgents(folderAgents);
      setSelectedFolder(folder);
      setSelectedAgent(found);
      const agentService = resolveServiceTypeFromTeam(found.tim);
      setSelectedService(agentService);
      await refetchIndicators();
      setActiveWeight(null);
      setStep("period");
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      setErrorMsg("Gagal memuat data. Silakan pilih manual.");
    } finally {
      setIsPrefilling(false);
    }
  }, [refetchIndicators]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const folder = params.get("folder");
    const agentId = params.get("agent_id");
    if (folder && agentId) {
      loadFolderAndPreSelectAgent(folder, agentId);
    }
  }, [loadFolderAndPreSelectAgent]);

  const updateEntry = (uid: string, patch: Record<string, any>) => {
    setEntries((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, ...patch } : e)),
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
    if (unlinkedIndicatorIds.size > 0 && entries.some((e) => unlinkedIndicatorIds.has(e.indicator_id))) {
      setErrorMsg("Beberapa parameter yang dipilih belum terhubung ke database global. Gunakan parameter yang sudah dilink di halaman Settings QA.");
      return;
    }
    const normalizedTicket = noTiket.trim();
    if (normalizedTicket) {
      const seenManual = new Set<string>();
      for (const entry of entries) {
        if (!entry.indicator_id) continue;
        const key = `${normalizedTicket.toLowerCase()}::${entry.indicator_id}`;
        if (seenManual.has(key)) {
          const indicatorName = activeIndicators.find((i) => i.id === entry.indicator_id)?.name || "parameter tersebut";
          setErrorMsg(`Duplicate temuan ditemukan: No. Tiket ${normalizedTicket} dengan parameter ${indicatorName} muncul lebih dari sekali.`);
          return;
        }
        seenManual.add(key);
      }
    }
    if (!normalizedTicket) {
      const ok = window.confirm(
        "No. Tiket kosong. Setiap temuan tanpa no. tiket dihitung sebagai sesi terpisah. Lanjutkan?",
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
      const preview = await postApi<any>("/sidak/temuan/batch/preview", {
        peserta_id: selectedAgent.id,
        period_id: selectedPeriod.id,
        service_type: selectedService,
        no_tiket: normalizedTicket || null,
        items: temuanList,
      });
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
      const created = await postApi<{ inserted: number; skipped: number; total: number }>("/sidak/temuan/batch", {
        peserta_id: selectedAgent.id,
        period_id: selectedPeriod.id,
        service_type: selectedService,
        no_tiket: normalizedTicket || null,
        items: temuanList,
      });
      const updated = await getApi<{ items: QATemuan[]; total: number }>(
        `/sidak/temuan?peserta_id=${selectedAgent.id}&period_id=${selectedPeriod.id}&service_type=${selectedService}&limit=200`,
      );
      setTemuan(updated.items ?? []);
      resetForm();
      setPreviewResult(null);
      setSuccessMsg(`${created?.inserted ?? 0} temuan berhasil disimpan!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
      setPreviewing(false);
    }
  };

  const startEdit = (item: { id: string; nilai: number; ketidaksesuaian?: string | null; sebaiknya?: string | null }) => {
    setEditingId(item.id);
    setEditNilai(item.nilai);
    setEditKetidaksesuaian(item.ketidaksesuaian ?? "");
    setEditSebaiknya(item.sebaiknya ?? "");
    setDeletingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      await putApi(`/sidak/temuan/${id}`, {
        nilai: editNilai,
        ketidaksesuaian: editKetidaksesuaian || null,
        sebaiknya: editSebaiknya || null,
      });
      setTemuan((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, nilai: editNilai, ketidaksesuaian: editKetidaksesuaian, sebaiknya: editSebaiknya }
            : t,
        ),
      );
      setEditingId(null);
      setSuccessMsg("Temuan berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setEditingId(null);
      return;
    }
    try {
      await deleteApi(`/sidak/temuan/${id}`);
      setTemuan((prev) => prev.filter((t) => t.id !== id));
      setDeletingId(null);
      setSuccessMsg("Temuan berhasil dihapus!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message);
      setDeletingId(null);
    }
  };

  const groupedTemuan = useMemo(() => {
    const groups: { key: string; label: string | null; items: QATemuan[] }[] = [];
    const keyToGroup = new Map<string, number>();
    temuan.forEach((t) => {
      const key = t.no_tiket?.trim() || `__solo_${t.id}`;
      if (!keyToGroup.has(key)) {
        keyToGroup.set(key, groups.length);
        groups.push({ key, label: t.no_tiket?.trim() || null, items: [] });
      }
      groups[keyToGroup.get(key)!].items.push(t);
    });
    return groups;
  }, [temuan]);

  const liveScore = useMemo(() => {
    if (!activeIndicators.length || !activeWeight) return null;
    return calculateQAScoreFromTemuan(
      activeIndicators,
      temuan.map((t) => ({ indicator_id: t.indicator_id, nilai: t.nilai, no_tiket: t.no_tiket })),
      activeWeight,
    );
  }, [temuan, activeIndicators, activeWeight, indicatorLookup]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    activeIndicators.forEach((i) => {
      if (i.category) map.set(i.id, i.category);
    });
    return map;
  }, [activeIndicators]);

  const scoringMode = activeWeight?.scoring_mode ?? "weighted";
  const periodLabel = selectedPeriod ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "";

  const handleImportClose = useCallback(() => {
    setShowImport(false);
    setImportRows([]);
    setImportFile(null);
  }, []);

  const handleDownloadTemplate = async () => {
    if (activeIndicators.length === 0 || !selectedAgent || !selectedPeriod) return;
    setGeneratingTemplate(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "SIDAK";
      wb.created = new Date();

      const HEADER_FILL: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
      const HEADER_FONT: any = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

      const wsParams = wb.addWorksheet("_Params");
      wsParams.state = "veryHidden";
      activeIndicators.forEach((ind, i) => {
        wsParams.getCell(`A${i + 1}`).value = ind.name;
      });

      const ws = wb.addWorksheet("Input Temuan");
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns = [
        { key: "tiket", header: "No. Tiket", width: 18 },
        { key: "param", header: "Parameter", width: 48 },
        { key: "nilai", header: "Nilai (0-3)", width: 13 },
        { key: "ktdk", header: "Ketidaksesuaian", width: 42 },
        { key: "sbknya", header: "Sebaiknya", width: 42 },
      ];
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell: any) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      activeIndicators.slice(0, 3).forEach((ind, i) => {
        ws.addRow({
          tiket: `L${selectedPeriod.year}${String(selectedPeriod.month).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`,
          param: ind.name,
          nilai: i === 0 ? 2 : i === 1 ? 1 : 0,
          ktdk: i === 0 ? "Contoh ketidaksesuaian" : "",
          sbknya: i === 0 ? "Contoh perbaikan" : "",
        });
      });

      const paramCount = activeIndicators.length;
      for (let r = 2; r <= 101; r++) {
        ws.getCell(`B${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`_Params!$A$1:$A$${paramCount}`],
        };
        ws.getCell(`C${r}`).dataValidation = {
          type: "whole",
          operator: "between",
          allowBlank: true,
          formulae: [0, 3],
        };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Template_SIDAK_${selectedAgent.nama.replace(/\s/g, "_")}_${MONTHS[selectedPeriod.month - 1]}_${selectedPeriod.year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("Gagal membuat template Excel.");
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeIndicators.length === 0) return;
    setImportFile(file);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const sheetName = wb.SheetNames.find((n: string) => n === "Input Temuan") ?? wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const paramMap = new Map(activeIndicators.map((i) => [i.name.toLowerCase().trim(), i]));
          const result: ParsedImportRow[] = [];

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || (Array.isArray(row) && row.every((c) => c === "" || c === null || c === undefined)))
              continue;
            const no_tiket = String(row[0] ?? "").trim();
            const paramName = String(row[1] ?? "").trim();
            const nilaiRaw = row[2];
            const ketidaksesuaian = String(row[3] ?? "").trim();
            const sebaiknya = String(row[4] ?? "").trim();
            let error = "";
            let indicator_id: string | null = null;
            let nilai: number | null = null;

            const matched = paramMap.get(paramName.toLowerCase());
            if (!paramName) error = "Parameter kosong";
            else if (!matched) error = `Parameter "${paramName}" tidak dikenali`;
            else indicator_id = matched.id;

            const nilaiNum = Number(nilaiRaw);
            if (nilaiRaw === "" || nilaiRaw === null || nilaiRaw === undefined) {
              nilai = 3;
            } else if (isNaN(nilaiNum) || ![0, 1, 2, 3].includes(nilaiNum)) {
              error = `Nilai "${nilaiRaw}" tidak valid (harus 0-3)`;
            } else {
              nilai = nilaiNum;
            }

            result.push({
              rowNum: i + 1,
              no_tiket,
              paramName,
              indicator_id,
              nilai,
              ketidaksesuaian,
              sebaiknya,
              error,
            });
          }

          setImportRows(result);
          setImportTab("upload");
        } catch {
          setErrorMsg("Gagal membaca file Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      setErrorMsg("Gagal membaca file.");
    } finally {
      setParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!selectedAgent || !selectedPeriod || importRows.length === 0) return;
    const invalid = importRows.filter((r) => r.error);
    if (invalid.length > 0) {
      setErrorMsg("Terdapat baris dengan error. Perbaiki semua error terlebih dahulu.");
      return;
    }
    if (importRows.some((r) => !r.indicator_id)) {
      setErrorMsg("Terdapat baris dengan parameter tidak valid.");
      return;
    }
    if (unlinkedIndicatorIds.size > 0 && importRows.some((r) => r.indicator_id && unlinkedIndicatorIds.has(r.indicator_id))) {
      setErrorMsg("Terdapat parameter yang belum terhubung ke database global. Gunakan parameter yang sudah dilink di halaman Settings QA.");
      return;
    }
    setImporting(true);
    setErrorMsg(null);
    try {
      const valid = importRows.filter((r) => !r.error && r.indicator_id && r.nilai !== null);
      const importItems = valid.map((r) => ({
        indicator_id: r.indicator_id!,
        nilai: r.nilai!,
        ketidaksesuaian: r.ketidaksesuaian || null,
        sebaiknya: r.sebaiknya || null,
        no_tiket: r.no_tiket || null,
      }));
      const preview = await postApi<any>("/sidak/temuan/batch/preview", {
        peserta_id: selectedAgent.id,
        period_id: selectedPeriod.id,
        service_type: selectedService,
        items: importItems,
      });
      if (preview.stats.invalid_count > 0) {
        setErrorMsg(
          `${preview.stats.invalid_count} parameter tidak valid di server. Periksa kembali data import.`
        );
        return;
      }
      if (preview.stats.skipped_count > 0) {
        const ok = window.confirm(
          `${preview.stats.skipped_count} baris sudah ada (duplikat) dan akan di-skip. ${preview.stats.valid_count} akan diimport. Lanjutkan?`
        );
        if (!ok) return;
      }
      const created = await postApi<{ inserted: number; skipped: number; total: number }>("/sidak/temuan/batch", {
        peserta_id: selectedAgent.id,
        period_id: selectedPeriod.id,
        service_type: selectedService,
        items: importItems,
      });
      const updated = await getApi<{ items: QATemuan[]; total: number }>(
        `/sidak/temuan?peserta_id=${selectedAgent.id}&period_id=${selectedPeriod.id}&service_type=${selectedService}&limit=200`,
      );
      setTemuan(updated.items ?? []);
      setShowImport(false);
      setImportRows([]);
      setSuccessMsg(`${created?.inserted ?? 0} temuan berhasil diimport!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setImporting(false);
    }
  };

  const resetToStep = (target: Step) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    resetForm();
    setDeletingId(null);
    setEditingId(null);
    if (target === "folder") {
      setSelectedFolder(null);
      setSelectedAgent(null);
      setSelectedPeriod(null);
      setTemuan([]);
    } else if (target === "agent") {
      setSelectedAgent(null);
      setSelectedPeriod(null);
      setTemuan([]);
    } else if (target === "period") {
      setSelectedPeriod(null);
      setTemuan([]);
    }
    setStep(target);
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className={`mx-auto space-y-6 ${step === "list" ? "max-w-6xl" : "max-w-3xl"}`}>
          {/* COMPACT BREADCRUMB */}
          <div className="flex items-center gap-1 text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => resetToStep("folder")}
              className={`transition-colors shrink-0 ${step === "folder" ? "text-primary" : "text-muted-foreground/60 hover:text-primary"}`}
            >
              Folder
            </button>
            <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            <button
              type="button"
              onClick={() => selectedFolder && resetToStep("agent")}
              disabled={!selectedFolder}
              className={`transition-colors truncate max-w-[120px] ${step === "agent" ? "text-primary" : selectedFolder ? "text-muted-foreground hover:text-primary" : "text-muted-foreground/30"}`}
            >
              {selectedFolder || "Agen"}
            </button>
            {selectedFolder && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <button
                  type="button"
                  onClick={() => selectedAgent && resetToStep("period")}
                  disabled={!selectedAgent}
                  className={`transition-colors truncate max-w-[120px] ${step === "period" ? "text-primary" : selectedAgent ? "text-muted-foreground hover:text-primary" : "text-muted-foreground/30"}`}
                >
                  {selectedAgent?.nama || "Agen"}
                </button>
              </>
            )}
            {selectedAgent && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <span className={`truncate max-w-[120px] ${step === "list" ? "text-primary" : "text-muted-foreground/60"}`}>
                  {selectedPeriod ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "Periode"}
                </span>
              </>
            )}
          </div>

          {/* MESSAGES */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-sm flex items-center gap-2"
              >
                <Check className="w-4 h-4 shrink-0" />
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* STEP 1: FOLDER SELECTION */}
          {step === "folder" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground/90">
                    Pilih Folder
                  </h2>
                </div>
                <button
                  data-testid="show-all-toggle"
                  type="button"
                  onClick={() => {
                    setShowAllData(!showAllData);
                    setSelectedFolder(null);
                    setSelectedAgent(null);
                    setSelectedPeriod(null);
                    setTemuan([]);
                    setStep("folder");
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${
                    showAllData
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-background border-border/50 text-muted-foreground hover:border-amber-400"
                  }`}
                >
                  {showAllData ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showAllData ? "Data Terfilter" : "Tampilkan Semua"}
                </button>
              </div>

              {displayFolders.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada folder"
                  description="Tidak ada folder yang tersedia untuk input temuan."
                />
              ) : (
                <div className="grid gap-2">
                  {displayFolders.map((f, i) => (
                    <motion.button
                      key={f.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      type="button"
                      onClick={() => handleFolderClick(f.name)}
                      className="flex items-center gap-4 px-5 py-4 bg-card border border-border hover:border-primary/40 rounded-2xl group transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FolderOpen className="w-5 h-5" />
                      </div>
                      <span className="flex-1 font-semibold text-sm text-foreground/90 truncate">
                        {f.name}
                      </span>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 2: AGENT SELECTION */}
          {step === "agent" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground/90">
                    Pilih Agen
                  </h2>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-card/50 border border-border animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-foreground/10 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-28 bg-foreground/10 rounded" />
                        <div className="h-2.5 w-20 bg-foreground/10 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : agents.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Tidak ada agen"
                  description={`Tidak ditemukan agen untuk folder "${selectedFolder}".`}
                />
              ) : (
                <div className="grid gap-2">
                  {agents.map((agent, i) => (
                    <motion.button
                      key={agent.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      type="button"
                      onClick={() => handleAgentClick(agent)}
                      className="flex items-center gap-4 px-5 py-4 bg-card border border-border hover:border-primary/40 rounded-2xl group transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm shrink-0">
                        {agent.nama.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-foreground/90 truncate">
                          {agent.nama}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {agent.batch_name || agent.tim || "-"}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 3: PERIOD SELECTION */}
          {step === "period" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground/90">
                    Pilih Periode
                  </h2>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-card/50 border border-border animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-foreground/10 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 bg-foreground/10 rounded" />
                        <div className="h-2.5 w-16 bg-foreground/10 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !periods || periods.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada periode"
                  description="Tidak ada periode audit yang tersedia."
                />
              ) : (
                <div className="grid gap-2">
                  {periods.map((p, i) => (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      type="button"
                      onClick={() => handlePeriodClick(p)}
                      className="flex items-center gap-4 px-5 py-4 bg-card border border-border hover:border-primary/40 rounded-2xl group transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-black text-sm shrink-0">
                        {String(p.month).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-foreground/90">
                          {MONTHS[p.month - 1]}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.year}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 4: TEMUAN LIST */}
          {step === "list" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => resetToStep("period")}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">
                      Daftar Temuan
                    </h1>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1 ml-9">
                    {selectedAgent?.nama}
                    {" · "}
                    {selectedPeriod && `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}`}
                    {" · "}
                    {SERVICE_LABELS[selectedService]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {role !== "leader" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowImport(!showImport);
                          setImportTab("download");
                          setImportRows([]);
                          setImportFile(null);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Import
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Konfigurasi Audit card */}
              <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
                  Konfigurasi Audit
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
                      Layanan Audit
                    </label>
                    <select
                      value={selectedService}
                      onChange={(e) => handleServiceChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
                    >
                      {SERVICE_TYPES.map((st) => (
                        <option key={st} value={st}>
                          {SERVICE_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
                      Tim Agent
                    </label>
                    <div className="px-3 py-2 rounded-xl border border-border bg-muted/20 text-sm text-foreground/70">
                      {selectedAgent?.tim || selectedAgent?.batch_name || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Estimasi Skor card */}
              <SidakInputScoreCard
                liveScore={liveScore}
                activeWeight={activeWeight}
                agentName={selectedAgent?.nama ?? ""}
                periodLabel={selectedPeriod ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}` : ""}
              />

              {/* Draft warning banner */}
              {hasDraftVersion && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-sm flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Ada draft parameter yang belum dipublikasikan. Input temuan saat ini menggunakan parameter versi terakhir yang published.
                </motion.div>
              )}

              {/* Info bar */}
              <div className="p-3 rounded-xl bg-card/50 border border-border text-sm text-muted-foreground flex items-center gap-3">
                <span>Total temuan: <strong className="text-foreground">{temuan.length}</strong></span>
                <span className="text-muted-foreground/30">|</span>
                <span>Group: <strong className="text-foreground">{groupedTemuan.length}</strong></span>
              </div>

              {/* ADD FORM */}
              <AnimatePresence>
                {showForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <SidakInputManualForm
                      entries={entries}
                      noTiket={noTiket}
                      onSetNoTiket={setNoTiket}
                      onUpdateEntry={updateEntry}
                      onAddEntry={() => setEntries((prev) => [...prev, newEntry()])}
                      onRemoveEntry={(uid) => setEntries((prev) => prev.filter((e) => e.uid !== uid))}
                      onSave={handleSave}
                      onCancel={resetForm}
                      activeIndicators={activeIndicators}
                      scoringMode={scoringMode}
                      saving={saving}
                      previewing={previewing}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* IMPORT PANEL */}
              <AnimatePresence>
                {showImport && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <SidakInputImportPanel
                      show={showImport}
                      onClose={handleImportClose}
                      importTab={importTab}
                      onSetImportTab={setImportTab}
                      importRows={importRows}
                      importFile={importFile}
                      generatingTemplate={generatingTemplate}
                      parsing={parsing}
                      importing={importing}
                      onDownloadTemplate={handleDownloadTemplate}
                      onFileUpload={handleFileUpload}
                      onImportSave={handleImportSave}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* TEMUAN LIST */}
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-2xl bg-card/50 border border-border animate-pulse"
                    />
                  ))}
                </div>
              ) : groupedTemuan.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada temuan"
                  description="Belum ada data temuan untuk agen ini pada periode dan layanan yang dipilih."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Temuan
                    </button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {groupedTemuan.map((group, gIdx) => (
                    <TemuanGroupCard
                      key={group.key}
                      group={group as any}
                      gIdx={gIdx}
                      indicatorLabelMap={indicatorLabelMap}
                      categoryMap={categoryMap}
                      editingId={editingId}
                      editNilai={editNilai}
                      editKetidaksesuaian={editKetidaksesuaian}
                      editSebaiknya={editSebaiknya}
                      deletingId={deletingId}
                      canEdit={role !== "leader"}
                      onStartEdit={startEdit}
                      onCancelEdit={cancelEdit}
                      onSaveEdit={handleSaveEdit}
                      onDelete={handleDelete}
                      setEditNilai={setEditNilai}
                      setEditKetidaksesuaian={setEditKetidaksesuaian}
                      setEditSebaiknya={setEditSebaiknya}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
