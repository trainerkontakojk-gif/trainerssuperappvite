import { useState, useEffect, useRef } from "react";
import { Phone, Settings, History, Play, BarChart3 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { TelefunAppSettings } from "./telefunSettings";
import {
  DEFAULT_TELEFUN_SETTINGS,
  resolveFinalIdentity,
  parseTelefunSettings,
} from "./telefunSettings";
import { SettingsModal } from "./components/SettingsModal";
import { PhoneInterface } from "./components/PhoneInterface";
import { HistoryModal } from "./components/HistoryModal";
import { ReviewModal } from "./components/ReviewModal";
import { UsageModal } from "../ketik/components/UsageModal";
import { postApi, putApi, patchApi } from "../../hooks/useApi";
import { notify } from "../../lib/toast";
import { supabase } from "../../lib/supabase";
import type { CallRecord } from "./types";
import ModuleWorkspaceIntro from "../../components/ModuleWorkspaceIntro";

const accentClassName = "text-violet-600";
const accentSoftClassName = "bg-violet-100";

function formatCompactIdr(value: number): string {
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toFixed(0)}rb`;
  return `Rp${value}`;
}

function formatUsageDeltaLabel(delta: { costIdr: number; totalTokens: number; totalCalls: number }): string {
  return `+${formatCompactIdr(delta.costIdr)}`;
}

const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";

function getToken(): string | null {
  return (
    localStorage.getItem("auth_token") ?? localStorage.getItem("supabase_token")
  );
}

export default function TelefunLanding() {
  const [view, setView] = useState<"home" | "chat">("home");
  const [settings, setSettings] = useState<TelefunAppSettings>(
    DEFAULT_TELEFUN_SETTINGS,
  );
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [reviewRecord, setReviewRecord] = useState<CallRecord | null>(null);

  const [activeSessionConfig, setActiveSessionConfig] =
    useState<TelefunAppSettings | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<{
    title: string;
    instruction: string;
  } | null>(null);
  const [history, setHistory] = useState<CallRecord[]>([]);

  const [sessionDelta, setSessionDelta] = useState<{
    costIdr: number;
    totalTokens: number;
    totalCalls: number;
  } | null>(null);
  const sessionBaselineRef = useRef<{
    total_calls: number;
    total_tokens: number;
    total_cost_idr: number;
  } | null>(null);
  const sessionRunIdRef = useRef(0);
  const optimisticRecordIdRef = useRef<string | null>(null);

  // Auto-sync reviewRecord when history updates
  useEffect(() => {
    if (reviewRecord) {
      const updated = history.find((r) => r.id === reviewRecord.id);
      if (updated && updated !== reviewRecord) {
        setReviewRecord(updated);
      }
    }
  }, [history, reviewRecord]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/telefun/settings`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json();
        if (cancelled) return;

        if (json?.success && json.settings) {
          setSettings(parseTelefunSettings(json.settings));
        } else {
          setSettings(DEFAULT_TELEFUN_SETTINGS);
        }
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_TELEFUN_SETTINGS);
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    };

    const loadHistory = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/telefun/sessions`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json();
        if (!cancelled && json?.success) {
          const dbRecords: CallRecord[] = json.data.map((row: any) => ({
            id: row.id,
            date: row.created_at || row.date,
            url: row.recording_url || "",
            consumerName: row.consumer_name || "",
            consumerPhone: row.consumer_phone,
            consumerCity: row.consumer_city,
            scenarioTitle: row.scenario_title || "",
            duration: row.duration || row.duration_seconds || 0,
            configuredDuration: row.configured_duration || 0,
            recordingPath: row.recording_path,
            agentRecordingPath: row.agent_recording_path,
            score: row.score || row.voice_dashboard_metrics?.score || 0,
            feedback: row.feedback || undefined,
            voiceAssessment: row.voice_assessment || null,
            sessionMetrics: row.session_metrics || null,
            realisticModeEnabled: row.realistic_mode_enabled,
            voiceDashboardMetrics: row.voice_dashboard_metrics,
            personaConfig: row.persona_config,
            disruptionConfig: row.disruption_config,
            disruptionResults: row.disruption_results,
          }));

          let localRecords: CallRecord[] = [];
          const savedHistory = localStorage.getItem("telefun_history");
          if (savedHistory) {
            try {
              localRecords = JSON.parse(savedHistory) as CallRecord[];
            } catch {
              // ignore
            }
          }

          const merged = [
            ...dbRecords,
            ...localRecords.filter(
              (lr) => !new Set(dbRecords.map((r) => r.id)).has(lr.id),
            ),
          ].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );

          setHistory(merged);
          if (merged.length > 0) {
            localStorage.setItem("telefun_history", JSON.stringify(merged));
          }
        }
      } catch {
        // ignore
      }
    };

    loadSettings();
    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleSaveSettings = async (newSettings: TelefunAppSettings) => {
    try {
      await putApi("/telefun/settings", newSettings);
      setSettings(newSettings);
      notify.success("Pengaturan Telefun berhasil disimpan");
    } catch {
      notify.error("Gagal menyimpan pengaturan");
    }
  };

  const startCall = async () => {
    const token = getToken();
    if (!token) {
      notify.error("Token tidak ditemukan. Silakan login terlebih dahulu.");
      return;
    }

    const activeScenarios = settings.scenarios.filter((s) => s.isActive);
    if (activeScenarios.length === 0) {
      notify.error("Pilih minimal satu skenario di Pengaturan.");
      setIsSettingsOpen(true);
      return;
    }

    const randomScenario =
      activeScenarios[Math.floor(Math.random() * activeScenarios.length)];
    setActiveScenario(randomScenario);

    const consumerType =
      settings.preferredConsumerTypeId === "random"
        ? settings.consumerTypes[
            Math.floor(Math.random() * settings.consumerTypes.length)
          ]
        : settings.consumerTypes.find(
            (ct) => ct.id === settings.preferredConsumerTypeId,
          ) || settings.consumerTypes[0];

    const identity = resolveFinalIdentity(settings.identitySettings);
    const voiceName = identity.voiceName || settings.voiceName;

    const sessionConfig: TelefunAppSettings = {
      ...settings,
      scenarioTitle: randomScenario.title,
      systemInstruction: randomScenario.instruction,
      consumerName: identity.name,
      consumerGender: identity.gender,
      voiceName,
    };

    const runId = ++sessionRunIdRef.current;
    setSessionDelta(null);
    sessionBaselineRef.current = null;

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/ai/usage/summary?module=telefun`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (json?.success && json.data && runId === sessionRunIdRef.current) {
          sessionBaselineRef.current = {
            total_calls: json.data.total_calls || 0,
            total_tokens: json.data.total_tokens || 0,
            total_cost_idr: json.data.total_cost_idr || 0,
          };
        }
      } catch {
        // best-effort
      }
    })();

    try {
      const res = await postApi<any>("/telefun/sessions", {
        scenario_title: randomScenario.title,
        consumer_name: identity.name,
        consumer_gender: identity.gender,
        consumer_phone: identity.phone,
        consumer_city: identity.city,
        realistic_mode_enabled: settings.realisticModeEnabled,
        persona_config: {
          consumerType: consumerType?.name || consumerType?.id,
        },
        disruption_config: settings.realisticModeDisruptionTypes,
      });
      if (res?.id) {
        setActiveSessionId(res.id);
      }
    } catch (e) {
      console.warn("Failed to create session upfront", e);
    }

    setActiveSessionConfig(sessionConfig);
    setView("chat");
  };

  const handleEndCall = () => {
    setView("home");
    setActiveSessionConfig(null);
  };

  const handleRecordingReady = async (
    url: string | null,
    consumerName: string,
    duration: number,
    fullBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: any,
  ) => {
    const sessionId = activeSessionId;
    if (!sessionId) return;

    const finalScenario = activeScenario;
    const sessionConfig = activeSessionConfig;

    // Generate score and feedback locally
    let score = 0;
    let feedback = "";

    try {
      const scoring = await postApi<{ score: number; feedback: string }>(
        "/telefun/score/" + sessionId,
        {},
      );
      if (scoring) {
        score = scoring.score || 0;
        feedback = scoring.feedback || "";
      }
    } catch {
      console.warn("Scoring failed, proceeding without score");
    }

    const optimisticId = optimisticRecordIdRef.current || sessionId;
    optimisticRecordIdRef.current = optimisticId;

    try {
      let recordingPath: string | undefined;
      let agentRecordingPath: string | undefined;

      if (fullBlob) {
        const path = `${sessionId}/full_call.webm`;
        const { data } = await supabase.storage
          .from("telefun-recordings")
          .upload(path, fullBlob, {
            contentType: "audio/webm",
            upsert: true,
          });
        if (data?.path) recordingPath = data.path;
      }

      if (agentBlob) {
        const path = `${sessionId}/agent_only.webm`;
        const { data } = await supabase.storage
          .from("telefun-recordings")
          .upload(path, agentBlob, {
            contentType: "audio/webm",
            upsert: true,
          });
        if (data?.path) agentRecordingPath = data.path;
      }

      await patchApi(`/telefun/sessions/${sessionId}`, {
        status: "completed",
        duration_seconds: duration,
        session_metrics: metrics,
        score,
        feedback,
      });

      if (recordingPath || agentRecordingPath) {
        await postApi("/telefun/finalize-recording", {
          sessionId,
          recordingPath,
          agentRecordingPath,
        });
      }

      const newRecord: CallRecord = {
        id: sessionId,
        date: new Date().toISOString(),
        url: url || "",
        consumerName: sessionConfig?.consumerName || consumerName,
        scenarioTitle:
          finalScenario?.title || sessionConfig?.scenarioTitle || "Custom",
        duration,
        recordingPath,
        agentRecordingPath,
        score,
        feedback,
        sessionMetrics: metrics,
        realisticModeEnabled: sessionConfig?.realisticModeEnabled,
      };

      setHistory((prev) => {
        const withoutOptimistic = prev.filter((r) => r.id !== optimisticId);
        const alreadyExists = withoutOptimistic.some((r) => r.id === sessionId);
        const merged = alreadyExists
          ? withoutOptimistic
          : [newRecord, ...withoutOptimistic];
        localStorage.setItem("telefun_history", JSON.stringify(merged));
        return merged;
      });

      setReviewRecord(newRecord);
      setIsReviewOpen(true);
    } catch (e) {
      console.error("Failed to finalize session", e);
      notify.error("Gagal menyimpan sesi");

      const fallbackRecord: CallRecord = {
        id: optimisticId,
        date: new Date().toISOString(),
        url: url || "",
        consumerName: sessionConfig?.consumerName || consumerName,
        scenarioTitle:
          finalScenario?.title || sessionConfig?.scenarioTitle || "Custom",
        duration,
      };

      setReviewRecord(fallbackRecord);
      setIsReviewOpen(true);
    } finally {
      setActiveSessionId(null);
      setActiveScenario(null);
    }

    const runId = sessionRunIdRef.current;
    const baseline = sessionBaselineRef.current;

    void (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        let retries = 5;
        while (retries > 0 && runId === sessionRunIdRef.current) {
          try {
            const token = getToken();
            const res = await fetch(
              `${API_BASE}/ai/usage/summary?module=telefun`,
              {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              },
            );
            const json = await res.json();
            if (json?.success && json.data) {
              const delta = {
                totalCalls:
                  (json.data.total_calls || 0) - (baseline?.total_calls || 0),
                totalTokens:
                  (json.data.total_tokens || 0) - (baseline?.total_tokens || 0),
                costIdr:
                  (json.data.total_cost_idr || 0) -
                  (baseline?.total_cost_idr || 0),
              };
              if (delta.totalCalls > 0) {
                setSessionDelta(delta);
                break;
              }
            }
          } catch {
            // retry
          }
          retries--;
          if (retries > 0)
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch {
        // best-effort
      }
    })();
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`${API_BASE}/telefun/history/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      setHistory((prev) => {
        const updated = prev.filter((h) => h.id !== id);
        localStorage.setItem("telefun_history", JSON.stringify(updated));
        return updated;
      });
      notify.success("Sesi dihapus");
    } catch {
      notify.error("Gagal menghapus sesi");
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch(`${API_BASE}/telefun/history`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      setHistory([]);
      localStorage.removeItem("telefun_history");
      notify.success("Riwayat dibersihkan");
    } catch {
      notify.error("Gagal membersihkan riwayat");
    }
  };

  const handleReviewSession = (record: CallRecord) => {
    setReviewRecord(record);
    setIsReviewOpen(true);
  };

  const handleAssessmentComplete = (sessionId: string, assessment: any) => {
    setHistory((prev) => {
      const updated = prev.map((r) =>
        r.id === sessionId ? { ...r, voiceAssessment: assessment } : r,
      );
      localStorage.setItem("telefun_history", JSON.stringify(updated));
      return updated;
    });
    if (reviewRecord?.id === sessionId) {
      setReviewRecord((prev) =>
        prev ? { ...prev, voiceAssessment: assessment } : null,
      );
    }
  };

  return (
    <>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onDeleteSession={handleDeleteSession}
        onClearHistory={handleClearHistory}
        onReviewSession={handleReviewSession}
      />

      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        record={reviewRecord}
        onAssessmentComplete={handleAssessmentComplete}
      />

      <UsageModal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        module="telefun"
        sessionDelta={sessionDelta}
      />

      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="relative z-10 py-6"
          >
            <ModuleWorkspaceIntro
              eyebrow="Voice Simulation Trainer"
              title="Latih penanganan keluhan telepon dalam workspace yang fokus."
              description="Mulai simulasi panggilan telepon dengan konsumen bertenaga AI untuk menguji dan melatih kemampuan penanganan keluhan secara langsung."
              accentClassName={accentClassName}
              accentSoftClassName={accentSoftClassName}
              icon={<Phone className="h-8 w-8 text-violet-600" />}
              actions={
                <>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={startCall}
                    disabled={settingsLoading}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all bg-violet-600 text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-600/20"
                  >
                    {settingsLoading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>{settingsLoading ? "Memulai..." : "Mulai Panggilan"}</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsSettingsOpen(true)}
                    disabled={settingsLoading}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <Settings className="h-4 w-4 opacity-60" />
                    <span>Pengaturan</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsHistoryOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <History className="h-4 w-4 opacity-60" />
                    <span>Riwayat</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsUsageOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <BarChart3 className="h-4 w-4 opacity-60" />
                    <span>Usage Bulan Ini</span>
                    {sessionDelta &&
                      (sessionDelta.costIdr > 0 ||
                        sessionDelta.totalTokens > 0 ||
                        sessionDelta.totalCalls > 0) && (
                        <span className="ml-auto text-[10px] font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                          {formatUsageDeltaLabel(sessionDelta)} sesi terakhir
                        </span>
                      )}
                  </motion.button>
                </>
              }
            />
          </motion.div>
        )}

        {view === "chat" && activeSessionConfig && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950"
          >
            <PhoneInterface
              config={activeSessionConfig}
              onEndSession={handleEndCall}
              onRecordingReady={handleRecordingReady}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
