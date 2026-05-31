import React from "react";
import { MessageSquare, Edit2, Trash2, Plus } from "lucide-react";
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
    setTimeout(() => {
      document.getElementById("template-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleEditClick = (template: KetikQuickTemplate) => {
    templateForm.openEdit(template);
    setTimeout(() => {
      document.getElementById("template-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
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

  return (
    <div className="space-y-8 pb-10 mt-4">
      <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-xl tracking-tighter">
              Template Cepat
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">
              Kelola pesan template yang dapat Anda panggil dengan
              shortcut &quot;/&quot; di area chat.
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {(quickTemplates || []).map((t) => (
          <div
            key={t.id}
            className="p-6 rounded-[2rem] border border-border/50 bg-card hover:bg-foreground/5 transition-all group"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-wider border border-primary/20">
                /{t.keyword}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditClick(t)}
                  className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all border border-border/50"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteTemplate(t.id)}
                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-border/50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium line-clamp-2">
              {t.content}
            </p>
          </div>
        ))}
      </div>
      {!templateForm.isOpen && (
        <button
          onClick={handleAddClick}
          className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 border border-dashed border-border/50 rounded-[2.5rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest group"
        >
          <Plus className="w-6 h-6" />
          <span>Tambah Template Baru</span>
        </button>
      )}
      {templateForm.isOpen && (
        <div
          id="template-form"
          className="bg-card border border-border/50 rounded-[2.5rem] shadow-3xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
            <h3 className="font-black text-foreground text-lg tracking-tighter">
              {templateForm.editingId
                ? "Edit Template"
                : "Tambah Template Baru"}
            </h3>
          </div>
          <div className="p-8 space-y-6 relative z-10">
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Shortcut Keyword (Tanpa Spasi)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-black">
                  /
                </span>
                <input
                  className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-foreground/20 pl-8"
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
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Isi Template
              </label>
              <textarea
                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all font-medium leading-relaxed"
                rows={5}
                value={templateForm.draft.content || ""}
                onChange={(e) =>
                  templateForm.setDraft({ content: e.target.value })
                }
                placeholder="Masukkan isi pesan yang akan muncul saat shortcut dipanggil..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
              <button
                onClick={handleCancelTemplateForm}
                className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!templateForm.draft.keyword || !templateForm.draft.content}
                className="px-8 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
