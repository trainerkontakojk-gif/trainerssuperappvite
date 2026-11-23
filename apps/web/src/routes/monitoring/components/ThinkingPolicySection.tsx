import { useCallback, useEffect, useReducer } from "react";
import {
  AI_THINKING_LEVELS,
  type AiThinkingLevel,
  type AiThinkingPolicyAuditEntry,
  type AiThinkingPolicyListResponse,
  type AiThinkingPolicyItem,
  type AiThinkingScope,
} from "@trainers/types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { aiClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";

type Snapshot = {
  policy: AiThinkingPolicyListResponse;
  audit: AiThinkingPolicyAuditEntry[];
};

type State = {
  status: "loading" | "ready" | "saving" | "error";
  items: AiThinkingPolicyItem[];
  models: AiThinkingPolicyListResponse["models"];
  audit: AiThinkingPolicyAuditEntry[];
  editingScope: AiThinkingScope | null;
  draft: AiThinkingLevel | null;
  error: string | null;
};

type Action =
  | { type: "loading" }
  | { type: "loaded"; snapshot: Snapshot }
  | { type: "load-failed" }
  | { type: "open"; item: AiThinkingPolicyItem }
  | { type: "close" }
  | { type: "select"; level: AiThinkingLevel | null }
  | { type: "save-started" }
  | { type: "mutation-completed" }
  | { type: "save-failed" }
  | { type: "reset-started" };

const initialState: State = {
  status: "loading",
  items: [],
  models: [],
  audit: [],
  editingScope: null,
  draft: null,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading", error: null };
    case "loaded":
      return {
        ...state,
        status: "ready",
        items: action.snapshot.policy.items,
        models: action.snapshot.policy.models,
        audit: action.snapshot.audit,
        error: null,
      };
    case "mutation-completed":
      return {
        ...state,
        status: "ready",
        editingScope: null,
        draft: null,
        error: null,
      };
    case "load-failed":
      return { ...state, status: "error", error: "Pengaturan thinking level gagal dimuat." };
    case "open":
      return {
        ...state,
        editingScope: action.item.scope,
        draft: action.item.thinkingLevel,
        error: null,
      };
    case "close":
      return { ...state, editingScope: null, draft: null };
    case "select":
      return { ...state, draft: action.level };
    case "save-started":
      return { ...state, status: "saving", error: null };
    case "reset-started":
      return { ...state, status: "saving", error: null };
    case "save-failed":
      return {
        ...state,
        status: "ready",
        error: "Thinking level gagal disimpan. Coba lagi.",
      };
  }
}

