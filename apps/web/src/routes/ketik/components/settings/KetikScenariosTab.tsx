import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Edit2,
  Trash2,
  Plus,
  ArrowLeft,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import {
  KetikAppSettings,
  KetikScenario,
  KETIK_PROMPT_LIMITS,
} from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { normalizeKetikScenarioDraft } from "./ketikDraftNormalizers";

interface KetikScenariosTabProps {
  scenarios: KetikScenario[];
  scenarioForm: ReturnType<typeof useCrudForm<KetikScenario>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
}

export function KetikScenariosTab({
  scenarios,
  scenarioForm,
  setLocalSettings,
}: KetikScenariosTabProps) {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);
  const [pendingImageReads, setPendingImageReads] = useState(0);
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

  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?"))
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s) => s.id !== id),
      }));
  };

  const categories = Array.from(new Set(scenarios.map((s) => s.category)));
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
      <div className="flex flex-col gap-6 pb-10">
        <div className="border-b border-border pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={closeEditor}
            className="-ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke Daftar Skenario
          </Button>
        </div>
        <Card>
          <CardHeader className="border-b bg-muted/20 px-6 py-4">
            <CardTitle className="text-base tracking-tight">
              {scenarioForm.editingId
                ? "Edit Skenario"
                : "Tambah Skenario Baru"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kategori
              </Label>
              {!isNewCategoryInput ? (
                <select
                  className="h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                  <option value="">Pilih Kategori</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value="NEW">+ Tambah Kategori Lainnya</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="text"
                    className="flex-1 bg-background"
                    placeholder="Kategori Baru"
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
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Judul Masalah
              </Label>
              <Input
                type="text"
                className="bg-background"
                placeholder="Contoh: Gagal Transfer"
                value={scenarioForm.draft.title || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ title: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="ketik-scenario-description"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Deskripsi Masalah
              </Label>
              <Textarea
                id="ketik-scenario-description"
                className="min-h-20 resize-none bg-background"
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
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Skrip Percakapan
                </Label>
                <Button
                  type="button"
                  variant={isScenarioScriptEnabled ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={isScenarioScriptEnabled}
                  onClick={() => {
                    setIsScenarioScriptEnabled((prev) => {
                      if (prev) {
                        scenarioForm.setDraft({ script: "" });
                      }
                      return !prev;
                    });
                  }}
                  className="text-xs"
                >
                  <Check data-icon="inline-start" />
                  {isScenarioScriptEnabled ? "Ikuti Skrip" : "Sangat Kreatif"}
                </Button>
              </div>
              <Textarea
                className={`w-full rounded-md border p-3 text-sm outline-none resize-none transition-colors ${
                  isScenarioScriptEnabled
                    ? "border-border bg-background text-foreground focus:border-foreground"
                    : "border-border/40 bg-muted/30 text-muted-foreground cursor-not-allowed"
                }`}
                rows={8}
                value={scenarioForm.draft.script || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ script: e.target.value })
                }
                disabled={!isScenarioScriptEnabled}
                placeholder={`Contoh format 1 - Dialog:\nAgent: Selamat pagi, ada yang bisa saya bantu?\nKonsumen: Mas saya ada masalah transaksi.\n\nContoh format 2 - Alur:\nAwal:\n- Konsumen membuka chat dengan nada panik.`}
              />
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Checklist{" "}
                <span className="font-semibold text-foreground">
                  Ikuti Skrip
                </span>{" "}
                untuk mengaktifkan kolom ini. Saat tidak dicentang, konsumen
                akan dibiarkan lebih bebas dan kreatif mengikuti konteks
                skenario.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lampiran Gambar
              </Label>
              <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border transition-colors hover:border-foreground/30 hover:bg-muted/30">
                <div className="flex flex-col items-center justify-center py-4">
                  <ImageIcon className="mb-2 size-5 text-muted-foreground" />
                  <p className="text-xs font-medium text-foreground">
                    Pilih gambar untuk dilampirkan
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    PNG, JPG (Maksimal 500KB)
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
                          <Badge className="absolute bottom-1 left-1 bg-foreground/75 text-[10px] text-background hover:bg-foreground/75">
                            #{idx}
                          </Badge>
                        </div>
                        <Input
                          type="text"
                          value={scenarioForm.draft.imageAlts?.[idx] ?? ""}
                          onChange={(e) => handleAltChange(idx, e.target.value)}
                          placeholder="Keterangan gambar..."
                          maxLength={KETIK_PROMPT_LIMITS.imageAlt}
                          aria-label={`Keterangan gambar ${idx + 1}`}
                          className="h-8 bg-background px-2 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2.5 border-t bg-muted/20 px-0 py-4">
            <Button type="button" variant="outline" onClick={closeEditor}>
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
            >
              Simpan
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-6 pb-10">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Daftar Skenario
          </h3>
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
            {activeCount} / {totalScenarios} AKTIF
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={allSelected}
          >
            Pilih Semua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="text-destructive hover:text-destructive"
          >
            Hapus Semua
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {scenarios.map((scenario) => (
          <Card
            key={scenario.id}
            className={`transition-colors ${
              scenario.isActive
                ? "border-border/80 bg-card"
                : "border-border/30 bg-card/40 opacity-60 hover:opacity-100"
            }`}
          >
            <CardContent className="flex items-start gap-3 p-4">
              <div className="pt-0.5">
                <Button
                  type="button"
                  variant={scenario.isActive ? "default" : "outline"}
                  size="icon-lg"
                  aria-label={`${scenario.isActive ? "Nonaktifkan" : "Aktifkan"} skenario ${scenario.title}`}
                  aria-pressed={scenario.isActive}
                  onClick={() => handleToggleScenario(scenario.id)}
                  className="size-11 shrink-0 rounded-md"
                >
                  <Check data-icon="inline" />
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-primary/20 bg-primary/10 text-[11px] text-primary"
                  >
                    {scenario.category}
                  </Badge>
                  <h4 className="truncate text-sm font-semibold text-foreground">
                    {scenario.title}
                  </h4>
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {scenario.description}
                </p>
                {scenario.images && scenario.images.length > 0 && (
                  <Badge
                    variant="outline"
                    className="mt-2.5 gap-1.5 text-[11px]"
                  >
                    <ImageIcon data-icon="inline-start" />
                    {scenario.images.length} Lampiran
                  </Badge>
                )}
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Edit skenario ${scenario.title}`}
                  onClick={() => handleEditClick(scenario)}
                >
                  <Edit2 data-icon="inline" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus skenario ${scenario.title}`}
                  onClick={() => handleDeleteScenario(scenario.id)}
                >
                  <Trash2 data-icon="inline" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleAddClick}
        className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
      >
        <Plus data-icon="inline" />
        <span className="text-sm font-medium">Tambah Skenario Baru</span>
      </Button>
    </div>
  );
}
