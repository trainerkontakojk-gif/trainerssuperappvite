import { useState, useRef, useMemo, useEffect } from "react";
import { useParams, Link } from "@tanstack/react-router";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  ChevronLeft,
  MessageSquare,
  Star,
  AlertTriangle,
  Zap,
  Lightbulb,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { useApi, postApi, deleteApi } from "../../hooks/useApi";
import type {
  TelefunHistory,
  TelefunCoachingSummary,
  TelefunReplayAnnotation,
} from "@trainers/types";
import { notify } from "../../lib/toast";

export default function TelefunReplay() {
  const { id } = useParams({ from: "/telefun/replay/$id" });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const barHeights = useMemo(
    () => {
      let seed = 0;
      for (const char of id) {
        seed = (seed * 31 + char.charCodeAt(0)) % 9973;
      }

      return Array.from({ length: 100 }, (_, index) => {
        const wave = Math.sin((index + 1) * 12.9898 + seed * 78.233);
        return 20 + Math.abs(wave) * 80;
      });
    },
    [id],
  );

  const { data: session, loading: loadingSession } = useApi<TelefunHistory>(
    `/telefun/history/${id}`,
  );
  const { data: summary } = useApi<TelefunCoachingSummary>(
    `/telefun/coaching-summary/${id}`,
  );
  const { data: annotations, refetch: refetchAnnotations } = useApi<
    TelefunReplayAnnotation[]
  >(`/telefun/annotations/${id}`);

  const [audioUrl, setAudioUrl] = useState<string>("");

  useEffect(() => {
    if (session?.id) {
      const fetchAudio = async () => {
        const token =
          localStorage.getItem("auth_token") ??
          localStorage.getItem("supabase_token");
        const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";
        try {
          const res = await fetch(
            `${API_BASE}/telefun/recording/${session.id}`,
            {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            },
          );
          const json = await res.json();
          if (json?.success && json.url) {
            setAudioUrl(json.url);
          }
        } catch (e) {
          console.error("Failed to load audio URL", e);
        }
      };
      fetchAudio();
    }
  }, [session?.id]);

  const [newAnnotation, setNewAnnotation] = useState<{
    text: string;
    category: TelefunReplayAnnotation["category"];
  }>({ text: "", category: "strength" });
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);

  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleAddAnnotation = async () => {
    if (!newAnnotation.text.trim()) return;
    setIsAddingAnnotation(true);
    try {
      await postApi(`/telefun/annotations/${id}`, {
        timestamp_ms: Math.round(currentTime * 1000),
        category: newAnnotation.category,
        moment: `Moment at ${formatTime(currentTime)}`,
        text: newAnnotation.text,
        is_manual: true,
      });
      setNewAnnotation({ text: "", category: "strength" });
      await refetchAnnotations();
    } catch (err) {
      notify.error("Gagal menambah anotasi.");
    } finally {
      setIsAddingAnnotation(false);
    }
  };

  const handleDeleteAnnotation = async (annoId: string) => {
    try {
      await deleteApi(`/telefun/annotations/${annoId}`);
      await refetchAnnotations();
    } catch (err) {
      notify.error("Gagal menghapus anotasi.");
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loadingSession) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Sesi tidak ditemukan.</p>
        <Link
          to="/telefun"
          className="text-indigo-600 hover:underline mt-4 inline-block"
        >
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          to="/telefun"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft size={16} /> Kembali
        </Link>
        <div className="text-right">
          <h1 className="text-xl font-bold">Replay Sesi Telefun</h1>
          <p className="text-xs text-gray-400">
            {new Date(session.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Player Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border shadow-sm p-8 space-y-8">
            {/* Audio Visualizer Placeholder */}
            <div className="h-24 bg-gray-50 rounded-xl relative overflow-hidden flex items-center justify-center">
              <div className="flex items-end gap-0.5 h-12 w-full px-4">
                {Array.from({ length: 100 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-all ${
                      (i / 100) * duration <= currentTime
                        ? "bg-indigo-500"
                        : "bg-gray-200"
                    }`}
                    style={{ height: `${barHeights[i]}%` }}
                  />
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleTogglePlay}
                  className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
                >
                  {isPlaying ? (
                    <Pause size={24} fill="currentColor" />
                  ) : (
                    <Play size={24} fill="currentColor" className="ml-1" />
                  )}
                </button>
                <div className="text-sm font-mono">
                  <span className="font-bold text-gray-900">
                    {formatTime(currentTime)}
                  </span>
                  <span className="text-gray-400">
                    {" "}
                    / {formatTime(duration)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleSeek(0)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <Volume2 size={18} className="text-gray-400" />
                  <div className="w-24 h-1 bg-gray-200 rounded-full">
                    <div className="w-3/4 h-full bg-indigo-500 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
            />
          </div>

          {/* Coaching Summary */}
          <div className="bg-white rounded-2xl border shadow-sm p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-500" />
              AI Coaching Recommendations
            </h2>
            <div className="grid gap-3">
              {summary?.recommendations &&
              Array.isArray(summary.recommendations) ? (
                summary.recommendations.slice(0, 5).map((rec, i) => (
                  <div
                    key={i}
                    className="flex gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100"
                  >
                    <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-700 shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-amber-800">{rec.text}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                        Prioritas {rec.priority}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Belum ada ringkasan coaching.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Annotations Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border shadow-sm flex flex-col h-full max-h-[600px]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare size={16} className="text-indigo-600" />
                Annotations
              </h2>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                {annotations?.length || 0}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {annotations?.map((anno) => (
                <div
                  key={anno.id}
                  className="group relative p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => handleSeek(anno.timestamp_ms / 1000)}
                      className="text-[10px] font-bold text-indigo-600 hover:underline"
                    >
                      {formatTime(anno.timestamp_ms / 1000)}
                    </button>
                    <div className="flex items-center gap-2">
                      {anno.category === "strength" && (
                        <Star
                          size={12}
                          className="text-emerald-500 fill-emerald-500"
                        />
                      )}
                      {anno.category === "improvement_area" && (
                        <AlertTriangle
                          size={12}
                          className="text-amber-500 fill-amber-500"
                        />
                      )}
                      {anno.category === "critical_moment" && (
                        <Zap size={12} className="text-red-500 fill-red-500" />
                      )}
                      <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                        {anno.category.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {anno.text}
                  </p>
                  {anno.is_manual && (
                    <button
                      onClick={() => handleDeleteAnnotation(anno.id)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {(!annotations || annotations.length === 0) && (
                <div className="text-center py-8 text-xs text-gray-400 italic">
                  Belum ada anotasi.
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 space-y-3">
              <div className="flex gap-2">
                {(
                  [
                    "strength",
                    "improvement_area",
                    "critical_moment",
                    "technique_used",
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setNewAnnotation((prev) => ({ ...prev, category: cat }))
                    }
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${
                      newAnnotation.category === cat
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {cat[0]}
                  </button>
                ))}
              </div>
              <textarea
                value={newAnnotation.text}
                onChange={(e) =>
                  setNewAnnotation((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }))
                }
                placeholder="Tambah catatan di menit ini..."
                className="w-full p-3 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-20"
              />
              <button
                onClick={handleAddAnnotation}
                disabled={isAddingAnnotation || !newAnnotation.text.trim()}
                className="w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAddingAnnotation ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Add Annotation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
