import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileDown } from "lucide-react";
import { ProfilerExportToolbar } from "./components/export/ProfilerExportToolbar";
import { ProfilerExportGrid } from "./components/export/ProfilerExportGrid";
import { useProfilerExport } from "./hooks/useProfilerExport";
import { useQueryParams } from "../../hooks/useQueryParams";
import { profilerApi } from "../../lib/profilerService";
import type { ProfilerPeserta, ProfilerYear, ProfilerFolder } from "@trainers/types";
import PageHeroHeader from "../../components/PageHeroHeader";

export default function ProfilerExport() {
  const navigate = useNavigate();
  const { batch } = useQueryParams();
  const batchName = batch || "";

  const [initialYears, setInitialYears] = useState<ProfilerYear[]>([]);
  const [initialFolders, setInitialFolders] = useState<ProfilerFolder[]>([]);
  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);

  const [selectedBatch, setSelectedBatch] = useState(batchName);
  const [showPicker, setShowPicker] = useState(false);
  const {
    generating,
    orientation,
    setOrientation,
    options,
    disabled,
  } = useProfilerExport({ peserta, selectedBatch });

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
  }, [selectedBatch]);

  const handleBatchChange = (newBatch: string) => {
    setSelectedBatch(newBatch);
    setShowPicker(false);
    navigate({ to: "/profiler/export", search: { batch: newBatch } });
  };


  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <main className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeroHeader
            backHref="/profiler"
            backLabel="Kembali ke workspace KTP"
            eyebrow="Profiler export"
            title="Unduh batch aktif ke format yang siap dipakai lintas kebutuhan."
            description="Pilih folder, cek jumlah peserta, tentukan orientasi presentasi, lalu ekspor ke format yang paling sesuai."
            icon={<FileDown className="h-3.5 w-3.5" />}
          />

          <div className="space-y-4">
            <ProfilerExportToolbar
              selectedBatch={selectedBatch}
              showPicker={showPicker}
              setShowPicker={setShowPicker}
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
        </div>
      </main>
    </div>
  );
}
