import React from "react";
import { ArrowLeft, Edit2, Trash2, Plus } from "lucide-react";
import {
  KetikAppSettings,
  KetikQuickTemplate,
  mergeKetikQuickTemplates,
} from "@trainers/types";
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
  setTemplateScope: React.Dispatch<React.SetStateAction<"global" | "personal">>;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
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
      <div className="space-y-6 pb-10">
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={handleCancelTemplateForm}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Daftar Template
          </button>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden relative">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.01]">
            <h3 className="font-bold text-foreground text-base tracking-tight">
              {templateForm.editingId
                ? templateScope === "global"
                  ? "Edit Template Standar"
                  : "Edit Template Pribadi"
                : templateScope === "global"
                  ? "Tambah Template Standar"
                  : "Tambah Template Pribadi"}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Shortcut Keyword (Tanpa Spasi)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">
                  /
                </span>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 pl-6 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
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
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Isi Template
              </label>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors placeholder:text-muted-foreground/30 leading-relaxed font-normal"
                rows={5}
                value={templateForm.draft.content || ""}
                onChange={(e) =>
                  templateForm.setDraft({ content: e.target.value })
                }
                placeholder="Masukkan isi pesan yang akan muncul saat shortcut dipanggil..."
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button
                onClick={handleCancelTemplateForm}
                className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={
                  !templateForm.draft.keyword || !templateForm.draft.content
                }
                className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderTemplateCard = (
    template: KetikQuickTemplate,
    scope: "global" | "personal",
  ) => {
    const canEdit = scope === "personal" || canManageTemplates;
    return (
      <div
        key={`${scope}-${template.id}`}
        className="p-4 rounded-xl border border-border bg-card/45 hover:bg-foreground/[0.02] transition-colors group flex items-start justify-between gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-[11px] font-medium">
              /{template.keyword}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {template.content}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => handleEditClick(scope, template)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-border"
              aria-label={`Edit template ${template.keyword}`}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteTemplate(scope, template.id)}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20"
              aria-label={`Hapus template ${template.keyword}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10 mt-2">
      <div className="border-b border-border pb-4">
        <h3 className="font-bold text-foreground text-lg tracking-tight">
          Template Cepat
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Template standar dikelola admin dan berlaku untuk semua user. Template
          pribadi hanya tersedia untuk akun Anda.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Template Standar
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
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
          <button
            onClick={() => handleAddClick("global")}
            className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group"
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">Tambah Template Standar</span>
          </button>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Template Pribadi
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Tambahkan shortcut yang hanya ingin Anda gunakan sendiri.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {personalTemplates.map((template) =>
            renderTemplateCard(template, "personal"),
          )}
        </div>
        <button
          onClick={() => handleAddClick("personal")}
          className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">Tambah Template Pribadi</span>
        </button>
      </section>
    </div>
  );
}
