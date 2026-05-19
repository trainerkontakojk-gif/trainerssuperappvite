import { Link } from '@tanstack/react-router';
import { MessageSquare, Play, History } from 'lucide-react';

export default function KetikLanding() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">KETIK</h1>
          <p className="text-gray-500">Simulasi Chat dengan Konsumen AI</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/ketik/simulation" className="block p-6 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Play className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold">Mulai Simulasi</h3>
              <p className="text-sm text-gray-500">Pilih skenario dan mulai chat dengan AI consumer</p>
            </div>
          </div>
        </Link>

        <Link to="/ketik/history" className="block p-6 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
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
        <h2 className="text-lg font-semibold mb-4">Tentang KETIK</h2>
        <p className="text-gray-600">
          KETIK (Konsumen Entertainment Text Interactive Chat) adalah modul simulasi chat
          di mana Anda berlatih sebagai agen OJK yang menangani keluhan konsumen melalui chat.
          AI akan berperan sebagai konsumen dengan berbagai karakter dan skenario.
        </p>
      </div>
    </div>
  );
}
