import React, { useState } from "react";
import { ArrowLeft, Check, Edit2, Plus, Trash2 } from "lucide-react";
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

interface TelefunScenariosTabProps {
  scenarios: Scenario[];
  scenarioForm: ReturnType<typeof useCrudForm<Scenario>>;
  handleSelectAll: () => void;
  handleUnselectAll: () => void;
  handleToggleScenario: (id: string) => void;
  handleDeleteScenario: (id: string) => void;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunScenariosTab: React.FC<TelefunScenariosTabProps> = ({
  scenarios,
  scenarioForm,
  handleSelectAll,
  handleUnselectAll,
  handleToggleScenario,
  handleDeleteScenario,
  setLocalSettings,
}) => {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);

  const categories = Array.from(
    new Set(scenarios.map((scenario) => scenario.category)),
  );
  const activeCount = scenarios.filter((scenario) => scenario.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleAddClick = () => {
    scenarioForm.openAdd();
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
    setIsScenarioScriptEnabled(false);
  };

  const handleEditClick = (scenario: Scenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category || "");
    setIsNewCategoryInput(!categories.includes(scenario.category));
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
      if (!window.confirm("Skenario belum disimpan. Buang perubahan?")) return;
    }
    scenarioForm.close();
  };

  if (scenarioForm.isOpen) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {scenarioForm.editingId ? "Edit Skenario" : "Tambah Skenario Baru"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelScenarioForm}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>

        <div id="scenario-form" className="flex flex-col gap-4">
          <SettingsField label="Kategori" id="telefun-scenario-category">
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
                <option value="">Pilih Kategori</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="NEW">+ Tambah Kategori Lainnya</option>
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
                  placeholder="Kategori Baru"
                  className="min-w-48 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewCategoryInput(false)}
                >
                  Batal
                </Button>
              </div>
            )}
          </SettingsField>

          <SettingsField label="Judul Masalah" id="telefun-scenario-title">
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
            label="Deskripsi Masalah"
            id="telefun-scenario-instruction"
          >
            <SettingsTextarea
              id="telefun-scenario-instruction"
              rows={3}
              placeholder="Jelaskan konteks masalah..."
              value={scenarioForm.draft.instruction || ""}
              onChange={(event) =>
                scenarioForm.setDraft({ instruction: event.target.value })
              }
            />
          </SettingsField>

          <SettingsField
            label="Skrip Percakapan"
            id="telefun-scenario-script"
            helperText='Centang "Ikuti Skrip" agar AI menggunakan draf dialog/alur yang Anda tentukan di bawah.'
          >
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant={isScenarioScriptEnabled ? "secondary" : "outline"}
                aria-pressed={isScenarioScriptEnabled}
                onClick={() => {
                  setIsScenarioScriptEnabled((previous) => {
                    if (previous) scenarioForm.setDraft({ script: "" });
                    return !previous;
                  });
                }}
              >
                {isScenarioScriptEnabled ? "Ikuti Skrip" : "Sangat Kreatif"}
              </Button>
            </div>
            <SettingsTextarea
              id="telefun-scenario-script"
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
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveScenario}
            disabled={
              !scenarioForm.draft.title ||
              !scenarioForm.draft.instruction ||
              !(isNewCategoryInput
                ? newScenarioCategory
                : scenarioForm.draft.category)
            }
          >
            Simpan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Daftar Skenario
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeCount} / {totalScenarios} AKTIF
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleSelectAll}
            disabled={allSelected}
          >
            Pilih Semua
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleUnselectAll}
            disabled={noneSelected}
          >
            Hapus Semua
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {scenarios.map((scenario) => (
          <li
            key={scenario.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
          >
            <Button
              type="button"
              variant={scenario.isActive ? "default" : "outline"}
              size="icon-lg"
              aria-pressed={scenario.isActive}
              aria-label={`${scenario.isActive ? "Nonaktifkan" : "Aktifkan"} skenario ${scenario.title}`}
              onClick={() => handleToggleScenario(scenario.id)}
              className={scenario.isActive ? "" : "text-muted-foreground"}
            >
              {scenario.isActive ? (
                <Check data-icon="inline" />
              ) : (
                <span aria-hidden="true" className="size-4" />
              )}
            </Button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {scenario.category}
                </span>
                <h4 className="truncate text-sm font-medium text-foreground">
                  {scenario.title}
                </h4>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {scenario.instruction}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={() => handleEditClick(scenario)}
                aria-label={`Edit ${scenario.title}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Edit2 data-icon="inline" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={() => handleDeleteScenario(scenario.id)}
                aria-label={`Hapus ${scenario.title}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 data-icon="inline" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        onClick={handleAddClick}
        className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
      >
        <Plus data-icon="inline" />
        <span className="text-sm font-medium">Tambah Skenario Baru</span>
      </Button>
    </div>
  );
};
