import { useEffect, useState } from "react";
import type { PesertaLinkOption } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Skeleton } from "../../../../components/ui/skeleton";
import { fetchApi } from "../../../../hooks/useApi";
import { SearchField } from "../management/SearchField";

interface LinkPesertaDialogProps {
  account: { id: string; name: string; email: string };
  currentPesertaId: string | null;
  saving: boolean;
  onClose: () => void;
  /** `option` is missing when a new search no longer lists the pick. */
  onLink: (pesertaId: string, option?: PesertaLinkOption) => void;
}

/**
 * Pick the KTP participant an account belongs to. Participants already linked
 * to another account are shown but cannot be chosen; an Email OJK equal to
 * the account email is only a suggestion and is never selected automatically.
 */
export function LinkPesertaDialog({
  account,
  currentPesertaId,
  saving,
  onClose,
  onLink,
}: LinkPesertaDialogProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PesertaLinkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ user_id: account.id });
      if (query.trim()) params.set("q", query.trim());
      fetchApi<PesertaLinkOption[]>(`/admin/peserta-options?${params}`)
        .then((rows) => {
          if (cancelled) return;
          setOptions(rows);
          setError(null);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [account.id, query]);

  const suggestion = options.find(
    (option) =>
      option.email_match &&
      !option.linked_user &&
      option.id !== currentPesertaId,
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="gap-4 sm:max-w-2xl">
        <div className="grid gap-1">
          <DialogTitle className="font-display text-lg font-semibold">
            Tautkan ke peserta KTP
          </DialogTitle>
          <DialogDescription>
            Akun {account.name} · {account.email}
          </DialogDescription>
        </div>

        <SearchField
          label="Cari nama atau Email OJK peserta"
          value={query}
          onChange={setQuery}
        />

        {suggestion ? (
          <p className="text-xs text-muted-foreground">
            Cocok dengan email: Email OJK peserta {suggestion.nama} sama dengan
            email akun ini.
          </p>
        ) : null}

        <fieldset className="overflow-hidden rounded-lg border border-border">
          <legend className="sr-only">Pilih peserta</legend>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid"
          >
            <span />
            <span>Nama</span>
            <span>Folder</span>
            <span>Tim</span>
            <span>Akun tertaut</span>
          </div>
          <div className="max-h-72 overflow-y-auto" aria-busy={loading}>
            {error ? (
              <p className="px-3 py-4 text-sm text-destructive">{error}</p>
            ) : loading && options.length === 0 ? (
              <div role="status" className="grid gap-2 p-3">
                <span className="sr-only">Memuat peserta…</span>
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : options.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {query.trim()
                  ? "Tidak ada peserta dengan nama atau email itu."
                  : "Ketik nama peserta untuk mencari."}
              </p>
            ) : (
              options.map((option) => {
                const takenByOther =
                  option.linked_user !== null &&
                  option.linked_user.id !== account.id;
                const current = option.id === currentPesertaId;
                return (
                  <label
                    key={option.id}
                    className={`grid min-h-11 cursor-pointer grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40 has-[:checked]:bg-muted/60 sm:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] ${takenByOther || current ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
                  >
                    <input
                      type="radio"
                      name="peserta"
                      value={option.id}
                      checked={selected === option.id}
                      disabled={takenByOther || current}
                      onChange={() => setSelected(option.id)}
                      className="size-4 accent-foreground"
                    />
                    <span className="truncate font-medium text-foreground">
                      {option.nama}
                    </span>
                    <span className="col-start-2 truncate text-muted-foreground sm:col-start-auto">
                      {option.batch_name ?? "-"}
                    </span>
                    <span className="col-start-2 truncate text-muted-foreground sm:col-start-auto">
                      {option.tim ?? "-"}
                    </span>
                    <span className="col-start-2 truncate text-muted-foreground sm:col-start-auto">
                      {current
                        ? "Akun ini"
                        : option.linked_user
                          ? option.linked_user.email
                          : "Belum ada"}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </fieldset>

        <p className="text-xs text-muted-foreground">
          Satu peserta hanya bisa ditautkan ke satu akun. Peserta yang sudah
          tertaut ke akun lain tidak bisa dipilih.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-9"
            disabled={saving}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={!selected || saving}
            onClick={() =>
              selected &&
              onLink(
                selected,
                options.find((entry) => entry.id === selected),
              )
            }
          >
            {saving ? "Menautkan…" : "Tautkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
