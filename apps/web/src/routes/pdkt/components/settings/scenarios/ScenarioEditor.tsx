import type React from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { PDKT_PROMPT_INPUT_LIMITS, type PdktScenario } from "@trainers/types";
import { Button } from "../../../../../components/ui/button";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "@/components/settings/SettingsPrimitives";
import { ScenarioAttachments } from "./ScenarioAttachments";
import { ScenarioModeField } from "./ScenarioModeField";
import { ScenarioRecipientsField } from "./ScenarioRecipientsField";
import { ScenarioTemplateField } from "./ScenarioTemplateField";
import type {
  ScenarioCreationMode,
  ScenarioValidationErrorKey,
} from "./ScenarioCreationValidation";
import { getReplyDirection } from "./replyDirections";

const NEW_CATEGORY = "NEW";

type IdentityKey = "name" | "bodyName" | "email" | "city";

interface Props {
  isNew: boolean;
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
  creationMode: ScenarioCreationMode;
  onModeChange: (mode: ScenarioCreationMode) => void;
  categories: string[];
  newCategory: string;
  newCategoryMode: boolean;
  onNewCategoryChange: (value: string) => void;
  onNewCategoryModeChange: (value: boolean) => void;
  /** Pesan galat yang sudah boleh tampil (setelah pengguna mencoba menerapkan). */
  errors: Partial<Record<ScenarioValidationErrorKey, string>>;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onIdentityChange: (key: IdentityKey, value: string) => void;
  attachments: {
    onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: (index: number) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    pendingReads: number;
  };
  onCancel: () => void;
  onApply: () => void;
  onDelete?: () => void;
}

