import type { ServiceType } from "@trainers/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SERVICE_LABELS, TEAMS } from "../constants";

interface ServiceTabsProps {
  value: ServiceType;
  onChange: (service: ServiceType) => void;
}

/** Pemilih layanan; strip digulir horizontal di layar sempit (trigger shrink-0). */
export function ServiceTabs({ value, onChange }: ServiceTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as ServiceType)}
      className="min-w-0"
    >
      <div className="overflow-x-auto pb-2">
        <TabsList variant="line" aria-label="Layanan" className="w-max">
          {TEAMS.map((team) => (
            <TabsTrigger
              key={team}
              value={team}
              className="h-[44px] min-w-[44px] flex-none shrink-0 px-4 text-sm"
            >
              {SERVICE_LABELS[team]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
