import { GalleryHorizontal, Table2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";

export type ProfilerRouteTab = "table" | "slides";

interface ProfilerRouteNavProps {
  active: ProfilerRouteTab;
  batchName: string;
}

export function ProfilerRouteNav({ active, batchName }: ProfilerRouteNavProps) {
  const router = useRouter();

  const handleChange = (value: string) => {
    if (value === "table") {
      router.navigate({ to: "/profiler/table", search: { batch: batchName } });
    }
    if (value === "slides") {
      router.navigate({
        to: "/profiler",
        search: { batch: batchName, view: "slide" },
      });
    }
  };

  return (
    <Tabs value={active} onValueChange={handleChange} className="w-full">
      <TabsList
        variant="line"
        aria-label="Tampilan Profiler"
        className="w-full justify-start gap-1 overflow-x-auto sm:w-fit"
      >
        <TabsTrigger value="table" className="min-h-11 gap-2 px-3 sm:px-4">
          <Table2 data-icon="inline-start" aria-hidden="true" />
          Daftar peserta
        </TabsTrigger>
        <TabsTrigger value="slides" className="min-h-11 gap-2 px-3 sm:px-4">
          <GalleryHorizontal data-icon="inline-start" aria-hidden="true" />
          Tampilan slide
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
