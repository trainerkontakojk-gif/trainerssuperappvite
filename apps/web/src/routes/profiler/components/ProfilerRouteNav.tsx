import { BarChart3, GalleryHorizontal, Table2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Button } from "../../../components/ui/button";

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
      router.navigate({ to: "/profiler/slides", search: { batch: batchName } });
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

export function ProfilerAnalyticsLink({ batchName }: { batchName: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      onClick={() =>
        router.navigate({
          to: "/profiler/analytics",
          search: { batch: batchName },
        })
      }
      className="min-h-11 text-muted-foreground"
    >
      <BarChart3 aria-hidden="true" className="size-4" />
      Analytics
    </Button>
  );
}
