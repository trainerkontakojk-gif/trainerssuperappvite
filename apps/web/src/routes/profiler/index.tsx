import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  FolderOpen,
  Plus,
  Users,
  BarChart3,
  Table2,
  Layout,
  Download,
  Upload,
  Settings,
} from "lucide-react";
import { profilerApi } from "../../lib/profilerService";
import type { ProfilerYear, ProfilerFolder } from "@trainers/types";

export default function ProfilerLanding() {
  const [years, setYears] = useState<ProfilerYear[]>([]);
  const [folders, setFolders] = useState<ProfilerFolder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getFolderCounts(),
    ])
      .then(([y, f, c]) => {
        setYears(y);
        setFolders(f);
        setCounts(c);
        if (y.length > 0) setSelectedYear(y[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const rootFolders = folders.filter(
    (f) => f.year_id === selectedYear && !f.parent_id,
  );

  const subFolders = (parentId: string) =>
    folders.filter((f) => f.parent_id === parentId);

  const selectedFolderData = selectedFolder
    ? folders.find((f) => f.id === selectedFolder)
    : null;

  const batchName = selectedFolderData?.name ?? "";

  const actions = [
    {
      to: `/profiler/table?batch=${encodeURIComponent(batchName)}`,
      icon: Table2,
      label: "Tabel Peserta",
      desc: "Lihat dan edit data peserta",
      disabled: !batchName,
    },
    {
      to: `/profiler/slides?batch=${encodeURIComponent(batchName)}`,
      icon: Layout,
      label: "Tampilan Slide",
      desc: "Presentasi slide peserta",
      disabled: !batchName,
    },
    {
      to: `/profiler/analytics?batch=${encodeURIComponent(batchName)}`,
      icon: BarChart3,
      label: "Statistik",
      desc: "Analisis data peserta",
      disabled: !batchName,
    },
    {
      to: `/profiler/add?batch=${encodeURIComponent(batchName)}`,
      icon: Plus,
      label: "Tambah Peserta",
      desc: "Input manual peserta baru",
      disabled: !batchName,
    },
    {
      to: `/profiler/import?batch=${encodeURIComponent(batchName)}`,
      icon: Upload,
      label: "Import Excel",
      desc: "Import data dari Excel",
      disabled: !batchName,
    },
    {
      to: `/profiler/export?batch=${encodeURIComponent(batchName)}`,
      icon: Download,
      label: "Ekspor Data",
      desc: "Download Excel/PPTX/PDF",
      disabled: !batchName,
    },
    {
      to: "/profiler/teams",
      icon: Settings,
      label: "Manajemen Tim",
      desc: "Atur tim peserta",
      disabled: false,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-amber-600">
          KTP / Profiler
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          Kotak Tool Profil
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Database profil agen dan peserta untuk operasional training yang lebih
          rapi.
        </p>
      </header>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Year & Folder Sidebar */}
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
            Tahun
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : (
            years.map((year) => (
              <div key={year.id}>
                <button
                  onClick={() => setSelectedYear(year.id)}
                  className={`w-full text-left p-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedYear === year.id
                      ? "bg-amber-50 text-amber-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {year.label}
                </button>
                {selectedYear === year.id && (
                  <div className="ml-3 mt-1 space-y-1">
                    {rootFolders.map((folder) => (
                      <div key={folder.id}>
                        <button
                          onClick={() => setSelectedFolder(folder.id)}
                          className={`w-full text-left p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                            selectedFolder === folder.id
                              ? "bg-amber-50 text-amber-700"
                              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <FolderOpen className="h-3 w-3" />
                          {folder.name}
                          {counts[folder.name] > 0 && (
                            <span className="ml-auto text-xs text-gray-400">
                              {counts[folder.name]}
                            </span>
                          )}
                        </button>
                        {subFolders(folder.id).map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => setSelectedFolder(sub.id)}
                            className={`w-full text-left p-1.5 pl-6 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                              selectedFolder === sub.id
                                ? "bg-amber-50 text-amber-700"
                                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <FolderOpen className="h-3 w-3" />
                            {sub.name}
                            {counts[sub.name] > 0 && (
                              <span className="ml-auto text-xs text-gray-400">
                                {counts[sub.name]}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Main Content */}
        <div className="space-y-4">
          {!selectedFolder ? (
            <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
              <FolderOpen className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                Pilih folder/batch
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Pilih tahun dan folder dari sidebar untuk mulai bekerja.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                {selectedFolderData?.name}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {counts[batchName] ?? 0} peserta ·{" "}
                {selectedFolderData?.parent_id ? "Sub-folder" : "Folder utama"}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                {actions
                  .filter((a) => !a.disabled)
                  .map((action) => (
                    <Link
                      key={action.label}
                      to={action.to as any}
                      className="flex items-start gap-3 p-4 rounded-xl border bg-gray-50 hover:bg-white hover:shadow-sm transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-600 transition-colors">
                          {action.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {action.desc}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
              {actions.filter((a) => a.disabled).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-2">
                    Aksi lain (pilih batch terlebih dahulu):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {actions
                      .filter((a) => a.disabled)
                      .map((action) => (
                        <span
                          key={action.label}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs cursor-not-allowed"
                        >
                          <action.icon className="h-3 w-3" />
                          {action.label}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Teams quick link */}
          <Link
            to="/profiler/teams"
            className="block rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Manajemen Tim
                </p>
                <p className="text-xs text-gray-500">
                  Atur daftar tim yang tersedia untuk peserta
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
