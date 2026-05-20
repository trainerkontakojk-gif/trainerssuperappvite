import React, { useState, useEffect } from 'react';
import { X, BarChart3, Loader2, TrendingUp } from 'lucide-react';
import { getApi } from '../../../hooks/useApi';

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: 'ketik' | 'pdkt';
  sessionDelta?: {
    totalCalls: number;
    totalTokens: number;
    costIdr: number;
  } | null;
  sessionDeltaPending?: boolean;
}

function formatIdr(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

export const UsageModal: React.FC<UsageModalProps> = ({ 
  isOpen, 
  onClose, 
  module, 
  sessionDelta, 
  sessionDeltaPending 
}) => {
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostIdr: number;
    year: number;
    month: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsage = async () => {
      setLoading(true);
      try {
        const response = await getApi<any>(`/ai/usage/summary?module=${module}`);
        setUsage(response);
      } catch (error) {
        console.error('[UsageModal] Failed to fetch usage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [isOpen, module]);

  if (!isOpen) return null;

  const moduleLabel = module === 'ketik' ? 'Ketik' : 'PDKT';
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const periodLabel = usage ? `${months[usage.month - 1]} ${usage.year}` : '';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />
      
      {/* Dialog Shell */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[85vh] transition-all transform scale-100">
        <header className="px-6 py-5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center border border-sky-100">
              <BarChart3 className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Usage Bulan Ini</h3>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest font-semibold">Modul {moduleLabel}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 bg-gray-50/30">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
              <p className="text-xs font-bold text-gray-500">Memuat data usage...</p>
            </div>
          ) : usage ? (
            <>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{periodLabel}</p>
              </div>

              {(sessionDelta || sessionDeltaPending) && (
                <div className="bg-sky-50/55 border border-sky-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-sky-600" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Kenaikan setelah sesi terakhir</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {sessionDelta ? `+${formatIdr(sessionDelta.costIdr)}` : '—'}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-400 font-semibold">
                    {sessionDelta && sessionDelta.totalTokens > 0 && (
                      <span>+{formatTokenCount(sessionDelta.totalTokens)} token</span>
                    )}
                    {sessionDelta && sessionDelta.totalCalls > 0 && (
                      <span>+{sessionDelta.totalCalls} call</span>
                    )}
                    {sessionDeltaPending && (
                      <span className="text-amber-600">masih diproses</span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-sky-50/20 rounded-xl p-4 col-span-2 border border-sky-100">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-sky-600 mb-1">Estimasi Biaya Bulan Ini</div>
                  <div className="text-2xl font-bold text-sky-600">{formatIdr(usage.totalCostIdr)}</div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total Tokens</div>
                  <div className="text-lg font-bold text-gray-900">{formatTokenCount(usage.totalTokens)}</div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Call AI</div>
                  <div className="text-lg font-bold text-gray-900">{usage.totalCalls}</div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Input Tokens</div>
                  <div className="text-sm font-bold text-gray-700">{formatTokenCount(usage.totalInputTokens)}</div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Output Tokens</div>
                  <div className="text-sm font-bold text-gray-700">{formatTokenCount(usage.totalOutputTokens)}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <BarChart3 className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-xs font-bold text-gray-400 italic">Belum ada data usage untuk bulan ini.</p>
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-gray-200 text-center shrink-0 bg-gray-50">
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
            Estimasi biaya berdasarkan penggunaan token AI
          </p>
        </footer>
      </div>
    </div>
  );
};
