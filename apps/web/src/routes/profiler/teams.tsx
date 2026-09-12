import { useEffect, useState } from "react";
import { Info, Loader2, Plus, Trash2, Users } from "lucide-react";
import { ProfilerPageHeader } from "./components/ProfilerPageHeader";
import { profilerApi } from "../../lib/profilerService";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import type { ProfilerTim } from "@trainers/types";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Alert, AlertDescription } from "../../components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { Skeleton } from "../../components/ui/skeleton";

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
      .catch(console.error)
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
      setTeams((previous) =>
        [...previous, team].sort((a, b) => a.nama.localeCompare(b.nama)),
      );
      setNewName("");
    } catch (error: any) {
      alert(error.message || "Gagal menambah tim. Pastikan nama tim unik.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (
      !confirm(
        `Hapus tim "${name}"? Peserta yang sudah menggunakan tim ini tidak akan terhapus, namun tim ini tidak akan muncul lagi di pilihan.`,
      )
    )
      return;
    setDeleting(id);
    try {
      await profilerApi.deleteTeam(id);
      setTeams((previous) => previous.filter((team) => team.id !== id));
    } catch (_error) {
      alert("Gagal menghapus tim.");
    } finally {
      setDeleting(null);
    }
  };

  const customTeams = teams.filter(
    (team) => !DEFAULT_TEAMS.includes(team.nama),
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProfilerPageHeader
        backHref="/profiler"
        backLabel="Kembali ke workspace KTP"
        eyebrow="Profiler teams"
        title="Kelola daftar tim agar pilihan batch tetap rapi."
        description="Tim default selalu tersedia, sedangkan tim kustom dapat ditambah dan dibersihkan dari satu panel."
        icon={<Users className="size-3.5" aria-hidden="true" />}
      />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              Tim default ({DEFAULT_TEAMS.join(", ")}) selalu tersedia dan tidak
              dapat dihapus. Tambahkan tim kustom sesuai kebutuhan batch.
            </AlertDescription>
          </Alert>

          {!isReadOnly ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Tambah tim baru</CardTitle>
                <CardDescription>
                  Gunakan nama yang mudah dikenali di filter dan formulir
                  peserta.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Label htmlFor="new-team" className="sr-only">
                    Nama tim baru
                  </Label>
                  <Input
                    id="new-team"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleAddTeam();
                    }}
                    placeholder="Contoh: Tim Social Media"
                    className="min-h-11"
                  />
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="min-h-11"
                  onClick={() => void handleAddTeam()}
                  disabled={adding || !newName.trim()}
                >
                  {adding ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                  Tambah
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Daftar tim aktif</CardTitle>
              <CardDescription>
                {teams.length} tim tersedia untuk dipilih.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))
              ) : (
                <>
                  {DEFAULT_TEAMS.map((team) => (
                    <div
                      key={team}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                          <Users
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </div>
                        <span className="truncate text-sm font-medium">
                          {team}
                        </span>
                      </div>
                      <Badge variant="secondary">Sistem</Badge>
                    </div>
                  ))}
                  {customTeams.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10">
                          <Users
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        </div>
                        <span className="break-words text-sm font-medium">
                          {team.nama}
                        </span>
                      </div>
                      {!isReadOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            void handleDeleteTeam(team.id, team.nama)
                          }
                          disabled={deleting === team.id}
                          aria-label={`Hapus tim ${team.nama}`}
                        >
                          {deleting === team.id ? (
                            <Loader2
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 aria-hidden="true" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {customTeams.length === 0 ? (
                    <Empty className="border-0 py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>Belum ada tim kustom</EmptyTitle>
                        <EmptyDescription>
                          Tim kustom yang ditambahkan akan tampil di sini.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
