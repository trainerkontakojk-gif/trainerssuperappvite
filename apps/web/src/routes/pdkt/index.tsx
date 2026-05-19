import { Link } from '@tanstack/react-router';
import { Mail, Play, History } from 'lucide-react';

export default function PdktLanding() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PDKT</h1>
          <p className="text-gray-500">Simulasi Email dengan Konsumen AI</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/pdkt/simulation" className="block p-6 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Play className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold">Mulai Simulasi</h3>
              <p className="text-sm text-gray-500">Pilih skenario dan mulai simulasi email</p>
            </div>
          </div>
        </Link>

        <Link to="/pdkt/history" className="block p-6 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <History className="text-orange-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold">Riwayat Sesi</h3>
              <p className="text-sm text-gray-500">Lihat sesi simulasi sebelumnya</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Tentang PDKT</h2>
        <p className="text-gray-600">
          PDKT (Pelatihan Digital Komunikasi Tertulis) adalah modul simulasi email
          di mana Anda berlatih membalas email keluhan konsumen melalui platform OJK.
          AI akan menghasilkan email konsumen dan mengevaluasi respons Anda.
        </p>
      </div>
    </div>
  );
}
