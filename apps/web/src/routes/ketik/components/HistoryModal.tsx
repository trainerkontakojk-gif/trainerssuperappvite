import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, History, Trash2, ChevronRight, MessageSquare, Calendar, Clock, Database, Play } from 'lucide-react';
import type { KetikSessionHistoryItem } from '@trainers/types';
import { SessionReplayModal } from './SessionReplayModal';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: KetikSessionHistoryItem[];
  onClear: () => void;
  onDelete: (id: string) => void;
  onReview: (session: KetikSessionHistoryItem) => void;
}

export function HistoryModal({ isOpen, onClose, history, onClear, onDelete, onReview }: HistoryModalProps) {
  const [replaySession, setReplaySession] = useState<KetikSessionHistoryItem | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-2xl lg:max-w-3xl rounded-[2rem] overflow-hidden flex flex-col max-h-[86vh] shadow-2xl shadow-black/10 bg-card border border-border/50">
        <header className="px-5 py-4 sm:px-6 sm:py-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <History className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">Riwayat Simulasi</h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Tinjau kembali percakapan sebelumnya.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button onClick={() => { if (confirm('Hapus semua riwayat?')) onClear(); }} className="w-10 h-10 flex items-center justify-center hover:bg-red-500/10 text-red-500/60 hover:text-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20" title="Hapus Semua">
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-foreground/5 rounded-xl transition-all border border-transparent hover:border-foreground/10">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {history.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-foreground/5 rounded-[2rem] flex items-center justify-center mb-6">
                <Database className="w-12 h-12 text-foreground/10" />
              </div>
              <p className="text-xl font-black text-muted-foreground tracking-tight italic">Belum ada riwayat simulasi.</p>
              <p className="text-sm text-foreground/10 font-medium mt-2">Mulai sesi simulasi baru untuk melihat riwayat di sini.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {history.map((session) => (
                <motion.div key={session.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="relative hover:border-emerald-400/40 rounded-[1.5rem] p-5 sm:p-6 transition-all cursor-pointer overflow-hidden border border-border/50 bg-card hover:bg-foreground/5"
                  onClick={() => onReview(session)}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-black text-base sm:text-lg text-foreground tracking-tight">{session.scenarioTitle}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(session.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(session.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setReplaySession(session); }} className="w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-primary/60 hover:text-primary rounded-xl transition-all" title="Replay Sesi">
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(session.id); }} className="w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-500/60 hover:text-red-500 rounded-xl transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between relative z-10">
                    <div className="flex gap-5 sm:gap-7">
                      <div className="space-y-1.5">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-black">Konsumen</div>
                        <div className="text-xs font-bold text-foreground flex items-center gap-2">{session.consumerName}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-black">Intensitas</div>
                        <div className="text-xs font-bold text-foreground flex items-center gap-2">{session.messages.length} Chat</div>
                      </div>
                      {session.reviewStatus && (
                        <div className="space-y-1.5">
                          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-black">Review AI</div>
                          <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 w-fit ${
                            session.reviewStatus === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                            (session.reviewStatus === 'pending' || session.reviewStatus === 'processing') ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
                            'bg-rose-500/10 text-rose-500'
                          }`}>
                            <div className={`w-1 h-1 rounded-full ${
                              session.reviewStatus === 'completed' ? 'bg-emerald-500' :
                              (session.reviewStatus === 'pending' || session.reviewStatus === 'processing') ? 'bg-amber-500' : 'bg-rose-500'
                            }`} />
                            {session.reviewStatus === 'completed' ? 'Selesai' :
                             (session.reviewStatus === 'pending' || session.reviewStatus === 'processing') ? 'Proses' : 'Gagal'}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="w-9 h-9 bg-foreground/5 rounded-lg flex items-center justify-center">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <footer className="px-5 sm:px-6 py-4 border-t text-center shrink-0">
          <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2">
            <Database className="w-3 h-3" />
            Data tersimpan di server Anda
          </p>
        </footer>
      </motion.div>

      <SessionReplayModal
        isOpen={!!replaySession}
        onClose={() => setReplaySession(null)}
        messages={replaySession?.messages || []}
        scenarioTitle={replaySession?.scenarioTitle}
        consumerName={replaySession?.consumerName}
      />
    </div>
  );
}
