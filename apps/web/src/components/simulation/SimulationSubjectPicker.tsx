import { useEffect, useRef, useState } from "react";
import { useSimulationSubject } from "./useSimulationSubject";
import type { SimulationSubjectSelection } from "@trainers/types";

export function SimulationSubjectPicker({
  accountKey,
  canPickParticipant,
  onConfirm,
  onCancel,
}: {
  accountKey: string | null;
  canPickParticipant: boolean;
  onConfirm: (selection: SimulationSubjectSelection) => void | Promise<void>;
  onCancel: () => void;
}) {
  const subject = useSimulationSubject(accountKey);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, input, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !(el as HTMLButtonElement).disabled);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (
        (e.key === "ArrowDown" || e.key === "ArrowUp") &&
        listRef.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        const buttons = Array.from(
          listRef.current.querySelectorAll<HTMLButtonElement>("button"),
        );
        const idx = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          e.key === "ArrowDown"
            ? Math.min(buttons.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        buttons[next]?.focus();
      }
      if (
        e.key === "Enter" &&
        document.activeElement?.getAttribute("role") === "radio"
      ) {
        (document.activeElement as HTMLElement).click();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused.current?.focus?.();
    };
  }, []);

  const confirm = () => {
    if (!subject.canConfirm || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      void Promise.resolve(onConfirm(subject.selection))
        .catch((error) => {
          console.error(
            "[SimulationSubjectPicker] Failed to confirm subject:",
            error,
          );
        })
        .finally(() => {
          submittingRef.current = false;
          setSubmitting(false);
        });
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      throw error;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="presentation"
      onClick={() => onCancelRef.current()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-subject-title"
        aria-describedby="sim-subject-description"
        className="w-full max-w-md rounded-lg border bg-[var(--surface)] p-5 text-[var(--fg)]"
        style={{ borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sim-subject-title" className="text-base font-semibold">
          Mulai Simulasi
        </h2>
        <p
          id="sim-subject-description"
          className="mt-1 text-sm text-[var(--fg2)]"
        >
          Pilih peserta latihan. Batal tidak membuat sesi atau memicu AI.
        </p>

        <div
          className="mt-4 space-y-2"
          role="radiogroup"
          aria-label="Target simulasi"
        >
          <label
            className="flex items-start gap-2 rounded-md border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input
              type="radio"
              name="sim-subject"
              checked={subject.mode === "self"}
              onChange={() => subject.setMode("self")}
              data-autofocus
            />
            <span>
              <span className="block text-sm font-medium">Diri sendiri</span>
              <span className="block text-xs text-[var(--fg2)]">
                Untuk diri sendiri saat menjalankan simulasi.
              </span>
            </span>
          </label>
          {canPickParticipant && (
            <label
              className="flex items-start gap-2 rounded-md border p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <input
                type="radio"
                name="sim-subject"
                checked={subject.mode === "participant"}
                onChange={() => subject.setMode("participant")}
              />
              <span>
                <span className="block text-sm font-medium">Peserta resmi</span>
                <span className="block text-xs text-[var(--fg2)]">
                  Pilih dari hasil resmi. Mengetik nama saja tidak cukup.
                </span>
              </span>
            </label>
          )}
        </div>

        {subject.mode === "participant" && canPickParticipant && (
          <div className="mt-3">
            <label
              htmlFor="sim-subject-search"
              className="text-xs text-[var(--fg2)]"
            >
              Cari peserta (min. 2 huruf)
            </label>
            <input
              id="sim-subject-search"
              value={subject.search}
              onChange={(e) => subject.onSearchChange(e.target.value)}
              placeholder="Ketik nama peserta…"
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
              style={{ borderColor: "var(--border)" }}
              aria-describedby="sim-subject-hint"
            />
            <p id="sim-subject-hint" className="mt-1 text-xs text-[var(--fg2)]">
              {subject.search.trim().length < 2
                ? "Ketik minimal 2 huruf untuk mencari."
                : subject.loading
                  ? "Mencari…"
                  : `${subject.options.length} hasil`}
            </p>
            <div
              ref={listRef}
              aria-live="polite"
              aria-busy={subject.loading}
              className="mt-2 max-h-48 space-y-1 overflow-auto"
            >
              {subject.error && (
                <div
                  className="rounded-md border p-2 text-sm"
                  role="alert"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span aria-hidden="true">⚠ </span>
                  {subject.error}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={subject.retry}
                  >
                    Coba lagi
                  </button>
                </div>
              )}
              {!subject.error &&
                subject.search.trim().length >= 2 &&
                !subject.loading &&
                subject.options.length === 0 && (
                  <p className="text-sm text-[var(--fg2)]">Tidak ada hasil.</p>
                )}
              {subject.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => subject.setSelected(o)}
                  aria-pressed={subject.selected?.id === o.id}
                  className="flex min-h-11 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
                  style={{
                    borderColor:
                      subject.selected?.id === o.id
                        ? "var(--fg)"
                        : "var(--border)",
                  }}
                >
                  <span>
                    <span className="block font-medium">{o.nama}</span>
                    <span className="block text-xs text-[var(--fg2)]">
                      {[o.batch_name, o.tim].filter(Boolean).join(" · ") ||
                        "Peserta resmi"}
                    </span>
                  </span>
                  {subject.selected?.id === o.id && (
                    <span aria-hidden="true">✓</span>
                  )}
                </button>
              ))}
            </div>
            {subject.selected && (
              <p className="mt-2 text-sm">
                Terpilih: <strong>{subject.selected.nama}</strong>
                {[subject.selected.batch_name, subject.selected.tim].filter(
                  Boolean,
                ).length > 0
                  ? ` — ${[subject.selected.batch_name, subject.selected.tim].filter(Boolean).join(" · ")}`
                  : ""}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onCancelRef.current()}
            className="min-h-11 rounded-md border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
            style={{ borderColor: "var(--border)" }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!subject.canConfirm || submitting}
            className="min-h-11 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
            style={{ background: "var(--inv-bg)", color: "var(--inv-fg)" }}
          >
            {submitting ? "Memulai…" : "Mulai"}
          </button>
        </div>
      </div>
    </div>
  );
}
