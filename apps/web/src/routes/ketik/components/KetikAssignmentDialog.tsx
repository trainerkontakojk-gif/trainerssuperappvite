import { useEffect, useMemo, useState } from "react";
import type { KetikAssignmentSnapshot, ManagedUser } from "@trainers/types";
import { KETIK_ERROR_MESSAGES } from "@trainers/types";
import { ketikApi } from "../ketikApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api";

type Source = Awaited<ReturnType<typeof ketikApi.getAssignmentSource>>;
export function KetikAssignmentDialog({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState("");
  const [snapshot, setSnapshot] = useState<KetikAssignmentSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSource(null);
    setSnapshot(null);
    void (async () => {
      try {
        const loadedSource = await ketikApi.getAssignmentSource();
        const loadedUsers = await ketikApi.getAssignmentRecipients();
        if (cancelled) return;
        setSource(loadedSource);
        setUsers(
          loadedUsers.filter(
            (u) =>
              !u.is_deleted &&
              ["active", "approved"].includes(u.status) &&
              (u.role === "agent" || u.role === "leader"),
          ),
        );
      } catch {
        if (!cancelled)
          setError("Data penugasan belum bisa dimuat. Coba muat ulang.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  useEffect(() => {
    if (!recipient || !source) return;
    let cancelled = false;
    setSnapshot(null);
    setSuccess(false);
    setError("");
    void ketikApi
      .getAssignment(recipient)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Penugasan penerima belum bisa dimuat atau berada di luar akses Anda.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [recipient, source]);
  const matches = useMemo(
    () =>
      users.filter((u) =>
        `${u.full_name ?? ""} ${u.email}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [users, query],
  );
  const selected = users.find((u) => u.id === recipient);
  const visible = matches.slice(0, 50);
  const items = (
    selected && !visible.some((u) => u.id === selected.id)
      ? [selected, ...visible]
      : visible
  ).map((u) => ({ value: u.id, label: u.full_name || u.email }));
  const assign = async () => {
    if (!source || !snapshot || !recipient || saving) return;
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const result = await ketikApi.assignConfiguration(recipient, {
        sourceSettingsVersion: source.version,
        recipientSettingsVersion: snapshot.recipientSettingsVersion,
        expectedAssignmentVersion: snapshot.assignment?.version ?? null,
      });
      setSnapshot(result);
      setSuccess(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "ASSIGNMENT_CONFLICT"
          ? KETIK_ERROR_MESSAGES.ASSIGNMENT_CONFLICT
          : KETIK_ERROR_MESSAGES.ASSIGNMENT_SAVE_FAILED,
      );
      // Never refresh versions and silently retry an overwrite.
      setSnapshot(null);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Penugasan KETIK</DialogTitle>
          <DialogDescription>
            Salin skenario dan model Anda ke pengaturan pribadi agen atau
            leader. Identitas dan template penerima tetap dipertahankan.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status">Memuat sumber dan penerima…</p>
        ) : (
          <>
            {source && (
              <p className="text-sm text-fg2">
                Sumber:{" "}
                {source.settings.scenarios.filter((s) => s.isActive).length}{" "}
                skenario aktif · {source.settings.selectedModel} ·{" "}
                {source.settings.simulationDuration} menit.
              </p>
            )}
            {source && !users.length ? (
              <p role="status">Belum ada akun agen atau leader aktif.</p>
            ) : (
              source && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="ketik-recipient-query">Cari penerima</Label>
                    <Input
                      id="ketik-recipient-query"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={saving}
                      className="min-h-[44px] text-base"
                      placeholder="Nama atau email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ketik-assignment-recipient">Penerima</Label>
                    <Select
                      items={items}
                      value={recipient || null}
                      disabled={saving}
                      onValueChange={(value, details) => {
                        if (value && details.reason !== "none")
                          setRecipient(value);
                      }}
                    >
                      <SelectTrigger
                        id="ketik-assignment-recipient"
                        className="min-h-[44px] w-full min-w-0"
                      >
                        <SelectValue placeholder="Pilih agen atau leader" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!matches.length && (
                    <p role="status">Tidak ada penerima yang cocok.</p>
                  )}
                  {matches.length > 50 && (
                    <p className="text-sm text-fg2">
                      Menampilkan 50 dari {matches.length} penerima. Cari nama
                      atau email untuk mempersempit pilihan.
                    </p>
                  )}
                  {recipient && !snapshot && !error && (
                    <p role="status">Memeriksa penugasan penerima…</p>
                  )}
                  {snapshot && !success && (
                    <p className="text-sm text-fg2">
                      {snapshot.assignment
                        ? "Penerima sudah memiliki penugasan. Menugaskan ulang akan mengganti skenario dan model pribadinya; sesi yang sedang berjalan tidak berubah."
                        : "Penerima belum memiliki penugasan."}
                    </p>
                  )}
                </div>
              )
            )}
          </>
        )}
        {error && (
          <div role="alert" className="space-y-2">
            <p>{error}</p>
            <Button
              variant="outline"
              className="min-h-[44px]"
              disabled={saving}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Muat ulang data penugasan
            </Button>
          </div>
        )}
        {success && (
          <p role="status">
            Penugasan tersimpan. Penerima dapat memulai simulasi dan
            menyesuaikan salinan pribadinya.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </Button>
          <Button
            className="min-h-[44px]"
            onClick={() => void assign()}
            disabled={loading || saving || !source || !snapshot || success}
          >
            {saving
              ? "Menyimpan…"
              : snapshot?.assignment
                ? "Tugaskan ulang"
                : "Tugaskan skenario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
