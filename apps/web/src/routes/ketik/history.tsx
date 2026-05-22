import { History, MessageSquare } from "lucide-react";

export default function KetikHistory() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Riwayat Sesi KETIK</h1>
      <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-500">
        <History size={48} className="mx-auto mb-4 text-gray-300" />
        <p>Belum ada sesi simulasi.</p>
        <p className="text-sm">Sesi yang sudah selesai akan muncul di sini.</p>
      </div>
    </div>
  );
}
