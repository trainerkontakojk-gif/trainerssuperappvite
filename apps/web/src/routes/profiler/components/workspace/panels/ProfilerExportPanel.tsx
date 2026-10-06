import type { ProfilerPeserta } from "@trainers/types";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ProfilerExportGrid } from "../../export/ProfilerExportGrid";
import { useProfilerExport } from "../../../hooks/useProfilerExport";

interface ProfilerExportPanelProps {
  batchName: string;
  peserta: ProfilerPeserta[];
}

/** Unduh peserta batch ke Excel, CSV, PowerPoint, atau PDF. */
export default function ProfilerExportPanel({
  batchName,
  peserta,
}: ProfilerExportPanelProps) {
  const { generating, orientation, setOrientation, options, disabled } =
    useProfilerExport({ peserta, selectedBatch: batchName });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground tabular-nums">
          {peserta.length > 0
            ? `${peserta.length} peserta akan diekspor.`
            : "Belum ada peserta untuk diekspor."}
        </p>
        <div className="flex items-center gap-3">
          <span
            id="profiler-export-orientation"
            className="text-sm text-muted-foreground"
          >
            Orientasi PPTX/PDF
          </span>
          <Tabs
            value={orientation}
            onValueChange={(value) => {
              if (value === "landscape" || value === "portrait")
                setOrientation(value);
            }}
          >
            <TabsList
              aria-labelledby="profiler-export-orientation"
              className="h-11"
            >
              <TabsTrigger value="landscape" className="h-9 px-3 text-xs">
                Landscape
              </TabsTrigger>
              <TabsTrigger value="portrait" className="h-9 px-3 text-xs">
                Portrait
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <ProfilerExportGrid
        options={options}
        disabled={disabled}
        generating={generating}
      />
    </div>
  );
}
