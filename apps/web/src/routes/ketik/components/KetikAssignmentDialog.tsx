import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  assignmentReducer,
  INITIAL_ASSIGNMENT,
  type AssignmentEvent,
} from "../hooks/assignmentLifecycle";
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

export function KetikAssignmentDialog({ onClose }: { onClose: () => void }) {
  const [state, dispatch] = useReducer(assignmentReducer, INITIAL_ASSIGNMENT);
  const current = useRef(state);
  const transition = useCallback((event: AssignmentEvent) => {
    current.current = assignmentReducer(current.current, event);
    dispatch(event);
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [query, setQuery] = useState("");
  const { source, users, recipient, snapshot, error } = state;
  const loading = state.status === "loading";
  const saving = state.status === "saving";
  const success = state.status === "success";
  const checking = state.status === "checking";
  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    void (async () => {
      try {
        const loadedSource = await ketikApi.getAssignmentSource();
        const loadedUsers = await ketikApi.getAssignmentRecipients();
        if (cancelled) return;
        transition({
          type: "loaded",
          source: loadedSource,
          users: loadedUsers.filter(
            (u) =>
              !u.is_deleted &&
              ["active", "approved"].includes(u.status) &&
              (u.role === "agent" || u.role === "leader"),
          ),
        });
      } catch {
        if (!cancelled) transition({ type: "load-failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, transition]);
  useEffect(() => {
    if (!checking || !recipient || !source) return;
    let cancelled = false;
    void ketikApi
      .getAssignment(recipient)
      .then((data) => {
        if (!cancelled)
          transition({ type: "checked", recipient, snapshot: data });
      })
      .catch(() => {
        if (!cancelled) transition({ type: "check-failed", recipient });
      });
    return () => {
      cancelled = true;
    };
  }, [checking, recipient, source, transition]);
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
    const pending = current.current;
    if (pending.status !== "ready") return;
    transition({ type: "save" });
    try {
      const result = await ketikApi.assignConfiguration(pending.recipient, {
        sourceSettingsVersion: pending.source.version,
        recipientSettingsVersion: pending.snapshot.recipientSettingsVersion,
        expectedAssignmentVersion: pending.snapshot.assignment?.version ?? null,
      });
      if (mounted.current)
        transition({
          type: "saved",
          recipient: pending.recipient,
          snapshot: result,
        });
    } catch (cause) {
      // Failed/conflicting saves require an explicit reload, never a silent overwrite retry.
      if (mounted.current)
        transition({
          type: "save-failed",
          recipient: pending.recipient,
          error:
            cause instanceof ApiError && cause.code === "ASSIGNMENT_CONFLICT"
              ? KETIK_ERROR_MESSAGES.ASSIGNMENT_CONFLICT
              : KETIK_ERROR_MESSAGES.ASSIGNMENT_SAVE_FAILED,
        });
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
                          transition({ type: "select", recipient: value });
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
                  {checking && (
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
              onClick={() => transition({ type: "reload" })}
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
            disabled={state.status !== "ready"}
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
