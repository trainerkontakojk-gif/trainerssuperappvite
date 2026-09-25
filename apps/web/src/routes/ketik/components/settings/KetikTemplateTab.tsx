import { ArrowLeft, Edit2, Trash2, Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  KetikAppSettings,
  KetikQuickTemplate,
  mergeKetikQuickTemplates,
} from "@trainers/types";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
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

interface KetikTemplateTabProps {
  globalTemplates: KetikQuickTemplate[];
  personalTemplates: KetikQuickTemplate[];
  templateForm: ReturnType<typeof useCrudForm<KetikQuickTemplate>>;
  templateScope: "global" | "personal";
  setTemplateScope: Dispatch<SetStateAction<"global" | "personal">>;
  setLocalSettings: Dispatch<SetStateAction<KetikAppSettings>>;
  canManageTemplates?: boolean;
}

export function KetikTemplateTab({
  globalTemplates,
  personalTemplates,
  templateForm,
  templateScope,
  setTemplateScope,
  setLocalSettings,
  canManageTemplates = false,
}: KetikTemplateTabProps) {
  const handleDeleteTemplate = (scope: "global" | "personal", id: string) => {
    if (scope === "global" && !canManageTemplates) return;
    if (window.confirm("Hapus template ini?"))
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

  const handleAddClick = (scope: "global" | "personal") => {
    if (scope === "global" && !canManageTemplates) return;
    setTemplateScope(scope);
    templateForm.openAdd();
  };

  const handleEditClick = (
    scope: "global" | "personal",
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
      if (!window.confirm("Template belum disimpan. Buang perubahan?")) return;
    }
    templateForm.close();
  };

  if (templateForm.isOpen) {
    return (
      <div className="flex flex-col gap-6">
        <div className="border-b border-border pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelTemplateForm}
            className="-ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke Daftar Template
          </Button>
        </div>
        <Card>
          <CardHeader className="border-b bg-muted/20 px-6 py-4">
            <CardTitle className="text-base tracking-tight">
              {templateForm.editingId
                ? templateScope === "global"
                  ? "Edit Template Standar"
                  : "Edit Template Pribadi"
                : templateScope === "global"
                  ? "Tambah Template Standar"
                  : "Tambah Template Pribadi"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-6">
            <SettingsField
              label="Shortcut Keyword (Tanpa Spasi)"
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
                      keyword: e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "-"),
                    })
                  }
                  placeholder="contoh: salam"
                />
              </div>
            </SettingsField>
            <SettingsField label="Isi Template" id="ketik-template-content">
              <SettingsTextarea
                id="ketik-template-content"
                className="min-h-32 bg-background leading-relaxed"
                rows={5}
                value={templateForm.draft.content || ""}
                onChange={(e) =>
                  templateForm.setDraft({ content: e.target.value })
                }
                placeholder="Masukkan isi pesan yang akan muncul saat shortcut dipanggil..."
              />
            </SettingsField>
          </CardContent>
          <CardFooter className="justify-end gap-2.5 border-t bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelTemplateForm}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleSaveTemplate}
              disabled={
                !templateForm.draft.keyword || !templateForm.draft.content
              }
            >
              Simpan
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const renderTemplateCard = (
    template: KetikQuickTemplate,
    scope: "global" | "personal",
  ) => {
    const canEdit = scope === "personal" || canManageTemplates;
    return (
      <Card
        key={`${scope}-${template.id}`}
        className="group transition-colors hover:bg-muted/30"
      >
        <CardContent className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/20 bg-primary/10 text-[11px] text-primary"
              >
                /{template.keyword}
              </Badge>
            </div>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {template.content}
            </p>
          </div>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={() => handleEditClick(scope, template)}
                aria-label={`Edit template ${template.keyword}`}
              >
                <Edit2 data-icon="inline" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => handleDeleteTemplate(scope, template.id)}
                aria-label={`Hapus template ${template.keyword}`}
              >
                <Trash2 data-icon="inline" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Template Cepat
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Template standar dikelola admin dan berlaku untuk semua user. Template
          pribadi hanya tersedia untuk akun Anda.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">
            Template Standar
          </h4>
          <p className="text-xs text-muted-foreground">
            {canManageTemplates
              ? "Template ini digunakan oleh seluruh user KETIK."
              : "Template ini dapat digunakan, tetapi tidak dapat diubah dari akun Anda."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {globalTemplates.map((template) =>
            renderTemplateCard(template, "global"),
          )}
        </div>
        {canManageTemplates && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => handleAddClick("global")}
            className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
          >
            <Plus data-icon="inline" />
            <span className="text-sm font-medium">Tambah Template Standar</span>
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">
            Template Pribadi
          </h4>
          <p className="text-xs text-muted-foreground">
            Tambahkan shortcut yang hanya ingin Anda gunakan sendiri.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {personalTemplates.map((template) =>
            renderTemplateCard(template, "personal"),
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => handleAddClick("personal")}
          className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
        >
          <Plus data-icon="inline" />
          <span className="text-sm font-medium">Tambah Template Pribadi</span>
        </Button>
      </section>
    </div>
  );
}
