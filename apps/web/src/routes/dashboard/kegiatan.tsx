import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import {
  TRAINER_ACTIVITY_MAX_IMAGE_BYTES,
  TRAINER_ACTIVITY_PROGRAMS,
  trainerActivityInputSchema,
} from "@trainers/types";
import type {
  TrainerActivity,
  TrainerActivityInput,
  TrainerActivityProgram,
} from "@trainers/types";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ConfirmDialog } from "./components/management/ConfirmDialog";
import { EmptyState } from "./components/management/EmptyState";
import { ManagementShell } from "./components/management/ManagementShell";
import { rpcClient } from "../../lib/api/rpc-client";
import { unwrapResponse } from "../../lib/api/unwrap-response";

type ActivityForm = {
  year: string;
  program: TrainerActivityProgram;
  kind: "poster" | "foto";
  title: string;
  eventDate: string;
  driveUrl: string;
  sortOrder: string;
  isPublished: boolean;
};

type FormErrors = Partial<
  Record<"year" | "title" | "drive_url" | "image", string>
>;

const currentYear = new Date().getFullYear();
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function emptyForm(): ActivityForm {
  return {
    year: String(currentYear),
    program: "sobat",
    kind: "poster",
    title: "",
    eventDate: "",
    driveUrl: "",
    sortOrder: "0",
    isPublished: true,
  };
}

function formFromActivity(item: TrainerActivity): ActivityForm {
  return {
    year: String(item.year),
    program: item.program,
    kind: item.kind,
    title: item.title,
    eventDate: item.event_date ?? "",
    driveUrl: item.drive_url,
    sortOrder: String(item.sort_order),
    isPublished: item.is_published,
  };
}

function friendlyDate(date: string | null) {
  if (!date) return "Tanggal tidak dicantumkan";
  const [year, month, day] = date.split("-").map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gambar gagal dibaca."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gambar gagal dibaca."));
    };
    reader.readAsDataURL(file);
  });
}

function FormFieldError({ children }: { children?: string }) {
  return children ? (
    <p className="text-sm text-destructive" role="alert">
      {children}
    </p>
  ) : null;
}

