import React from "react";
import { ArrowLeft, Edit2, Trash2, Plus } from "lucide-react";
import { KetikAppSettings, KetikQuickTemplate } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeKetikQuickTemplateDraft } from "./ketikDraftNormalizers";

interface KetikTemplateTabProps {
  quickTemplates: KetikQuickTemplate[];
  templateForm: ReturnType<typeof useCrudForm<KetikQuickTemplate>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
}

export function KetikTemplateTab({
  quickTemplates,
  templateForm,
  setLocalSettings,
}: KetikTemplateTabProps) {

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm("Hapus template ini?"))
      setLocalSettings((prev) => ({
        ...prev,
        quickTemplates: (prev.quickTemplates || []).filter((t) => t.id !== id),
      }));
  };

  const handleAddClick = () => {
    templateForm.openAdd();
  };

  const handleEditClick = (template: KetikQuickTemplate) => {
    templateForm.openEdit(template);
  };

  const handleSaveTemplate = () => {
    if (!templateForm.draft.keyword || !templateForm.draft.content) return;

    const normalizedDraft = normalizeKetikQuickTemplateDraft(templateForm.draft);

    setLocalSettings((prev) => ({
      ...prev,
      quickTemplates: templateForm.save(prev.quickTemplates || [], normalizedDraft),
    }));

    templateForm.close();
  };

  const handleCancelTemplateForm = () => {
    if (templateForm.isDirty(quickTemplates)) {
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
              {templateForm.editingId ? "Edit Template" : "Tambah Template Baru"}
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
                      keyword: e.target.value.toLowerCase().replace(/\s+/g, "-"),
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
                disabled={!templateForm.draft.keyword || !templateForm.draft.content}
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

  return (
    <div className="space-y-6 pb-10 mt-2">
      <div className="border-b border-border pb-4">
        <h3 className="font-bold text-foreground text-lg tracking-tight">
          Template Cepat
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Kelola pesan template yang dapat Anda panggil dengan shortcut &quot;/&quot; di area chat.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {(quickTemplates || []).map((t) => (
          <div
            key={t.id}
            className="p-4 rounded-xl border border-border bg-card/45 hover:bg-foreground/[0.02] transition-colors group flex items-start justify-between gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-[11px] font-medium">
                  /{t.keyword}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {t.content}
              </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => handleEditClick(t)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-border"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteTemplate(t.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!templateForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">Tambah Template Baru</span>
        </button>
      )}
    </div>
  );
}
