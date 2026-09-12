import React from "react";
import type { ProfilerYear, ProfilerFolder } from "@trainers/types";
import { FileDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { Badge } from "../../../../components/ui/badge";
import { ProfilerFolderSelect } from "../ProfilerFolderSelect";

interface ProfilerExportToolbarProps {
  selectedBatch: string;
  initialYears: ProfilerYear[];
  initialFolders: ProfilerFolder[];
  handleBatchChange: (newBatch: string) => void;
  pesertaCount: number;
  orientation: "landscape" | "portrait";
  setOrientation: (orientation: "landscape" | "portrait") => void;
}

export function ProfilerExportToolbar({
  selectedBatch,
  initialYears,
  initialFolders,
  handleBatchChange,
  pesertaCount,
  orientation,
  setOrientation,
}: ProfilerExportToolbarProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="size-4 text-primary" aria-hidden="true" />{" "}
            Folder sumber
          </CardTitle>
          <CardDescription>Pilih batch yang akan diunduh.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfilerFolderSelect
            years={initialYears}
            folders={initialFolders}
            value={selectedBatch}
            label="Folder yang akan diunduh"
            onChange={handleBatchChange}
          />
        </CardContent>
      </Card>
      <Card className="shadow-none lg:min-w-72">
        <CardHeader>
          <CardTitle className="text-base">Pengaturan output</CardTitle>
          <CardDescription>
            <Badge variant="secondary" className="tabular-nums">
              {pesertaCount} peserta siap
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={orientation}
            onValueChange={(value) => {
              if (value === "landscape" || value === "portrait")
                setOrientation(value);
            }}
          >
            <TabsList className="h-11 w-full">
              <TabsTrigger value="landscape" className="h-9 flex-1 text-xs">
                Landscape
              </TabsTrigger>
              <TabsTrigger value="portrait" className="h-9 flex-1 text-xs">
                Portrait
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
