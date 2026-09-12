import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileDown } from "lucide-react";
import { ProfilerExportToolbar } from "./components/export/ProfilerExportToolbar";
import { ProfilerExportGrid } from "./components/export/ProfilerExportGrid";
import { useProfilerExport } from "./hooks/useProfilerExport";
import { useQueryParams } from "../../hooks/useQueryParams";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerPeserta,
  ProfilerYear,
  ProfilerFolder,
} from "@trainers/types";
import { ProfilerPageHeader } from "./components/ProfilerPageHeader";

export default function ProfilerExport() {
  const navigate = useNavigate();
  const { batch } = useQueryParams();
  const batchName = batch || "";

  const [initialYears, setInitialYears] = useState<ProfilerYear[]>([]);
  const [initialFolders, setInitialFolders] = useState<ProfilerFolder[]>([]);
  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);

  const [selectedBatch, setSelectedBatch] = useState(batchName);
  const { generating, orientation, setOrientation, options, disabled } =
    useProfilerExport({ peserta, selectedBatch });

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getPesertaByBatch(selectedBatch),
    ])
      .then(([y, f, p]) => {
        const folderNames = new Set(f.map((folder: any) => folder.name));
        if (selectedBatch && f.length > 0 && !folderNames.has(selectedBatch)) {
          const firstFolder = f[0];
          if (firstFolder?.name) {
            navigate({
              to: "/profiler/export",
              search: { batch: firstFolder.name },
              replace: true,
            });
          } else {
            navigate({ to: "/profiler", replace: true });
          }
          return;
        }
        setInitialYears(y);
        setInitialFolders(f);
        setPeserta(p);
      })
      .catch(console.error);
  }, [navigate, selectedBatch]);

  const handleBatchChange = (newBatch: string) => {
    setSelectedBatch(newBatch);
    navigate({ to: "/profiler/export", search: { batch: newBatch } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProfilerPageHeader
        backHref={`/profiler?batch=${encodeURIComponent(selectedBatch)}`}
        backLabel="Kembali ke workspace KTP"
        eyebrow="Profiler export"
        title="Unduh batch aktif ke format yang siap dipakai."
        description="Pilih folder, cek jumlah peserta, tentukan orientasi, lalu ekspor ke format yang sesuai."
        icon={<FileDown className="size-3.5" aria-hidden="true" />}
      />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <ProfilerExportToolbar
            selectedBatch={selectedBatch}
            initialYears={initialYears}
            initialFolders={initialFolders}
            handleBatchChange={handleBatchChange}
            pesertaCount={peserta.length}
            orientation={orientation}
            setOrientation={setOrientation}
          />
          <ProfilerExportGrid
            options={options}
            disabled={disabled}
            generating={generating}
          />
        </div>
      </main>
    </div>
  );
}
