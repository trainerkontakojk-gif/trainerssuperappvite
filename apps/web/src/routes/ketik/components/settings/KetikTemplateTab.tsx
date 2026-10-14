import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  KetikAppSettings,
  KetikQuickTemplate,
  mergeKetikQuickTemplates,
} from "@trainers/types";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { Button } from "../../../../components/ui/button";
import {
  SettingsField,
  SettingsInput,
  SettingsTextarea,
} from "../../../../components/settings/SettingsPrimitives";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { normalizeKetikQuickTemplateDraft } from "./ketikDraftNormalizers";
import {
  getKetikHiddenPersonalTemplates,
  getKetikTemplateLayers,
} from "./useKetikSettingsDraft";

type TemplateScope = "global" | "personal";

interface KetikTemplateTabProps {
  /** Tempat dialog konfirmasi dirender (wadah dialog Pengaturan). */
  confirmContainer?: HTMLElement | null;
  globalTemplates: KetikQuickTemplate[];
  personalTemplates: KetikQuickTemplate[];
  templateForm: ReturnType<typeof useCrudForm<KetikQuickTemplate>>;
  templateScope: "global" | "personal";
  setTemplateScope: Dispatch<SetStateAction<"global" | "personal">>;
  setLocalSettings: Dispatch<SetStateAction<KetikAppSettings>>;
  canManageTemplates?: boolean;
}

