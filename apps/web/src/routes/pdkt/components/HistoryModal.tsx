import React from 'react';
import { X, Trash2, Calendar, Clock, ChevronRight, History as HistoryIcon, Eye, User, Tag, Loader2, AlertTriangle } from 'lucide-react';
import type { PdktScenario, PdktConsumerType, PdktMailboxItem } from '@trainers/types';

export interface SessionHistory {
  id: string;
  timestamp: string | Date;
  config: {
    scenarios: PdktScenario[];
    consumerType: PdktConsumerType;
    writingStyleMode?: 'realistic' | 'training';
  };
  emails: PdktMailboxItem[];
  evaluation: any;
  evaluationStatus: 'completed' | 'processing' | 'failed';
  evaluationError?: string;
  timeTaken?: number;
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: SessionHistory[];
  onSelectSession: (session: SessionHistory) => void;
  onDeleteSession: (id: string) => void;
  onClearHistory: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ 
  isOpen, 
  onClose, 
  history, 
  onSelectSession, 
  onDeleteSession, 
  onClearHistory 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />
      
      {/* Dialog Shell */}
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col h-[85vh] transition-all transform scale-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center border border-sky-100">
              <HistoryIcon className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Riwayat Simulasi PDKT</h3>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest font-semibold">
                {history.length} Sesi PDKT Tersimpan
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button 
                onClick={() => { if (confirm('Apakah Anda yakin ingin menghapus semua riwayat?')) onClearHistory(); }}
                className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-50 rounded-lg transition-all border border-red-200 hover:border-red-300"
              >
                Hapus Semua
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 bg-gray-50/50">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 border border-gray-200">
                <Clock className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800">Belum Ada Riwayat</h3>
              <p className="text-gray-500 text-xs max-w-xs mx-auto mt-1 leading-relaxed">
                Selesaikan simulasi pertama Anda untuk melihat riwayatnya di sini.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((session) => {
                const score = session.evaluation?.score || 0;
                const scoreColor = score >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 
                                 score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-100' : 
                                 'text-red-600 bg-red-50 border-red-100';
                
                const statusBadge = session.evaluationStatus === 'processing'
                  ? 'text-sky-600 bg-sky-50 border-sky-100'
                  : session.evaluationStatus === 'failed'
                    ? 'text-rose-600 bg-rose-50 border-rose-100'
                    : scoreColor;
                
                const lastEmail = session.emails[session.emails.length - 1];
                const subject = lastEmail?.subject || 'Tanpa Subjek';

                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    className="relative group bg-white border border-gray-200 rounded-xl p-4 transition-all hover:border-sky-300 hover:shadow-sm cursor-pointer overflow-hidden flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border flex items-center gap-1 shrink-0 ${statusBadge}`}>
                            {session.evaluationStatus === 'processing' ? (
                              <>
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                Evaluasi
                              </>
                            ) : session.evaluationStatus === 'failed' ? (
                              <>
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Gagal
                              </>
                            ) : (
                              <>Skor: {score}</>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-gray-400 font-medium">
                            <Calendar className="w-3 h-3 shrink-0" />
                            {new Date(session.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            <span className="mx-1">•</span>
                            {new Date(session.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <h4 className="text-xs font-bold leading-tight group-hover:text-sky-600 transition-colors line-clamp-1 text-gray-900 pr-12">
                          {subject}
                        </h4>
                      </div>
                      
                      <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectSession(session); }}
                          className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-lg border border-gray-200 transition-colors"
                          title="Lihat Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-lg border border-red-200 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-gray-100 min-w-0">
                      <div className="flex items-center gap-1 text-[9px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 max-w-[150px] shrink-0">
                        <User className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{session.config.consumerType.name}</span>
                      </div>
                      {session.config.scenarios.slice(0, 2).map((s) => (
                        <div key={s.id} className="flex items-center gap-1 text-[9px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 max-w-[150px] shrink-0">
                          <Tag className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </div>
                      ))}
                      {session.config.scenarios.length > 2 && (
                        <div className="text-[9px] text-gray-400 font-semibold px-1 py-0.5 shrink-0">
                          +{session.config.scenarios.length - 2} lainnya
                        </div>
                      )}
                      {session.evaluationStatus === 'failed' && session.evaluationError && (
                        <div className="text-[9px] text-red-500 font-semibold max-w-xs truncate shrink-0">
                          {session.evaluationError}
                        </div>
                      )}
                      {session.timeTaken !== undefined && (
                        <div className="flex items-center gap-1 text-[9px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 ml-auto shrink-0">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          {Math.floor(session.timeTaken / 60)}m {session.timeTaken % 60}s
                        </div>
                      )}
                    </div>
                    
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none pr-1">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
