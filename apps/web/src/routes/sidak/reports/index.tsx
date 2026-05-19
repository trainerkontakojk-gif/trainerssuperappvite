import { Link } from '@tanstack/react-router';
import { FileText, Brain, ArrowRight, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function SidakReportsLanding() {
  const [showWarning, setShowWarning] = useState(false);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-rose-600">SIDAK — Laporan</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Laporan QA</h1>
        <p className="text-sm text-gray-500 mt-1">Buat laporan data temuan QA atau generate laporan otomatis dengan AI.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Data Report Card */}
        <Link to="/sidak/reports-data" className="group block rounded-xl border bg-white p-8 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-5">
            <FileText className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Laporan Data</h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Laporan berbasis database dengan filter lengkap — pilih layanan, periode, agent, atau tim. Export ke Excel.
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-blue-600">
            Buka Laporan Data <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        {/* AI Report Card */}
        <div className="group block rounded-xl border bg-white p-8 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowWarning(true)}>
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-5 relative">
            <Brain className="h-7 w-7" />
            <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Premium</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 group-hover:text-amber-600 transition-colors">Laporan AI</h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Laporan otomatis dengan AI — pilih model, filter data, dan dapatkan laporan dalam format HTML atau DOCX.
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-amber-600">
            Buka Laporan AI <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowWarning(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center">Akses Terbatas & Notifikasi Biaya</h3>
            <p className="mt-3 text-sm text-gray-500 text-center leading-relaxed">
              Fitur Laporan AI masih dalam tahap pengembangan dan merupakan layanan berbayar berdasarkan token AI yang digunakan.
              Pastikan Anda memiliki anggaran yang cukup sebelum melanjutkan.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowWarning(false)}
                className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-gray-50 transition"
              >
                Kembali
              </button>
              <Link
                to="/sidak/reports-ai"
                className="flex-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white text-center hover:opacity-90 transition"
                onClick={() => setShowWarning(false)}
              >
                Tetap Lanjutkan
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
