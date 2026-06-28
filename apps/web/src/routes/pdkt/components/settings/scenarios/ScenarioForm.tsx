import React from "react";
import { ChevronRight } from "lucide-react";
import { PdktScenario } from "@trainers/types";
import { useCrudForm } from "../../../../../hooks/useCrudForm";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "../SettingsPrimitives";
import { ScenarioAdvancedSummary } from "./ScenarioAdvancedSummary";
import { ScenarioStickyFooter } from "./ScenarioStickyFooter";
import type { ScenarioWizardStep } from "./ScenarioWizardStepHeader";
import { ScenarioWizardStepHeader } from "./ScenarioWizardStepHeader";

interface ScenarioFormProps {
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  categories: string[];
  isNewCategoryInput: boolean;
  setIsNewCategoryInput: (val: boolean) => void;
  newScenarioCategory: string;
  setNewScenarioCategory: (val: string) => void;
  activeStep: ScenarioWizardStep;
  onStepChange: (step: ScenarioWizardStep) => void;
  onSave: () => void;
  onCancel: () => void;
  advancedContent?: React.ReactNode;
}

export function ScenarioForm({
  scenarioForm,
  categories,
  isNewCategoryInput,
  setIsNewCategoryInput,
  newScenarioCategory,
  setNewScenarioCategory,
  activeStep,
  onStepChange,
  onSave,
  onCancel,
  advancedContent,
}: ScenarioFormProps) {
  if (!scenarioForm.isOpen) return null;

  return (
    <div
      id="scenario-form"
      className="bg-card rounded-xl border border-border overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-border bg-foreground/[0.01]">
        <h3 className="font-bold text-foreground text-base tracking-tight">
          {scenarioForm.editingId ? "Edit Skenario" : "Tambah Skenario Baru"}
        </h3>
      </div>

      <div className="p-6 space-y-5">
        <ScenarioWizardStepHeader
          activeStep={activeStep}
          onStepChange={onStepChange}
        />

        <section
          id="scenario-form-basic"
          className="rounded-xl border border-border bg-background p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-sm font-semibold text-foreground tracking-tight">
                Info Dasar
              </h4>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Isi bagian ini dulu agar skenario bisa disimpan.
              </p>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              Langkah 1
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1">
              <SettingsField label="Kategori Masalah" id="scenario-category">
                {!isNewCategoryInput ? (
                  <SettingsSelect
                    id="scenario-category"
                    value={scenarioForm.draft.category || ""}
                    onChange={(e) => {
                      if (e.target.value === "NEW") {
                        setIsNewCategoryInput(true);
                        setNewScenarioCategory("");
                        scenarioForm.setDraft({ category: "" });
                      } else {
                        setNewScenarioCategory(e.target.value);
                        scenarioForm.setDraft({ category: e.target.value });
                      }
                    }}
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="NEW">+ Tambah Kategori Lainnya</option>
                  </SettingsSelect>
                ) : (
                  <div className="flex gap-2">
                    <SettingsInput
                      id="scenario-category-new"
                      type="text"
                      placeholder="Nama Kategori Baru"
                      value={newScenarioCategory}
                      onChange={(e) => {
                        setNewScenarioCategory(e.target.value);
                        scenarioForm.setDraft({ category: e.target.value });
                      }}
                    />
                    <button
                      onClick={() => setIsNewCategoryInput(false)}
                      className="px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </SettingsField>
            </div>

            <div className="col-span-2">
              <SettingsField label="Judul Skenario" id="scenario-title">
                <SettingsInput
                  id="scenario-title"
                  type="text"
                  placeholder="Contoh: Kesalahan Transaksi Real-time"
                  value={scenarioForm.draft.title || ""}
                  onChange={(e) =>
                    scenarioForm.setDraft({ title: e.target.value })
                  }
                />
              </SettingsField>
            </div>

            <div className="col-span-2">
              <SettingsField
                label="Deskripsi Detail Masalah"
                id="scenario-description"
              >
                <textarea
                  id="scenario-description"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors placeholder:text-muted-foreground/30 font-normal leading-relaxed"
                  rows={3}
                  placeholder="Jelaskan konteks masalah yang harus diselesaikan oleh agen..."
                  value={scenarioForm.draft.description || ""}
                  onChange={(e) =>
                    scenarioForm.setDraft({ description: e.target.value })
                  }
                />
              </SettingsField>
            </div>

            <div className="col-span-2 p-4 rounded-xl border border-border bg-card/25 flex items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Entitas Berizin OJK (LJK Resmi)
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Aktifkan jika skenario ini ditujukan untuk entitas legal berizin (Bank, Asuransi resmi) agar AI memakai nama asli LJK.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={scenarioForm.draft.isLicensed || false}
                  onChange={(e) =>
                    scenarioForm.setDraft({ isLicensed: e.target.checked })
                  }
                />
                <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border/40 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </section>

        <ScenarioAdvancedSummary
          draft={scenarioForm.draft}
          isExpanded={activeStep === "advanced"}
          onToggle={() =>
            onStepChange(activeStep === "advanced" ? "basic" : "advanced")
          }
        />

        <section
          id="scenario-form-advanced"
          aria-hidden={activeStep !== "advanced"}
          className={activeStep === "advanced" ? "space-y-5" : "hidden"}
        >
          {advancedContent}
        </section>
      </div>

      <ScenarioStickyFooter>
        <div className="flex items-center gap-2 flex-wrap">
          {activeStep === "advanced" ? (
            <button
              type="button"
              onClick={() => onStepChange("basic")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Kembali ke Info Dasar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStepChange("advanced")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Lanjut ke Detail
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!scenarioForm.draft.title || !scenarioForm.draft.description}
            className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Simpan
          </button>
        </div>
      </ScenarioStickyFooter>
    </div>
  );
}
