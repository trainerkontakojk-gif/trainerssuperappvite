import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderInput, X, Inbox, Check, Loader2 } from 'lucide-react';
import QaStatePanel from '../../../../components/ui/QaStatePanel';
import { profilerApi } from '../../../../lib/profilerService';
import { notify } from '../../../../lib/toast';

interface MoveFolderModalProps {
  selectedIds: string[];
  currentBatch: string;
  folders: any[];
  years: any[];
  onClose: () => void;
  onMoved: (ids: string[], targetFolder: string) => void;
}

export const MoveFolderModal: React.FC<MoveFolderModalProps> = ({
  selectedIds,
  currentBatch,
  folders,
  years,
  onClose,
  onMoved,
}) => {
  const [targetFolder, setTargetFolder] = useState('');
  const [moving, setMoving] = useState(false);

  const handleMove = async () => {
    if (!targetFolder) return;
    setMoving(true);
    try {
      await profilerApi.movePesertaToBatch(selectedIds, targetFolder);
      onMoved(selectedIds, targetFolder);
      onClose();
    } catch (err: any) {
      notify.error('Gagal memindahkan: ' + err.message);
    } finally {
      setMoving(false);
    }
  };

  const otherFolders = folders.filter((f) => f.name !== currentBatch);

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/40 backdrop-blur-md p-0 sm:p-4 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="bg-card w-full sm:max-w-md sm:rounded-[2.5rem] rounded-t-[2.5rem] border border-border/40 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] flex flex-col max-h-[90vh]"
        >
          {/* Handle for mobile drag-down feel */}
          <div className="flex justify-center pt-4 pb-2 sm:hidden shrink-0">
            <div className="w-12 h-1.5 bg-muted rounded-full opacity-40" />
          </div>

          <div className="px-8 pt-6 pb-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-foreground tracking-tighter flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-primary" />
                Pindah Folder
              </h2>
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mt-1">
                {selectedIds.length} Peserta Terpilih
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-all group active:scale-95"
            >
              <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar">
            {otherFolders.length === 0 ? (
              <div className="py-4">
                <QaStatePanel
                  type="empty"
                  title="Folder Tidak Ditemukan"
                  description="Tidak ada folder lain yang tersedia saat ini. Silakan buat folder baru terlebih dahulu."
                />
              </div>
            ) : (
              <div className="space-y-6 pb-6">
                {years.map((year) => {
                  const yearFolders = otherFolders.filter(
                    (f) => f.year_id === year.id && !f.parent_id
                  );
                  if (yearFolders.length === 0) return null;

                  return (
                    <div key={year.id} className="space-y-3">
                      <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">
                        {year.label}
                      </p>
                      <div className="grid gap-2">
                        {yearFolders.map((folder) => {
                          const subFolders = otherFolders.filter(
                            (f) => f.parent_id === folder.id
                          );
                          const isSelected = targetFolder === folder.name;

                          return (
                            <div key={folder.id} className="grid gap-2">
                              <button
                                onClick={() => setTargetFolder(folder.name)}
                                className={`group w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all text-left relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                                  isSelected
                                    ? 'border-primary bg-primary/[0.03] shadow-inner'
                                    : 'border-border/40 hover:border-primary/40 bg-background/50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`transition-colors ${
                                      isSelected
                                        ? 'text-primary'
                                        : 'text-muted-foreground/40 group-hover:text-primary/60'
                                    }`}
                                  >
                                    <Inbox className="w-4 h-4" />
                                  </div>
                                  <span
                                    className={`text-sm font-bold tracking-tight transition-colors ${
                                      isSelected ? 'text-primary' : 'text-foreground'
                                    }`}
                                  >
                                    {folder.name}
                                  </span>
                                </div>
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                                  >
                                    <Check className="w-3 h-3 text-primary-foreground stroke-[3px]" />
                                  </motion.div>
                                )}
                              </button>

                              {subFolders.map((sub) => {
                                const isSubSelected = targetFolder === sub.name;
                                return (
                                  <button
                                    key={sub.id}
                                    onClick={() => setTargetFolder(sub.name)}
                                    className={`group w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all text-left ml-6 w-[calc(100%-1.5rem)] relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                                      isSubSelected
                                        ? 'border-primary bg-primary/[0.03] shadow-inner'
                                        : 'border-border/40 hover:border-primary/40 bg-background/50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`transition-colors ${
                                          isSubSelected
                                            ? 'text-primary'
                                            : 'text-muted-foreground/40 group-hover:text-primary/60'
                                        }`}
                                      >
                                        <Inbox className="w-3.5 h-3.5" />
                                      </div>
                                      <span
                                        className={`text-sm font-bold tracking-tight transition-colors ${
                                          isSubSelected ? 'text-primary' : 'text-foreground'
                                        }`}
                                      >
                                        {sub.name}
                                      </span>
                                    </div>
                                    {isSubSelected && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                                      >
                                        <Check className="w-2.5 h-2.5 text-primary-foreground stroke-[3px]" />
                                      </motion.div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-8 pt-4 border-t border-border/40 bg-muted/20 shrink-0 space-y-3">
            <button
              onClick={handleMove}
              disabled={!targetFolder || moving}
              className="w-full h-14 bg-primary hover:opacity-90 disabled:opacity-30 text-primary-foreground rounded-2xl text-sm font-bold flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {moving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Sedang Memindahkan...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" /> Konfirmasi Pemindahan
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-full h-12 hover:bg-muted text-muted-foreground hover:text-foreground rounded-2xl text-sm font-bold transition-all active:scale-[0.98]"
            >
              Batal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
