import { Link } from "@tanstack/react-router";
import { Home, AlertCircle } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-indigo-100 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-indigo-600" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">
            404
          </h1>
          <h2 className="text-xl font-bold text-gray-900">
            Halaman Tidak Ditemukan
          </h2>
          <p className="text-gray-500">
            Maaf, halaman yang Anda cari tidak tersedia atau telah dipindahkan.
          </p>
        </div>
        <div className="pt-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-bold hover:opacity-90 transition-all"
          >
            <Home className="w-4 h-4" />
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