function SectionHeading({
  id,
  number,
  title,
  description,
}: {
  id: string;
  number: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
        >
          {number}
        </span>
        <h4 id={id} className="text-[15px] font-semibold text-foreground">
          {title}
        </h4>
      </div>
      {description && (
        <p className="pl-[34px] text-[13px] leading-5 text-fg2">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * Editor skenario PDKT satu halaman: kasus, arah balasan, dan kunci jawaban
 * tampil bersamaan; identitas khusus dan lampiran ada di "Opsi tambahan".
 */
export function ScenarioEditor({
  isNew,
  draft,
  onDraftChange,
  creationMode,
  onModeChange,
  categories,
  newCategory,
  newCategoryMode,
  onNewCategoryChange,
  onNewCategoryModeChange,
  errors,
  advancedOpen,
  onAdvancedOpenChange,
  onIdentityChange,
  attachments,
  onCancel,
  onApply,
  onDelete,
}: Props) {
  const hiddenOjkRequest = getReplyDirection(draft) === "ojk_request_in_body";
  const descriptionLength = (draft.description || "").length;

  return (
    <div
      id="scenario-form"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      className="flex min-h-0 flex-1 flex-col bg-card"
    >
      <header className="flex shrink-0 flex-col items-start gap-1 border-b border-border px-5 py-3 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="-ml-2.5 min-h-[44px] gap-1.5 px-2.5 text-xs text-fg2"
        >
          <ChevronLeft data-icon="inline-start" />
          Semua skenario
        </Button>
        <h2
          id="scenario-wizard-title"
          className="font-display text-xl font-bold tracking-tight text-foreground"
        >
          {isNew ? "Skenario baru" : "Ubah skenario"}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        <div className="flex max-w-3xl flex-col gap-7">
          <section
            aria-labelledby="scenario-section-case"
            className="flex flex-col gap-4"
          >
            <SectionHeading
              id="scenario-section-case"
              number={1}
              title="Kasus"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <SettingsField
                label="Judul skenario"
                id="scenario-title"
                required
                error={errors.title}
              >
                <SettingsInput
                  id="scenario-title"
                  required
                  value={draft.title || ""}
                  placeholder="Contoh: Pinjaman lunas tetapi masih ditagih"
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={
                    errors.title ? "scenario-title-error" : undefined
                  }
                  onChange={(event) =>
                    onDraftChange({ title: event.target.value })
                  }
                />
              </SettingsField>
              <SettingsField
                label="Kategori"
                id={
                  newCategoryMode
                    ? "scenario-category-new"
                    : "scenario-category"
                }
                required
                error={errors.category}
              >
                {newCategoryMode ? (
                  <div className="flex gap-2">
                    <SettingsInput
                      id="scenario-category-new"
                      required
                      value={newCategory}
                      placeholder="Nama kategori baru"
                      aria-invalid={Boolean(errors.category)}
                      aria-describedby={
                        errors.category
                          ? "scenario-category-new-error"
                          : undefined
                      }
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
                      className="min-h-[44px] px-3 text-xs"
                    >
                      Batal
                    </Button>
                  </div>
                ) : (
                  <SettingsSelect
                    id="scenario-category"
                    className="min-h-[44px]"
                    required
                    value={draft.category || ""}
                    aria-invalid={Boolean(errors.category)}
                    aria-describedby={
                      errors.category ? "scenario-category-error" : undefined
                    }
                    onChange={(event) => {
                      if (event.target.value === NEW_CATEGORY) {
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
                    <option value={NEW_CATEGORY}>+ Kategori baru</option>
                  </SettingsSelect>
                )}
              </SettingsField>
            </div>

            <ScenarioModeField value={creationMode} onChange={onModeChange} />

            {creationMode === "ai" ? (
              <SettingsField
                label="Ringkasan masalah"
                id="scenario-description"
                required
                error={errors.description}
              >
                <SettingsTextarea
                  id="scenario-description"
                  required
                  rows={3}
                  value={draft.description || ""}
                  placeholder="Ceritakan apa yang dialami konsumen. AI memakai ini untuk menulis email."
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={[
                    "scenario-description-counter",
                    errors.description ? "scenario-description-error" : "",
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
              <ScenarioTemplateField
                draft={draft}
                onDraftChange={onDraftChange}
                error={errors.manualEmail}
              />
            )}
          </section>

          <div aria-hidden="true" className="h-px bg-border" />

          <section
            aria-labelledby="scenario-section-direction"
            className="flex flex-col gap-4"
          >
            <SectionHeading
              id="scenario-section-direction"
              number={2}
              title="Arah balasan"
              description="Kepada siapa konsumen sebenarnya meminta jawaban? AI menelaah ini pada aspek Arah penerima. Peserta tidak melihat pilihan ini."
            />
            <ScenarioRecipientsField
              draft={draft}
              onDraftChange={onDraftChange}
              labelledBy="scenario-section-direction"
            />
          </section>

          <div aria-hidden="true" className="h-px bg-border" />

          <section
            aria-labelledby="scenario-section-answer"
            className="flex flex-col gap-3"
          >
            <SectionHeading
              id="scenario-section-answer"
              number={3}
              title="Kunci jawaban"
              description="Inti tindakan atau informasi yang wajib ada di balasan. AI memakainya untuk menelaah, tanpa pernah menampilkannya ke peserta."
            />
            <SettingsTextarea
              id="scenario-expected-answer"
              aria-label="Kunci jawaban"
              aria-describedby="scenario-expected-answer-hint"
              rows={4}
              maxLength={PDKT_PROMPT_INPUT_LIMITS.longText}
              value={draft.expectedAnswer || ""}
              placeholder="Contoh: minta bukti pelunasan, jelaskan OJK akan meneruskan pengaduan, dan sebutkan perkiraan waktu tindak lanjut."
              onChange={(event) =>
                onDraftChange({ expectedAnswer: event.target.value })
              }
            />
            <p
              id="scenario-expected-answer-hint"
              className="text-xs leading-[18px] text-muted-foreground"
            >
              {hiddenOjkRequest
                ? 'Untuk arah "minta bantuan OJK", tulis jawaban substansi sesuai standar, bukan sekadar ucapan terima kasih.'
                : "Tulis poin intinya saja. Redaksi peserta boleh berbeda selama maksudnya sama."}
            </p>
          </section>

          <details
            open={advancedOpen}
            onToggle={(event) => onAdvancedOpenChange(event.currentTarget.open)}
            className="rounded-xl border border-border"
          >
            <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Opsi tambahan: identitas pengirim dan lampiran
            </summary>
            <div className="flex flex-col gap-6 border-t border-border p-4">
              <div className="flex flex-col gap-4">
                <div>
                  <h4 className="text-[13px] font-medium text-foreground">
                    Identitas pengirim khusus skenario ini
                  </h4>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Kosongkan untuk memakai pengaturan di tab Identitas
                    konsumen.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <SettingsField
                    label="Nama lengkap"
                    id="custom-sender-name"
                    optional
                  >
                    <SettingsInput
                      id="custom-sender-name"
                      value={draft.identity?.name || ""}
                      onChange={(event) =>
                        onIdentityChange("name", event.target.value)
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    label="Nama panggilan"
                    id="custom-body-name"
                    optional
                  >
                    <SettingsInput
                      id="custom-body-name"
                      value={draft.identity?.bodyName || ""}
                      onChange={(event) =>
                        onIdentityChange("bodyName", event.target.value)
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    label="Alamat email"
                    id="custom-email"
                    optional
                    error={errors.email}
                  >
                    <SettingsInput
                      id="custom-email"
                      type="email"
                      value={draft.identity?.email || ""}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={
                        errors.email ? "custom-email-error" : undefined
                      }
                      onChange={(event) =>
                        onIdentityChange("email", event.target.value)
                      }
                    />
                  </SettingsField>
                  <SettingsField label="Kota" id="custom-city" optional>
                    <SettingsInput
                      id="custom-city"
                      value={draft.identity?.city || ""}
                      onChange={(event) =>
                        onIdentityChange("city", event.target.value)
                      }
                    />
                  </SettingsField>
                </div>
              </div>
              {attachments.pendingReads > 0 && (
                <p role="status" className="text-xs text-muted-foreground">
                  Membaca lampiran…
                </p>
              )}
              <ScenarioAttachments
                attachmentImages={draft.attachmentImages || []}
                onUpload={attachments.onUpload}
                onRemove={attachments.onRemove}
                fileInputRef={attachments.fileInputRef}
              />
            </div>
          </details>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
        <span>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="-ml-2.5 min-h-[44px] px-2.5 text-foreground max-sm:min-w-[44px]"
            >
              {/* Merah hanya di ikon: --destructive belum 4.5:1 sebagai teks kecil. */}
              <Trash2 data-icon="inline-start" className="text-destructive" />
              {/* Di HP hanya ikon supaya tombol bawah tetap satu baris. */}
              <span className="max-sm:sr-only">Hapus skenario</span>
            </Button>
          )}
        </span>
        <span className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="min-h-[44px]"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={onApply}
            disabled={attachments.pendingReads > 0}
            className="min-h-[44px] px-4"
          >
            {isNew ? "Tambahkan skenario" : "Terapkan perubahan"}
          </Button>
        </span>
      </footer>
    </div>
  );
}
