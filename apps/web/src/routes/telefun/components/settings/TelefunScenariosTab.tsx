import React, { useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { SettingsSwitch } from "../../../../components/settings/SettingsSwitch";
import {
  TelefunAppSettings as AppSettings,
  TelefunScenario as Scenario,
} from "../../telefunSettings";
import { Button } from "../../../../components/ui/button";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "../../../../components/settings/SettingsPrimitives";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeTelefunScenarioDraft } from "./telefunDraftNormalizers";

const ALL_CATEGORIES = "";

interface TelefunScenariosTabProps {
  /** Tempat dialog konfirmasi dirender (wadah dialog Pengaturan). */
  confirmContainer?: HTMLElement | null;
  scenarios: Scenario[];
  scenarioForm: ReturnType<typeof useCrudForm<Scenario>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunScenariosTab: React.FC<TelefunScenariosTabProps> = ({
  confirmContainer,
  scenarios,
  scenarioForm,
  setLocalSettings,
}) => {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: "discard" } | { kind: "delete"; id: string } | null
  >(null);
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);

  const categories = Array.from(
    new Set(
      scenarios.flatMap((scenario) =>
        scenario.category ? [scenario.category] : [],
      ),
    ),
  );
  const activeCount = scenarios.filter((scenario) => scenario.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const setAllActive = (isActive: boolean) =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((scenario) => ({ ...scenario, isActive })),
    }));

  const toggleScenario = (id: string) =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((scenario) =>
        scenario.id === id
          ? { ...scenario, isActive: !scenario.isActive }
          : scenario,
      ),
    }));

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "delete") {
      const { id } = pendingConfirm;
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((scenario) => scenario.id !== id),
      }));
    } else {
      scenarioForm.close();
    }
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

  // Kategori yang hilang (skenario terakhirnya dihapus) kembali ke "Semua".
  const activeCategory = categories.includes(categoryFilter)
    ? categoryFilter
    : ALL_CATEGORIES;
  const normalizedQuery = query.trim().toLowerCase();
  const visible = scenarios.filter(
    (scenario) =>
      (!activeCategory || scenario.category === activeCategory) &&
      (!normalizedQuery ||
        [scenario.title, scenario.category].some((text) =>
          (text || "").toLowerCase().includes(normalizedQuery),
        )),
  );

  const handleAddClick = () => {
    scenarioForm.openAdd();
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
    setIsScenarioScriptEnabled(false);
  };

  const handleEditClick = (scenario: Scenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category || "");
    setIsNewCategoryInput(false);
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
  };

  const handleSaveScenario = () => {
    const category = isNewCategoryInput
      ? newScenarioCategory
      : newScenarioCategory || "Umum";
    if (
      !scenarioForm.draft.title ||
      !scenarioForm.draft.instruction ||
      !category
    )
      return;

    const normalizedDraft = normalizeTelefunScenarioDraft({
      ...scenarioForm.draft,
      category,
      script: isScenarioScriptEnabled ? scenarioForm.draft.script : "",
    });
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: scenarioForm.save(prev.scenarios, normalizedDraft),
    }));
    scenarioForm.close();
  };

  const handleCancelScenarioForm = () => {
    if (scenarioForm.isDirty(scenarios)) {
      setPendingConfirm({ kind: "discard" });
      return;
    }
    scenarioForm.close();
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
            onClick={handleCancelScenarioForm}
            className="min-h-[44px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>

        <div className="flex flex-col gap-6">
          <SettingsField
            label="Kategori"
            id="telefun-scenario-category"
            required
          >
            {!isNewCategoryInput ? (
              <SettingsSelect
                id="telefun-scenario-category"
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
                  id="telefun-scenario-category"
                  value={newScenarioCategory}
                  onChange={(event) => {
                    setNewScenarioCategory(event.target.value);
                    scenarioForm.setDraft({ category: event.target.value });
                  }}
                  placeholder="Nama kategori baru"
                  className="min-w-48 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewCategoryInput(false)}
                  className="min-h-[44px]"
                >
                  Batal
                </Button>
              </div>
            )}
          </SettingsField>

          <SettingsField
            label="Judul skenario"
            id="telefun-scenario-title"
            required
          >
            <SettingsInput
              id="telefun-scenario-title"
              placeholder="Contoh: Gagal Transfer"
              value={scenarioForm.draft.title || ""}
              onChange={(event) =>
                scenarioForm.setDraft({ title: event.target.value })
              }
            />
          </SettingsField>

          <SettingsField
            label="Deskripsi skenario"
            id="telefun-scenario-instruction"
            required
          >
            <SettingsTextarea
              id="telefun-scenario-instruction"
              rows={3}
              className="min-h-20 resize-none"
              placeholder="Jelaskan masalah konsumen dan apa yang ia butuhkan."
              value={scenarioForm.draft.instruction || ""}
              onChange={(event) =>
                scenarioForm.setDraft({ instruction: event.target.value })
              }
            />
          </SettingsField>

          <SettingsField label="Alur panggilan" id="telefun-scenario-script">
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
              id="telefun-scenario-script"
              className={cn(
                "min-h-40 resize-y disabled:cursor-not-allowed",
                !isScenarioScriptEnabled && "hidden",
              )}
              rows={8}
              value={scenarioForm.draft.script || ""}
              onChange={(event) =>
                scenarioForm.setDraft({ script: event.target.value })
              }
              disabled={!isScenarioScriptEnabled}
              placeholder={`Contoh format 1 - Dialog:\nAgent: Selamat pagi, ada yang bisa saya bantu?\nKonsumen: Mas saya ada masalah transaksi.\n\nContoh format 2 - Alur:\nAwal:\n- Konsumen membuka telepon dengan nada panik.`}
            />
          </SettingsField>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelScenarioForm}
            className="min-h-[44px]"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveScenario}
            className="min-h-[44px]"
            disabled={
              !scenarioForm.draft.title ||
              !scenarioForm.draft.instruction ||
              !(isNewCategoryInput
                ? newScenarioCategory
                : scenarioForm.draft.category)
            }
          >
            Terapkan
          </Button>
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Skenario
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Setiap panggilan mengambil satu skenario aktif secara acak. Nama
            skenario baru terlihat oleh peserta di Telaah, setelah panggilan
            selesai.
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
            : "Tidak ada skenario yang cocok dengan pencarian atau filter."}
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
                onCheckedChange={() => toggleScenario(scenario.id)}
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
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {scenario.category && (
                    <span className="whitespace-nowrap">
                      {scenario.category}
                    </span>
                  )}
                  <span className="whitespace-nowrap text-fg2">
                    {scenario.script?.trim() ? "Ikuti skrip" : "Bebas"}
                  </span>
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
            onClick={() => setAllActive(true)}
            disabled={allSelected}
            className="min-h-[44px]"
          >
            Aktifkan semua
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAllActive(false)}
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
};
