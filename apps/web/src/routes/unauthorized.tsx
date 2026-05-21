import { Link } from '@tanstack/react-router';
import { Home, ShieldAlert, ArrowLeft } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-red-100 flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-red-600" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">403</h1>
          <h2 className="text-xl font-bold text-gray-900">Akses Ditolak</h2>
          <p className="text-gray-500">Anda tidak memiliki izin untuk mengakses halaman ini. Hubungi admin jika Anda membutuhkan akses.</p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-bold hover:opacity-90 transition-all"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
