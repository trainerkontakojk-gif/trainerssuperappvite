import React, { useEffect, useRef, useState } from "react";
import {
  Trash2,
  Plus,
  ArrowLeft,
  Image as ImageIcon,
  Search,
  X,
} from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { SettingsSwitch } from "../../../../components/settings/SettingsSwitch";
import { Button } from "../../../../components/ui/button";
import { Label } from "../../../../components/ui/label";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "../../../../components/settings/SettingsPrimitives";
import {
  KetikAppSettings,
  KetikScenario,
  KETIK_PROMPT_LIMITS,
} from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { normalizeKetikScenarioDraft } from "./ketikDraftNormalizers";

interface KetikScenariosTabProps {
  /** Tempat dialog konfirmasi dirender (wadah dialog Pengaturan). */
  confirmContainer?: HTMLElement | null;
  scenarios: KetikScenario[];
  scenarioForm: ReturnType<typeof useCrudForm<KetikScenario>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
}

const ALL_CATEGORIES = "";

export function KetikScenariosTab({
  confirmContainer,
  scenarios,
  scenarioForm,
  setLocalSettings,
}: KetikScenariosTabProps) {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);
  const [pendingImageReads, setPendingImageReads] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: "discard" } | { kind: "delete"; id: string } | null
  >(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const editorGenerationRef = useRef(0);
  const pendingImageReadsRef = useRef(0);

  const beginEditor = () => {
    editorGenerationRef.current += 1;
    pendingImageReadsRef.current = 0;
    setPendingImageReads(0);
  };

  const closeEditor = () => {
    editorGenerationRef.current += 1;
    pendingImageReadsRef.current = 0;
    setPendingImageReads(0);
    scenarioForm.close();
  };

  useEffect(() => {
    return () => {
      editorGenerationRef.current += 1;
    };
  }, []);

  const handleSelectAll = () =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: true })),
    }));

  const handleUnselectAll = () =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: false })),
    }));

  const handleToggleScenario = (id: string) =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s,
      ),
    }));

  const deleteScenario = (id: string) =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.filter((s) => s.id !== id),
    }));

  const cancelEditor = () => {
    if (scenarioForm.isDirty(scenarios)) {
      setPendingConfirm({ kind: "discard" });
      return;
    }
    closeEditor();
  };

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "delete") deleteScenario(pendingConfirm.id);
    else closeEditor();
    setPendingConfirm(null);
  };

  const confirmDialog = (
    <ConfirmDialog
      open={pendingConfirm !== null}
      container={confirmContainer}
      {...(pendingConfirm?.kind === "discard"
        ? {
            title: "Buang perubahan skenario?",
            description: "Perubahan yang belum diterapkan akan hilang.",
            cancelLabel: "Lanjut mengubah",
            confirmLabel: "Buang perubahan",
          }
        : {
            title: "Hapus skenario ini?",
            description: "Perubahan berlaku setelah Anda memilih Simpan.",
            confirmLabel: "Hapus skenario",
          })}
      onConfirm={confirmPending}
      onCancel={() => setPendingConfirm(null)}
    />
  );

  const categories = Array.from(
    new Set(scenarios.map((s) => s.category).filter(Boolean)),
  );
  const activeCount = scenarios.filter((s) => s.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;
  const scenarioDescription = scenarioForm.draft.description || "";
  const formattedScenarioDescriptionLimit =
    KETIK_PROMPT_LIMITS.scenarioDescription.toLocaleString("id-ID");

  const handleAddClick = () => {
    beginEditor();
    scenarioForm.openAdd();
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
    setIsScenarioScriptEnabled(false);
  };

  const handleEditClick = (scenario: KetikScenario) => {
    beginEditor();
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
  };

  const handleSaveScenario = () => {
    if (pendingImageReads > 0) return;
    const category = isNewCategoryInput
      ? newScenarioCategory
      : newScenarioCategory || "Umum";
    if (
      !scenarioForm.draft.title ||
      !scenarioForm.draft.description ||
      !category
    )
      return;

    const draftScript = isScenarioScriptEnabled
      ? scenarioForm.draft.script
      : "";

    const normalizedDraft = normalizeKetikScenarioDraft({
      ...scenarioForm.draft,
      category,
      script: draftScript,
    });

    setLocalSettings((prev) => ({
      ...prev,
      scenarios: scenarioForm.save(prev.scenarios, normalizedDraft),
    }));

    closeEditor();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const readGeneration = editorGenerationRef.current;
      Array.from(e.target.files).forEach((file) => {
        if (file.size > 500 * 1024) {
          notify.error(
            `File ${file.name} terlalu besar (>500KB). Mohon kompres gambar terlebih dahulu.`,
          );
          return;
        }
        const draftGeneration = scenarioForm.getDraftGeneration();
        const reader = new FileReader();
        let settled = false;
        pendingImageReadsRef.current += 1;
        setPendingImageReads(pendingImageReadsRef.current);
        const finishRead = () => {
          if (settled) return;
          settled = true;
          if (editorGenerationRef.current === readGeneration) {
            pendingImageReadsRef.current = Math.max(
              0,
              pendingImageReadsRef.current - 1,
            );
            setPendingImageReads(pendingImageReadsRef.current);
          }
        };
        const isCurrentEditor = () =>
          editorGenerationRef.current === readGeneration &&
          scenarioForm.getDraftGeneration() === draftGeneration &&
          scenarioForm.isOpen;
        reader.onloadend = () => {
          if (settled) return;
          if (!isCurrentEditor()) {
            finishRead();
            return;
          }
          if (typeof reader.result !== "string") {
            notify.error(`Gagal membaca file ${file.name}.`);
            finishRead();
            return;
          }
          scenarioForm.setDraft((previous) => ({
            images: [...(previous.images || []), reader.result as string],
            imageAlts: [...(previous.imageAlts || []), ""],
          }));
          finishRead();
        };
        reader.onerror = () => {
          if (settled) return;
          if (isCurrentEditor())
            notify.error(`Gagal membaca file ${file.name}.`);
          finishRead();
        };
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    scenarioForm.setDraft((previous) => ({
      images: (previous.images || []).filter((_, idx) => idx !== indexToRemove),
      imageAlts: (previous.imageAlts || []).filter(
        (_, idx) => idx !== indexToRemove,
      ),
    }));
  };

  const handleAltChange = (index: number, value: string) => {
    if (value.length > KETIK_PROMPT_LIMITS.imageAlt) return;
    scenarioForm.setDraft((previous) => {
      const nextAlts = [...(previous.imageAlts || [])];
      // ensure length matches images length (pad with empty strings if needed for legacy data)
      const imgLen = (previous.images || []).length;
      while (nextAlts.length < imgLen) nextAlts.push("");
      nextAlts[index] = value;
      return { imageAlts: nextAlts };
    });
  };

  if (scenarioForm.isOpen) {
    return (
      <div id="scenario-form" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            {scenarioForm.editingId ? "Ubah skenario" : "Skenario baru"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelEditor}
            className="min-h-[44px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>
        <div className="flex flex-col gap-6">
          <SettingsField label="Kategori" id="ketik-scenario-category" required>
            {!isNewCategoryInput ? (
              <SettingsSelect
                id="ketik-scenario-category"
                value={scenarioForm.draft.category || ""}
                onChange={(event) => {
                  if (event.target.value === "NEW") {
                    setIsNewCategoryInput(true);
                    setNewScenarioCategory("");
                    scenarioForm.setDraft({ category: "" });
                  } else {
                    setNewScenarioCategory(event.target.value);
                    scenarioForm.setDraft({ category: event.target.value });
                  }
                }}
              >
                <option value="">Pilih kategori</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="NEW">+ Kategori baru</option>
              </SettingsSelect>
            ) : (
              <div className="flex flex-wrap gap-2">
                <SettingsInput
                  id="ketik-scenario-category"
                  type="text"
                  className="min-w-48 flex-1"
                  placeholder="Nama kategori baru"
                  value={newScenarioCategory}
                  onChange={(e) => {
                    setNewScenarioCategory(e.target.value);
                    scenarioForm.setDraft({ category: e.target.value });
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewCategoryInput(false)}
                  className="text-destructive hover:text-destructive"
                >
                  Batal
                </Button>
              </div>
            )}
          </SettingsField>
          <SettingsField
            label="Judul skenario"
            id="ketik-scenario-title"
            required
          >
            <SettingsInput
              id="ketik-scenario-title"
              type="text"
              placeholder="Contoh: Gagal Transfer"
              value={scenarioForm.draft.title || ""}
              onChange={(e) => scenarioForm.setDraft({ title: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            label="Deskripsi skenario"
            id="ketik-scenario-description"
            required
          >
            <SettingsTextarea
              id="ketik-scenario-description"
              className="min-h-20 resize-none"
              rows={3}
              value={scenarioDescription}
              maxLength={KETIK_PROMPT_LIMITS.scenarioDescription}
              aria-describedby="ketik-scenario-description-counter"
              onChange={(e) =>
                scenarioForm.setDraft({ description: e.target.value })
              }
            />
            <p
              id="ketik-scenario-description-counter"
              className="mt-2 text-xs text-muted-foreground"
            >
              {scenarioDescription.length.toLocaleString("id-ID")} /{" "}
              {formattedScenarioDescriptionLimit}
            </p>
          </SettingsField>
          <SettingsField label="Alur chat" id="ketik-scenario-script">
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  Ikuti skrip
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  Aktifkan bila konsumen harus mengikuti alur yang Anda tulis.
                  Bila mati, konsumen bebas menanggapi sesuai konteks skenario.
                </span>
              </span>
              <SettingsSwitch
                label="Ikuti skrip"
                checked={isScenarioScriptEnabled}
                onCheckedChange={(checked) => {
                  if (!checked) scenarioForm.setDraft({ script: "" });
                  setIsScenarioScriptEnabled(checked);
                }}
              />
            </div>
            <SettingsTextarea
              id="ketik-scenario-script"
              className={cn(
                "min-h-40 resize-y disabled:cursor-not-allowed",
                !isScenarioScriptEnabled && "hidden",
              )}
              rows={8}
              value={scenarioForm.draft.script || ""}
              onChange={(e) =>
                scenarioForm.setDraft({ script: e.target.value })
              }
              disabled={!isScenarioScriptEnabled}
              placeholder={`Contoh format 1 - Dialog:\nAgent: Selamat pagi, ada yang bisa saya bantu?\nKonsumen: Mas saya ada masalah transaksi.\n\nContoh format 2 - Alur:\nAwal:\n- Konsumen membuka chat dengan nada panik.`}
            />
          </SettingsField>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Lampiran gambar
            </Label>
            <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border transition-colors hover:border-foreground/30 hover:bg-muted/30">
              <div className="flex flex-col items-center justify-center py-4">
                <ImageIcon className="mb-2 size-5 text-muted-foreground" />
                <p className="text-xs font-medium text-foreground">
                  Pilih gambar untuk dilampirkan
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  PNG atau JPG, maksimal 500 KB
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            {pendingImageReads > 0 && (
              <p role="status" className="mt-3 text-xs text-muted-foreground">
                Membaca lampiran...
              </p>
            )}
            {scenarioForm.draft.images &&
              scenarioForm.draft.images.length > 0 && (
                <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                  {scenarioForm.draft.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="flex w-28 shrink-0 flex-col gap-1.5"
                    >
                      <div className="group relative h-20 w-28">
                        <img
                          src={img}
                          alt={
                            scenarioForm.draft.imageAlts?.[idx] ||
                            `Preview ${idx + 1}`
                          }
                          className="h-full w-full rounded-md border border-border object-cover"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute -top-2 -right-2 rounded-full shadow"
                          aria-label={`Hapus gambar ${idx + 1}`}
                        >
                          <X data-icon="inline" />
                        </Button>
                        <span className="absolute bottom-1 left-1 rounded-md bg-foreground/75 px-1.5 text-xs font-medium text-background">
                          #{idx}
                        </span>
                      </div>
                      <SettingsInput
                        type="text"
                        value={scenarioForm.draft.imageAlts?.[idx] ?? ""}
                        onChange={(e) => handleAltChange(idx, e.target.value)}
                        placeholder="Keterangan gambar..."
                        maxLength={KETIK_PROMPT_LIMITS.imageAlt}
                        aria-label={`Keterangan gambar ${idx + 1}`}
                        className="h-8 min-h-8 bg-background px-2 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={cancelEditor}
            className="min-h-[44px]"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveScenario}
            disabled={
              pendingImageReads > 0 ||
              !scenarioForm.draft.title ||
              !scenarioForm.draft.description
            }
            className="min-h-[44px]"
          >
            Terapkan
          </Button>
        </div>
        {confirmDialog}
      </div>
    );
  }

  const activeCategory = categories.includes(categoryFilter)
    ? categoryFilter
    : ALL_CATEGORIES;
  const needle = query.trim().toLowerCase();
  const visible = scenarios.filter(
    (scenario) =>
      (!activeCategory || scenario.category === activeCategory) &&
      (!needle ||
        `${scenario.title} ${scenario.description}`
          .toLowerCase()
          .includes(needle)),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Skenario
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Setiap sesi mengambil satu skenario aktif secara acak. Nama skenario
            baru terlihat oleh peserta di Telaah, setelah chat selesai.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleAddClick}
          className="min-h-[44px] shrink-0"
        >
          <Plus data-icon="inline-start" />
          Skenario baru
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-[44px] min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground focus-within:border-foreground">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari skenario"
            aria-label="Cari skenario"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {categories.length > 1 && (
          <div
            role="group"
            aria-label="Filter kategori"
            className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] text-xs font-medium"
          >
            {[ALL_CATEGORIES, ...categories].map((item) => {
              const selected = item === activeCategory;
              return (
                <button
                  key={item || "semua"}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategoryFilter(item)}
                  className={cn(
                    "min-h-[44px] shrink-0 rounded-md px-3 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-fg2 hover:text-foreground",
                  )}
                >
                  {item || "Semua"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          {scenarios.length === 0
            ? "Belum ada skenario. Tambahkan skenario baru untuk mulai."
            : "Tidak ada skenario yang cocok dengan pencarian."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((scenario) => (
            <li
              key={scenario.id}
              className="flex items-center gap-2 py-2 pr-2 pl-1.5 transition-colors hover:bg-muted/40"
            >
              <SettingsSwitch
                label={`${scenario.isActive ? "Nonaktifkan" : "Aktifkan"} ${scenario.title}`}
                checked={scenario.isActive}
                onCheckedChange={() => handleToggleScenario(scenario.id)}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={cn(
                    "line-clamp-2 font-semibold",
                    scenario.isActive
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {scenario.title}
                </span>
                {/* Tanpa pemisah "·": di layar sempit butir turun ke baris baru tanpa titik menggantung. */}
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {scenario.category && (
                    <span className="whitespace-nowrap">
                      {scenario.category}
                    </span>
                  )}
                  <span className="whitespace-nowrap text-fg2">
                    {scenario.script?.trim() ? "Ikuti skrip" : "Bebas"}
                  </span>
                  {scenario.images && scenario.images.length > 0 && (
                    <span className="whitespace-nowrap">
                      {scenario.images.length} lampiran
                    </span>
                  )}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEditClick(scenario)}
                aria-label={`Ubah ${scenario.title}`}
                className="min-h-[44px] shrink-0"
              >
                Ubah
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={() =>
                  setPendingConfirm({ kind: "delete", id: scenario.id })
                }
                aria-label={`Hapus ${scenario.title}`}
                title="Hapus"
                className="min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 data-icon="inline" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {activeCount} dari {totalScenarios} skenario aktif. Skenario nonaktif
          tetap tersimpan.
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            disabled={allSelected}
            className="min-h-[44px]"
          >
            Aktifkan semua
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="min-h-[44px]"
          >
            Nonaktifkan semua
          </Button>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
