import React from "react";
import { X } from "lucide-react";
import { PdktScenario } from "@trainers/types";
import { useCrudForm } from "../../../../../hooks/useCrudForm";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "../SettingsPrimitives";

interface ScenarioFormProps {
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  categories: string[];
  isNewCategoryInput: boolean;
  setIsNewCategoryInput: (val: boolean) => void;
  newScenarioCategory: string;
  setNewScenarioCategory: (val: string) => void;
  onSave: () => void;
  onCancel: () => void;
  children?: React.ReactNode; // For attachments and template fields
}

export function ScenarioForm({
  scenarioForm,
  categories,
  isNewCategoryInput,
  setIsNewCategoryInput,
  newScenarioCategory,
  setNewScenarioCategory,
  onSave,
  onCancel,
  children,
}: ScenarioFormProps) {
  if (!scenarioForm.isOpen) return null;

  return (
    <div
      id="scenario-form"
      className="bg-card rounded-xl border border-border/80 shadow-md overflow-hidden mt-6 relative"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
      <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center bg-muted/10">
        <h3 className="font-semibold text-foreground text-sm tracking-tight">
          {scenarioForm.editingId ? "Edit Skenario" : "Tambah Skenario"}
        </h3>
        <button
          onClick={onCancel}
          className="w-8 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="col-span-2 md:col-span-1">
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
                  className="px-3 text-xs font-semibold text-red-500 hover:bg-red-500/5 rounded-lg transition-all cursor-pointer"
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
          <SettingsField label="Deskripsi Detail Masalah" id="scenario-description">
            <textarea
              id="scenario-description"
              className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-medium placeholder:text-muted-foreground/30"
              rows={3}
              placeholder="Jelaskan konteks masalah yang harus diselesaikan oleh agen..."
              value={scenarioForm.draft.description || ""}
              onChange={(e) =>
                scenarioForm.setDraft({ description: e.target.value })
              }
            />
          </SettingsField>
        </div>

        <div className="col-span-2 p-4 rounded-lg border border-border/80 bg-muted/10 flex items-center justify-between gap-4">
          <div>
            <label className="block text-xs font-bold text-foreground">
              Entitas Berizin OJK (LJK Resmi)
            </label>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed font-medium">
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
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {children}

        <div className="col-span-2 flex justify-end gap-2 pt-4 border-t border-border/40 mt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-all cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={onSave}
            disabled={!scenarioForm.draft.title || !scenarioForm.draft.description}
            className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scenarioForm.editingId ? "Perbarui Skenario" : "Simpan Skenario"}
          </button>
        </div>
      </div>
    </div>
  );
}