export function KetikTemplateTab({
  confirmContainer,
  globalTemplates,
  personalTemplates,
  templateForm,
  templateScope,
  setTemplateScope,
  setLocalSettings,
  canManageTemplates = false,
}: KetikTemplateTabProps) {
  const [pendingConfirm, setPendingConfirm] = useState<
    | { kind: "discard" }
    | { kind: "delete"; scope: TemplateScope; id: string }
    | null
  >(null);

  const deleteTemplate = (scope: TemplateScope, id: string) => {
    if (scope === "global" && !canManageTemplates) return;
    setLocalSettings((prev) => {
      const currentLayers = getKetikTemplateLayers(prev);
      const currentPersonal = prev.personalQuickTemplates || [];
      const hiddenPersonal = getKetikHiddenPersonalTemplates(prev);
      const nextGlobal =
        scope === "global"
          ? currentLayers.global.filter((template) => template.id !== id)
          : currentLayers.global;
      const nextPersonal =
        scope === "personal"
          ? [
              ...hiddenPersonal,
              ...currentLayers.personal.filter(
                (template) => template.id !== id,
              ),
            ]
          : currentPersonal;
      return {
        ...prev,
        globalQuickTemplates: nextGlobal,
        quickTemplates: mergeKetikQuickTemplates(nextGlobal, nextPersonal),
        personalQuickTemplates: nextPersonal,
      };
    });
  };

  const handleAddClick = (scope: TemplateScope) => {
    if (scope === "global" && !canManageTemplates) return;
    setTemplateScope(scope);
    templateForm.openAdd();
  };

  const handleEditClick = (
    scope: TemplateScope,
    template: KetikQuickTemplate,
  ) => {
    if (scope === "global" && !canManageTemplates) return;
    setTemplateScope(scope);
    templateForm.openEdit(template);
  };

  const handleSaveTemplate = () => {
    if (templateScope === "global" && !canManageTemplates) return;
    if (!templateForm.draft.keyword || !templateForm.draft.content) return;

    const normalizedDraft = normalizeKetikQuickTemplateDraft(
      templateForm.draft,
    );
    if (
      templateScope === "personal" &&
      globalTemplates.some(
        (template) =>
          template.id !== templateForm.editingId &&
          template.keyword.trim().toLowerCase() === normalizedDraft.keyword,
      )
    ) {
      notify.warning(
        "Keyword tersebut sudah dipakai template standar. Gunakan keyword pribadi yang berbeda.",
      );
      return;
    }

    setLocalSettings((prev) => {
      const currentLayers = getKetikTemplateLayers(prev);
      const currentPersonal = prev.personalQuickTemplates || [];
      const hiddenPersonal = getKetikHiddenPersonalTemplates(prev);
      const nextGlobal =
        templateScope === "global"
          ? templateForm.save(currentLayers.global, normalizedDraft)
          : currentLayers.global;
      const nextPersonalEditable =
        templateScope === "personal"
          ? templateForm.save(currentLayers.personal, normalizedDraft)
          : currentLayers.personal;
      const nextPersonal =
        templateScope === "personal"
          ? [...hiddenPersonal, ...nextPersonalEditable]
          : currentPersonal;
      return {
        ...prev,
        globalQuickTemplates: nextGlobal,
        quickTemplates: mergeKetikQuickTemplates(nextGlobal, nextPersonal),
        personalQuickTemplates: nextPersonal,
      };
    });

    templateForm.close();
  };

  const handleCancelTemplateForm = () => {
    const templates =
      templateScope === "global" ? globalTemplates : personalTemplates;
    if (templateForm.isDirty(templates)) {
      setPendingConfirm({ kind: "discard" });
      return;
    }
    templateForm.close();
  };

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "delete") {
      deleteTemplate(pendingConfirm.scope, pendingConfirm.id);
    } else {
      templateForm.close();
    }
    setPendingConfirm(null);
  };

  const confirmDialog = (
    <ConfirmDialog
      open={pendingConfirm !== null}
      container={confirmContainer}
      {...(pendingConfirm?.kind === "discard"
        ? {
            title: "Buang perubahan template?",
            description: "Perubahan yang belum diterapkan akan hilang.",
            cancelLabel: "Lanjut mengubah",
            confirmLabel: "Buang perubahan",
          }
        : {
            title: "Hapus template ini?",
            description: "Perubahan berlaku setelah Anda memilih Simpan.",
            confirmLabel: "Hapus template",
          })}
      onConfirm={confirmPending}
      onCancel={() => setPendingConfirm(null)}
    />
  );

  if (templateForm.isOpen) {
    const editorTitle = templateForm.editingId
      ? templateScope === "global"
        ? "Ubah template standar"
        : "Ubah template pribadi"
      : templateScope === "global"
        ? "Template standar baru"
        : "Template pribadi baru";
    return (
      <div id="template-form" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            {editorTitle}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelTemplateForm}
            className="min-h-[44px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke daftar
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          <SettingsField
            label="Kata kunci"
            helperText="Ketik / lalu kata kunci ini di kotak chat. Tanpa spasi."
            id="ketik-template-keyword"
          >
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                /
              </span>
              <SettingsInput
                id="ketik-template-keyword"
                className="bg-background pl-7"
                value={templateForm.draft.keyword || ""}
                onChange={(e) =>
                  templateForm.setDraft({
                    keyword: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  })
                }
                placeholder="contoh: salam"
              />
            </div>
          </SettingsField>
          <SettingsField label="Isi template" id="ketik-template-content">
            <SettingsTextarea
              id="ketik-template-content"
              className="min-h-32 bg-background leading-relaxed"
              rows={5}
              value={templateForm.draft.content || ""}
              onChange={(e) =>
                templateForm.setDraft({ content: e.target.value })
              }
              placeholder="Pesan yang muncul saat kata kunci dipanggil"
            />
          </SettingsField>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelTemplateForm}
            className="min-h-[44px]"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSaveTemplate}
            disabled={
              !templateForm.draft.keyword || !templateForm.draft.content
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

  const renderTemplateRow = (
    template: KetikQuickTemplate,
    scope: TemplateScope,
  ) => {
    const canEdit = scope === "personal" || canManageTemplates;
    return (
      <li
        key={`${scope}-${template.id}`}
        className="flex items-center gap-3 py-2 pr-2 pl-4 transition-colors hover:bg-muted/40"
      >
        <span className="w-28 shrink-0 truncate font-mono text-[13px] font-medium text-foreground sm:w-36">
          /{template.keyword}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg2">
          {template.content}
        </span>
        {canEdit && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleEditClick(scope, template)}
              aria-label={`Ubah template ${template.keyword}`}
              className="min-h-[44px] shrink-0"
            >
              Ubah
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() =>
                setPendingConfirm({ kind: "delete", scope, id: template.id })
              }
              aria-label={`Hapus template ${template.keyword}`}
              title="Hapus"
              className="min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 data-icon="inline" />
            </Button>
          </>
        )}
      </li>
    );
  };

  const templateList = (
    templates: KetikQuickTemplate[],
    scope: TemplateScope,
    empty: string,
  ) =>
    templates.length === 0 ? (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
        {empty}
      </p>
    ) : (
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {templates.map((template) => renderTemplateRow(template, scope))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-[60ch] flex-col gap-1">
        <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
          Template cepat
        </h3>
        <p className="text-[13px] leading-5 text-fg2">
          Balasan cepat yang muncul saat peserta mengetik / di kotak chat.
          Template standar dikelola admin; template pribadi hanya untuk akun
          Anda.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[15px] font-semibold text-foreground">
              Template pribadi
            </h4>
            <p className="text-xs text-muted-foreground">
              Hanya muncul di kotak chat Anda.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => handleAddClick("personal")}
            className="min-h-[44px] shrink-0"
          >
            <Plus data-icon="inline-start" />
            Template pribadi baru
          </Button>
        </div>
        {templateList(
          personalTemplates,
          "personal",
          "Belum ada template pribadi.",
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[15px] font-semibold text-foreground">
              Template standar
            </h4>
            <p className="text-xs text-muted-foreground">
              {canManageTemplates
                ? "Dipakai oleh seluruh pengguna KETIK."
                : "Bisa dipakai, tetapi tidak bisa diubah dari akun Anda."}
            </p>
          </div>
          {canManageTemplates && (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleAddClick("global")}
              className="min-h-[44px] shrink-0"
            >
              <Plus data-icon="inline-start" />
              Template standar baru
            </Button>
          )}
        </div>
        {templateList(globalTemplates, "global", "Belum ada template standar.")}
      </section>
      {confirmDialog}
    </div>
  );
}
