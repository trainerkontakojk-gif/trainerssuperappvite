import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Info,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeroHeader from "../../components/PageHeroHeader";
import { profilerApi } from "../../lib/profilerService";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import type { ProfilerTim } from "@trainers/types";

const DEFAULT_TEAMS = ["Telepon", "Chat", "Email"];

export default function ProfilerTeams() {
  const [teams, setTeams] = useState<ProfilerTim[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { isReadOnly } = useProfilerAccess();

  const load = () => {
    setLoading(true);
    profilerApi
      .getTeams()
      .then(setTeams)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddTeam = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const team = await profilerApi.createTeam(newName.trim());
      setTeams((prev) => [...prev, team].sort((a, b) => a.nama.localeCompare(b.nama)));
      setNewName("");
    } catch (err: any) {
      alert(err.message || "Gagal menambah tim. Pastikan nama tim unik.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (
      !confirm(
        `Hapus tim "${name}"? Peserta yang sudah menggunakan tim ini tidak akan terhapus, namun tim ini tidak akan muncul lagi di pilihan.`
      )
    )
      return;
    setDeleting(id);
    try {
      await profilerApi.deleteTeam(id);
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } catch (_err) {
      alert("Gagal menghapus tim.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <main className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeroHeader
            backHref="/profiler"
            backLabel="Kembali ke workspace KTP"
            eyebrow="Profiler teams"
            title="Kelola daftar tim agar pilihan batch tetap rapi dan konsisten."
            description="Tim default tetap tersedia, sementara tim kustom bisa ditambah atau dibersihkan dari satu panel yang mengikuti visual system baru."
            icon={<Users className="h-3.5 w-3.5" />}
          />

          <div className="space-y-6">
            {/* Info Card */}
            <div className="flex gap-3 rounded-[1.75rem] border border-blue-500/15 bg-blue-500/8 p-4">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
              <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                Tim default ({DEFAULT_TEAMS.join(", ")}) selalu tersedia dan tidak
                dapat dihapus. Anda dapat menambahkan tim kustom sesuai kebutuhan
                batch tertentu.
              </p>
            </div>

            {/* Add Team Form */}
            {!isReadOnly && (
              <div className="rounded-[1.75rem] border border-border/60 bg-card/80 p-5 shadow-sm">
                <label className="mb-3 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Tambah Tim Baru
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contoh: Tim Social Media"
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAddTeam()}
                  />
                  <button
                    onClick={handleAddTeam}
                    disabled={adding || !newName.trim()}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {adding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Tambah
                  </button>
                </div>
              </div>
            )}

            {/* Teams List */}
            <div className="space-y-3">
              <h2 className="px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Daftar Tim Aktif
              </h2>

              <div className="grid gap-2">
                {loading ? (
                  <div className="rounded-2xl border border-border/60 bg-card/80 py-8 text-center shadow-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Default Teams */}
                    {DEFAULT_TEAMS.map((t) => (
                      <div
                        key={t}
                        className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {t}
                          </span>
                        </div>
                        <span className="rounded-md bg-muted/70 px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                          Sistem
                        </span>
                      </div>
                    ))}

                    {/* Custom Teams */}
                    <AnimatePresence mode="popLayout">
                      {teams
                        .filter((t) => !DEFAULT_TEAMS.includes(t.nama))
                        .map((t) => (
                          <motion.div
                            key={t.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                <Users className="h-4 w-4 text-primary" />
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {t.nama}
                              </span>
                            </div>
                            {!isReadOnly && (
                              <button
                                onClick={() => handleDeleteTeam(t.id, t.nama)}
                                disabled={deleting === t.id}
                                className="rounded-xl p-2 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                              >
                                {deleting === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </>
                )}

                {!loading &&
                  teams.filter((t) => !DEFAULT_TEAMS.includes(t.nama)).length ===
                    0 && (
                    <div className="rounded-2xl border-2 border-dashed border-border bg-card/40 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        Belum ada tim kustom.
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
