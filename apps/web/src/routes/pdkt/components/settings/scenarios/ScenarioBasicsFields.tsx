import React from "react";
import { PDKT_PROMPT_INPUT_LIMITS, type PdktScenario } from "@trainers/types";
import { Button } from "../../../../../components/ui/button";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "@/components/settings/SettingsPrimitives";
import { ScenarioTemplateField } from "./ScenarioTemplateField";
import type { ScenarioCreationMode } from "./ScenarioCreationModePicker";

interface Props {
  creationMode: ScenarioCreationMode;
  categories: string[];
  newCategory: string;
  newCategoryMode: boolean;
  draft: Partial<PdktScenario>;
  attempted: Set<string>;
  categoryError: string;
  titleError: string;
  descriptionError: string;
  manualEmailError: string;
  descriptionLength: number;
  descriptionErrorId?: string;
  onNewCategoryChange: (value: string) => void;
  onNewCategoryModeChange: (value: boolean) => void;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
}

export function ScenarioBasicsFields({
  creationMode,
  categories,
  newCategory,
  newCategoryMode,
  draft,
  attempted,
  categoryError,
  titleError,
  descriptionError,
  manualEmailError,
  descriptionLength,
  descriptionErrorId,
  onNewCategoryChange,
  onNewCategoryModeChange,
  onDraftChange,
}: Props) {
  const categoryErrorVisible = attempted.has("category");
  const titleErrorVisible = attempted.has("title");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SettingsField
        label="Kategori"
        id={newCategoryMode ? "scenario-category-new" : "scenario-category"}
        required
        error={categoryErrorVisible ? categoryError : undefined}
      >
        {newCategoryMode ? (
          <div className="flex gap-2">
            <SettingsInput
              id="scenario-category-new"
              required
              aria-required="true"
              value={newCategory}
              placeholder="Nama kategori baru"
              aria-invalid={Boolean(categoryErrorVisible && categoryError)}
              aria-describedby="scenario-category-error"
              onChange={(event) => {
                onNewCategoryChange(event.target.value);
                onDraftChange({ category: event.target.value });
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onNewCategoryModeChange(false);
                onNewCategoryChange("");
                onDraftChange({ category: "" });
              }}
              className="min-h-11 px-3 text-xs"
            >
              Batal
            </Button>
          </div>
        ) : (
          <SettingsSelect
            id="scenario-category"
            required
            aria-required="true"
            value={draft.category || ""}
            aria-invalid={Boolean(categoryErrorVisible && categoryError)}
            aria-describedby="scenario-category-error"
            onChange={(event) => {
              if (event.target.value === "NEW") {
                onNewCategoryModeChange(true);
                onNewCategoryChange("");
                onDraftChange({ category: "" });
              } else onDraftChange({ category: event.target.value });
            }}
          >
            <option value="">Pilih kategori</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value="NEW">+ Tambah kategori</option>
          </SettingsSelect>
        )}
      </SettingsField>

      <SettingsField
        label="Judul"
        id="scenario-title"
        required
        error={titleErrorVisible ? titleError : undefined}
      >
        <SettingsInput
          id="scenario-title"
          required
          aria-required="true"
          value={draft.title || ""}
          placeholder="Contoh: Kesalahan Transaksi Real-time"
          aria-invalid={Boolean(titleErrorVisible && titleError)}
          aria-describedby="scenario-title-error"
          onChange={(event) => onDraftChange({ title: event.target.value })}
        />
      </SettingsField>

      {creationMode === "ai" ? (
        <SettingsField
          label="Deskripsi"
          id="scenario-description"
          required
          className="md:col-span-2"
          error={attempted.has("description") ? descriptionError : undefined}
        >
          <SettingsTextarea
            id="scenario-description"
            required
            aria-required="true"
            rows={4}
            value={draft.description || ""}
            placeholder="Jelaskan konteks masalah yang harus diselesaikan oleh agen..."
            aria-invalid={Boolean(
              attempted.has("description") && descriptionError,
            )}
            aria-describedby={[
              "scenario-description-counter",
              descriptionErrorId,
            ]
              .filter(Boolean)
              .join(" ")}
            maxLength={PDKT_PROMPT_INPUT_LIMITS.longText}
            onChange={(event) =>
              onDraftChange({ description: event.target.value })
            }
          />
          <p
            id="scenario-description-counter"
            className="text-xs text-muted-foreground"
          >
            {descriptionLength.toLocaleString("id-ID")} /{" "}
            {PDKT_PROMPT_INPUT_LIMITS.longText.toLocaleString("id-ID")}
          </p>
        </SettingsField>
      ) : (
        <div className="md:col-span-2">
          <ScenarioTemplateField
            draft={draft}
            onDraftChange={onDraftChange}
            error={attempted.has("manualEmail") ? manualEmailError : undefined}
          />
        </div>
      )}
    </div>
  );
}