function displayLevel(level: AiThinkingLevel | null): string {
  if (level === null) return "Bawaan model";
  return `${level[0]}${level.slice(1).toLowerCase()}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function loadSnapshot(): Promise<Snapshot> {
  const [policy, audit] = await Promise.all([
    aiClient["monitoring/thinking"].$get().then(unwrapResponse),
    aiClient["monitoring/thinking/audit"].$get().then(unwrapResponse),
  ]);
  return { policy, audit: audit.items };
}

export function ThinkingPolicySection({ canWrite }: { canWrite: boolean }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const refresh = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", snapshot: await loadSnapshot() });
    } catch {
      dispatch({ type: "load-failed" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const editingItem = state.items.find(
    (item) => item.scope === state.editingScope,
  );
  const isSaving = state.status === "saving";
  const selectedModels =
    state.draft === null
      ? []
      : state.models.filter((model) =>
          model.supportedLevels?.includes(state.draft as AiThinkingLevel),
        );
  const ignoredModels =
    state.draft === null
      ? []
      : state.models.filter(
          (model) => !model.supportedLevels?.includes(state.draft as AiThinkingLevel),
        );

  const save = async () => {
    if (!state.editingScope) return;
    dispatch({ type: "save-started" });
    try {
      await unwrapResponse(
        await aiClient["monitoring/thinking/:scope"].$put({
          param: { scope: state.editingScope },
          json: { thinkingLevel: state.draft },
        }),
      );
      dispatch({ type: "mutation-completed" });
      notify.success("Thinking level berhasil diperbarui.");
      await refresh();
    } catch {
      dispatch({ type: "save-failed" });
      notify.error("Gagal menyimpan thinking level.");
    }
  };

  const reset = async () => {
    if (!state.editingScope) return;
    dispatch({ type: "reset-started" });
    try {
      await unwrapResponse(
        await aiClient["monitoring/thinking/:scope"].$delete({
          param: { scope: state.editingScope },
        }),
      );
      dispatch({ type: "mutation-completed" });
      notify.success("Thinking level dikembalikan ke bawaan kode.");
      await refresh();
    } catch {
      dispatch({ type: "save-failed" });
      notify.error("Gagal mengembalikan thinking level.");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border/80 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-foreground">
          Thinking level per use case
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur tingkat reasoning Gemini untuk tiap pekerjaan AI. Level hanya
          dikirim ketika model efektif sudah diverifikasi mendukungnya; provider
          lain, model yang belum diverifikasi, dan level yang tidak didukung
          memakai bawaan model.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="px-4 pt-4 text-sm text-destructive sm:px-5">
          {state.error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/80 bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 sm:px-6">Use case</th>
              <th className="px-4 py-3 sm:px-6">Thinking level</th>
              <th className="px-4 py-3 sm:px-6">Status / Sumber</th>
              <th className="px-4 py-3 text-right sm:px-6">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {state.items.map((item) => (
              <tr key={item.scope} className="hover:bg-muted/20">
                <td className="px-4 py-4 sm:px-6">
                  <div className="font-medium text-foreground">{item.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {item.description}
                  </div>
                </td>
                <td className="px-4 py-4 font-mono text-xs font-semibold text-foreground sm:px-6">
                  {displayLevel(item.thinkingLevel)}
                  <div className="text-[11px] font-normal text-muted-foreground">
                    Bawaan kode: {displayLevel(item.codeDefault)}
                  </div>
                </td>
                <td className="px-4 py-4 sm:px-6">
                  {item.source === "policy" ? (
                    <Badge variant="secondary" className="text-xs">
                      Kustom (Database)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Bawaan Kode
                    </Badge>
                  )}
                  {item.updatedAt && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Diubah {formatDate(item.updatedAt)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-right sm:px-6">
                  {canWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={isSaving}
                      onClick={() => dispatch({ type: "open", item })}
                    >
                      Ubah
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {state.items.length === 0 && state.status === "loading" && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Memuat pengaturan thinking level...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border/80 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Dukungan model Gemini terverifikasi
        </h3>
        <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {state.models.map((model) => (
            <li key={model.id}>
              <span className="font-mono text-foreground">{model.id}</span>: {" "}
              {model.supportedLevels?.join(", ") ?? "belum diverifikasi"}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border/80 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Riwayat Perubahan Thinking Level
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Use case</th>
                <th className="px-3 py-2">Level Lama → Baru</th>
                <th className="px-3 py-2">Oleh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {state.audit.map((entry) => {
                const label = state.items.find((item) => item.scope === entry.scope)?.label ?? entry.scope;
                return (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(entry.changedAt)}</td>
                    <td className="px-3 py-2 font-medium">{label}</td>
                    <td className="px-3 py-2 font-mono">
                      {displayLevel(entry.oldThinkingLevel)} → {displayLevel(entry.newThinkingLevel)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.changedByName || entry.changedBy || "Sistem"}
                    </td>
                  </tr>
                );
              })}
              {state.audit.length === 0 && state.status === "ready" && (
                <tr>
                  <td colSpan={4} className="px-3 py-5 text-center text-muted-foreground">
                    Belum ada riwayat perubahan thinking level.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={state.editingScope !== null}
        onOpenChange={(open) => !open && !isSaving && dispatch({ type: "close" })}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              Ubah thinking level: {editingItem?.label ?? "use case"}
            </DialogTitle>
            <DialogDescription>{editingItem?.description ?? ""}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
            <div role="radiogroup" aria-label="Pilih thinking level" className="space-y-2">
              {[null, ...AI_THINKING_LEVELS].map((level) => {
                const value = level as AiThinkingLevel | null;
                const id = `thinking-${editingItem?.scope ?? "closed"}-${value ?? "default"}`;
                return (
                  <label
                    key={id}
                    htmlFor={id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      state.draft === value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      id={id}
                      name="thinking-level-selection"
                      checked={state.draft === value}
                      onChange={() => dispatch({ type: "select", level: value })}
                      className="h-4 w-4 text-primary focus:ring-primary"
                    />
                    <span>{displayLevel(value)}</span>
                  </label>
                );
              })}
            </div>

            {state.draft === null ? (
              <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                Bawaan model: API tidak mengirim <code>thinkingConfig</code>.
              </p>
            ) : (
              <div className="space-y-2 rounded-md bg-muted/60 p-3 text-xs">
                <p>
                  <strong>Dikirim pada model:</strong>{" "}
                  {selectedModels.map((model) => model.id).join(", ") || "tidak ada model terverifikasi"}
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  Model yang mengabaikan {displayLevel(state.draft)}: {" "}
                  {ignoredModels.map((model) => model.id).join(", ") || "tidak ada"}.
                  {" "}Permintaan tetap memakai bawaan model untuk model tersebut.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-0">
            {editingItem?.source === "policy" && (
              <Button type="button" variant="ghost" onClick={() => void reset()} disabled={isSaving}>
                Bawaan Kode
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: "close" })} disabled={isSaving}>
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={!editingItem || isSaving || state.draft === editingItem.thinkingLevel}
            >
              {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
