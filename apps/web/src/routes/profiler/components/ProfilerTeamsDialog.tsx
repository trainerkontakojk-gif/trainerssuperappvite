import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { ProfilerTim } from "@trainers/types";
import { profilerApi } from "../../../lib/profilerService";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Skeleton } from "../../../components/ui/skeleton";

const DEFAULT_TEAMS = ["Telepon", "Chat", "Email"];

interface ProfilerTeamsDialogProps {
  open: boolean;
  isReadOnly: boolean;
  onClose: () => void;
}

/** Daftar tim untuk pilihan "Tim" peserta dan filter tim (`?tim=1`). */
export default function ProfilerTeamsDialog({
  open,
  isReadOnly,
  onClose,
}: ProfilerTeamsDialogProps) {
  const [teams, setTeams] = useState<ProfilerTim[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    profilerApi
      .getTeams()
      .then(setTeams)
      .catch(() => setError("Gagal memuat daftar tim. Coba buka lagi."))
      .finally(() => setLoading(false));
  }, [open]);

  const handleAddTeam = async () => {
    const name = newName.trim();
    if (!name) return;
    if (
      DEFAULT_TEAMS.includes(name) ||
      teams.some((team) => team.nama === name)
    ) {
      setError(`Tim "${name}" sudah ada.`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const team = await profilerApi.createTeam(name);
      setTeams((previous) =>
        [...previous, team].sort((a, b) => a.nama.localeCompare(b.nama)),
      );
      setNewName("");
    } catch (addError: any) {
      setError(addError.message || "Gagal menambah tim. Pastikan nama unik.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTeam = async (team: ProfilerTim) => {
    if (
      !confirm(
        `Hapus tim "${team.nama}"? Peserta yang memakai tim ini tidak ikut terhapus, tetapi tim ini tidak muncul lagi di pilihan.`,
      )
    )
      return;
    setDeleting(team.id);
    setError(null);
    try {
      await profilerApi.deleteTeam(team.id);
      setTeams((previous) => previous.filter((item) => item.id !== team.id));
    } catch {
      setError(`Gagal menghapus tim "${team.nama}".`);
    } finally {
      setDeleting(null);
    }
  };

  const customTeams = teams.filter(
    (team) => !DEFAULT_TEAMS.includes(team.nama),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="gap-0 bg-card p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle>Kelola daftar tim</DialogTitle>
          <DialogDescription>
            Daftar ini muncul di pilihan "Tim" pada data peserta dan di filter
            tim. Folder tim di panel kiri diatur lewat tombol ⋯ di sana.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(60vh,28rem)] flex-col gap-4 overflow-y-auto p-5 custom-scrollbar">
          {!isReadOnly ? (
            <div className="flex gap-2">
              <Label htmlFor="profiler-new-team" className="sr-only">
                Nama tim baru
              </Label>
              <Input
                id="profiler-new-team"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAddTeam();
                }}
                placeholder="Contoh: Tim Social Media"
                className="min-h-11 flex-1"
              />
              <Button
                type="button"
                size="lg"
                className="min-h-11"
                onClick={() => void handleAddTeam()}
                disabled={adding || !newName.trim()}
              >
                {adding ? (
                  <Loader2
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Plus data-icon="inline-start" aria-hidden="true" />
                )}
                Tambah
              </Button>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="flex flex-col gap-2" aria-label="Memuat daftar tim">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-11 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <TeamGroup title="Tim bawaan, tidak bisa dihapus">
                {DEFAULT_TEAMS.map((team) => (
                  <TeamRow key={team} name={team}>
                    <span className="text-sm text-muted-foreground">
                      Sistem
                    </span>
                  </TeamRow>
                ))}
              </TeamGroup>
              <TeamGroup title="Tim buatan">
                {customTeams.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Belum ada tim buatan.
                  </p>
                ) : (
                  customTeams.map((team) => (
                    <TeamRow key={team.id} name={team.nama}>
                      {!isReadOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          className="size-11 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDeleteTeam(team)}
                          disabled={deleting === team.id}
                          aria-label={`Hapus tim ${team.nama}`}
                        >
                          {deleting === team.id ? (
                            <Loader2
                              className="animate-spin motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 aria-hidden="true" />
                          )}
                        </Button>
                      ) : null}
                    </TeamRow>
                  ))
                )}
              </TeamGroup>
            </>
          )}
        </div>

        <DialogFooter className="m-0 flex-row items-center justify-between border-t border-border p-4 sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading
              ? " "
              : `${DEFAULT_TEAMS.length + customTeams.length} tim tersedia untuk dipilih.`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={onClose}
          >
            Selesai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
        {title}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function TeamRow({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm">
      <span className="min-w-0 break-words text-foreground">{name}</span>
      {children}
    </li>
  );
}