export default function DashboardKegiatan() {
  const [year, setYear] = useState(currentYear);
  const [allItems, setAllItems] = useState<TrainerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TrainerActivity | null>(null);
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrainerActivity | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const data = await unwrapResponse(await rpcClient.v1.kegiatan.$get());
      setAllItems(data as TrainerActivity[]);
    } catch {
      setPageError("Daftar kegiatan belum dapat dimuat. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(
    () => () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const yearOptions = useMemo(() => {
    const values = new Set([currentYear, ...allItems.map((item) => item.year)]);
    return [...values].sort((left, right) => right - left);
  }, [allItems]);

  const items = useMemo(
    () => allItems.filter((item) => item.year === year),
    [allItems, year],
  );

  const openCreateForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setFile(null);
    setPreviewUrl(null);
    setErrors({});
    setFormOpen(true);
  };

  const openEditForm = (item: TrainerActivity) => {
    setEditing(item);
    setForm(formFromActivity(item));
    setFile(null);
    setPreviewUrl(item.image_url);
    setErrors({});
    setFormOpen(true);
  };

  const closeForm = (open: boolean) => {
    if (saving) return;
    setFormOpen(open);
    if (!open) {
      setFile(null);
      setPreviewUrl(null);
      setErrors({});
    }
  };

  const updateForm = <K extends keyof ActivityForm>(
    key: K,
    value: ActivityForm[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Field rules live in the shared schema; only the file needs checks before
    // it is read into a data URL.
    const imageError =
      !file && !editing
        ? "Pilih gambar kegiatan terlebih dahulu."
        : file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)
          ? "Gambar harus berformat PNG, JPEG, atau WebP."
          : file && file.size > TRAINER_ACTIVITY_MAX_IMAGE_BYTES
            ? "Ukuran gambar maksimal 5 MB."
            : undefined;

    setErrors({});
    setSaving(true);
    setPageError(null);
    try {
      const image = file && !imageError ? await toDataUrl(file) : undefined;
      const parsed = trainerActivityInputSchema.safeParse({
        year: Number(form.year),
        program: form.program,
        kind: form.kind,
        title: form.title,
        event_date: form.eventDate || null,
        drive_url: form.driveUrl.trim(),
        sort_order: Number(form.sortOrder) || 0,
        is_published: form.isPublished,
        ...(image
          ? { image }
          : editing
            ? { image_url: editing.image_url }
            : {}),
      });
      if (!parsed.success || imageError) {
        const nextErrors: FormErrors = {};
        for (const issue of parsed.error?.issues ?? []) {
          const path = issue.path[0];
          if (
            (path === "year" ||
              path === "title" ||
              path === "drive_url" ||
              path === "image") &&
            !nextErrors[path]
          )
            nextErrors[path] = issue.message;
        }
        if (imageError) nextErrors.image = imageError;
        setErrors(nextErrors);
        return;
      }

      let saved: TrainerActivity;
      if (editing) {
        saved = (await unwrapResponse(
          await rpcClient.v1.kegiatan[":id"].$patch({
            param: { id: editing.id },
            json: parsed.data,
          }),
        )) as TrainerActivity;
        setAllItems((previous) =>
          previous.map((item) => (item.id === saved.id ? saved : item)),
        );
        setNotice("Perubahan kegiatan tersimpan.");
      } else {
        saved = (await unwrapResponse(
          await rpcClient.v1.kegiatan.$post({
            json: parsed.data,
          }),
        )) as TrainerActivity;
        setAllItems((previous) => [saved, ...previous]);
        setNotice("Kegiatan berhasil ditambahkan.");
      }
      setYear(saved.year);
      setFormOpen(false);
      setFile(null);
      setPreviewUrl(null);
    } catch {
      setPageError(
        "Kegiatan belum dapat disimpan. Periksa data lalu coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (item: TrainerActivity) => {
    setPendingAction(true);
    setPageError(null);
    try {
      const payload: TrainerActivityInput = {
        year: item.year,
        program: item.program,
        kind: item.kind,
        title: item.title,
        event_date: item.event_date,
        drive_url: item.drive_url,
        sort_order: item.sort_order,
        is_published: !item.is_published,
        image_url: item.image_url,
      };
      const updated = (await unwrapResponse(
        await rpcClient.v1.kegiatan[":id"].$patch({
          param: { id: item.id },
          json: payload,
        }),
      )) as TrainerActivity;
      setAllItems((previous) =>
        previous.map((row) => (row.id === item.id ? updated : row)),
      );
      setNotice(
        updated.is_published
          ? "Kegiatan diterbitkan."
          : "Kegiatan disembunyikan.",
      );
    } catch {
      setPageError("Status kegiatan belum dapat diubah. Silakan coba lagi.");
    } finally {
      setPendingAction(false);
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    setPendingAction(true);
    setPageError(null);
    try {
      await unwrapResponse(
        await rpcClient.v1.kegiatan[":id"].$delete({
          param: { id: deleteTarget.id },
        }),
      );
      setAllItems((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
      setNotice("Kegiatan dihapus.");
      setDeleteTarget(null);
    } catch {
      setPageError("Kegiatan belum dapat dihapus. Silakan coba lagi.");
    } finally {
      setPendingAction(false);
    }
  };

  return (
    <ManagementShell
      title="Kelola Kegiatan"
      description="Tambah, perbarui, dan atur kegiatan yang tampil di laman publik."
      actions={
        <Button onClick={openCreateForm} className="min-h-11 gap-2">
          <Plus size={17} aria-hidden="true" />
          Tambah kegiatan
        </Button>
      }
    >
      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2">
            <Label htmlFor="kegiatan-filter-year">Filter tahun</Label>
            <select
              id="kegiatan-filter-year"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {yearOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays size={16} aria-hidden="true" />
            {items.length} kegiatan
          </div>
        </div>

        {notice ? (
          <p role="status" className="text-sm text-foreground">
            {notice}
          </p>
        ) : null}
        {pageError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 border-y border-destructive/30 py-3 text-sm text-destructive"
          >
            <span>{pageError}</span>
            <Button variant="outline" onClick={() => void loadItems()}>
              Muat ulang
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p role="status" className="py-10 text-sm text-muted-foreground">
            Memuat daftar kegiatan…
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada kegiatan"
            description="Tambahkan poster atau foto kegiatan untuk tahun ini."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Kegiatan
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Program
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Jenis
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Tanggal
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const program = TRAINER_ACTIVITY_PROGRAMS.find(
                    (entry) => entry.value === item.program,
                  )!;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="flex min-w-64 items-center gap-3">
                          <img
                            src={item.image_url}
                            alt=""
                            className="size-12 shrink-0 rounded-md border border-border object-cover"
                          />
                          <span className="font-medium text-foreground">
                            {item.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {program.label}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.kind === "poster" ? "Poster" : "Foto"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {friendlyDate(item.event_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            item.is_published
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {item.is_published ? "Terbit" : "Tersembunyi"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 px-2"
                            disabled={pendingAction}
                            onClick={() => void togglePublished(item)}
                            aria-label={
                              item.is_published ? "Sembunyikan" : "Terbitkan"
                            }
                          >
                            {item.is_published ? (
                              <EyeOff size={16} aria-hidden="true" />
                            ) : (
                              <Eye size={16} aria-hidden="true" />
                            )}
                            <span className="sr-only">
                              {item.is_published ? "Sembunyikan" : "Terbitkan"}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 px-2"
                            onClick={() => openEditForm(item)}
                          >
                            <Pencil size={16} aria-hidden="true" />
                            Ubah
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 px-2 text-destructive hover:text-destructive"
                            disabled={pendingAction}
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            Hapus
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={formOpen} onOpenChange={closeForm}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle>
              {editing ? "Ubah kegiatan" : "Tambah kegiatan"}
            </DialogTitle>
            <DialogDescription>
              Isi informasi kegiatan dan pilih gambar PNG, JPEG, atau WebP
              hingga 5 MB.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submitForm}
            className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="activity-title">Judul</Label>
                <Input
                  id="activity-title"
                  value={form.title}
                  maxLength={120}
                  required
                  onChange={(event) => updateForm("title", event.target.value)}
                  aria-invalid={Boolean(errors.title)}
                />
                <FormFieldError>{errors.title}</FormFieldError>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="activity-year">Tahun</Label>
                <Input
                  id="activity-year"
                  type="number"
                  min={2020}
                  max={2100}
                  value={form.year}
                  required
                  onChange={(event) => updateForm("year", event.target.value)}
                  aria-invalid={Boolean(errors.year)}
                />
                <FormFieldError>{errors.year}</FormFieldError>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="activity-program">Program</Label>
                <select
                  id="activity-program"
                  value={form.program}
                  onChange={(event) =>
                    updateForm(
                      "program",
                      event.target.value as TrainerActivityProgram,
                    )
                  }
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TRAINER_ACTIVITY_PROGRAMS.map((program) => (
                    <option key={program.value} value={program.value}>
                      {program.label} — {program.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="activity-kind">Jenis kegiatan</Label>
                <select
                  id="activity-kind"
                  value={form.kind}
                  onChange={(event) =>
                    updateForm(
                      "kind",
                      event.target.value as ActivityForm["kind"],
                    )
                  }
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="poster">Poster</option>
                  <option value="foto">Foto</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="activity-date">
                  Tanggal kegiatan (opsional)
                </Label>
                <Input
                  id="activity-date"
                  type="date"
                  value={form.eventDate}
                  onChange={(event) =>
                    updateForm("eventDate", event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="activity-order">Urutan</Label>
                <Input
                  id="activity-order"
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) =>
                    updateForm("sortOrder", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="activity-drive">Link Google Drive</Label>
              <Input
                id="activity-drive"
                type="url"
                value={form.driveUrl}
                required
                placeholder="https://drive.google.com/..."
                onChange={(event) => updateForm("driveUrl", event.target.value)}
                aria-invalid={Boolean(errors.drive_url)}
              />
              <FormFieldError>{errors.drive_url}</FormFieldError>
            </div>

            <div className="grid gap-3">
              <Label htmlFor="activity-image">Gambar</Label>
              <Input
                id="activity-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setErrors((previous) => ({ ...previous, image: undefined }));
                  setPreviewUrl(
                    nextFile
                      ? URL.createObjectURL(nextFile)
                      : (editing?.image_url ?? null),
                  );
                }}
                aria-invalid={Boolean(errors.image)}
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPEG, atau WebP. Ukuran maksimal 5 MB.
              </p>
              <FormFieldError>{errors.image}</FormFieldError>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={
                    form.title
                      ? `Pratinjau ${form.title}`
                      : "Pratinjau gambar kegiatan"
                  }
                  className="max-h-60 w-fit max-w-full rounded-md border border-border object-contain"
                />
              ) : null}
            </div>

            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(event) =>
                  updateForm("isPublished", event.target.checked)
                }
                className="size-4 accent-foreground"
              />
              Terbitkan setelah disimpan
            </label>

            <DialogFooter className="-mx-5 -mb-5 px-5 sm:-mx-6 sm:-mb-6 sm:px-6">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={saving}
                onClick={() => closeForm(false)}
              >
                Batal
              </Button>
              <Button type="submit" className="min-h-11" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan kegiatan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !pendingAction) setDeleteTarget(null);
        }}
        title="Hapus kegiatan?"
        description={`“${deleteTarget?.title ?? "Kegiatan ini"}” akan dihapus dari daftar. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus kegiatan"
        tone="destructive"
        pending={pendingAction}
        onConfirm={() => deleteItem()}
      />
    </ManagementShell>
  );
}
