import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SIDAK_AGENT_DETAIL_TABS,
  type SidakAgentDetailTab,
} from "./sidak-agent-detail-tabs.constants";

interface Props {
  activeTab: SidakAgentDetailTab;
  mountedTabs: ReadonlySet<SidakAgentDetailTab>;
  onTabChange: (tab: SidakAgentDetailTab) => void;
  panels: Record<SidakAgentDetailTab, ReactNode>;
  /** Filter konteks, dirender di antara daftar tab dan panel aktif. */
  toolbar?: ReactNode;
  /** Jumlah isi tab (mis. temuan), ditulis setelah label tab. */
  counts?: Partial<Record<SidakAgentDetailTab, number>>;
}

export default function SidakAgentDetailTabs({
  activeTab,
  mountedTabs,
  onTabChange,
  panels,
  toolbar,
  counts,
}: Props) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as SidakAgentDetailTab)}
      className="min-w-0 flex-col"
    >
      <div
        data-scroll-x
        className="-mx-4 overflow-x-auto border-b border-border px-4 no-scrollbar sm:mx-0 sm:px-0"
      >
        <TabsList
          variant="line"
          activateOnFocus={false}
          aria-label="Bagian profil agen"
          className="flex h-auto w-max min-w-0 justify-start gap-6 p-0"
        >
          {SIDAK_AGENT_DETAIL_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-11 flex-none shrink-0 rounded-none px-0 text-sm font-medium text-muted-foreground after:!bottom-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-active:text-foreground motion-reduce:transition-none"
            >
              {tab.label}
              {counts?.[tab.id] !== undefined ? (
                <>
                  {" "}
                  <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-fg2">
                    {counts[tab.id]}
                  </span>
                </>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {toolbar ? <div className="pt-4">{toolbar}</div> : null}

      <div className="pt-6">
        {/* Keep ID targets in the DOM without mounting content before activation. */}
        {SIDAK_AGENT_DETAIL_TABS.map((tab) => (
          <TabsContent
            key={tab.id}
            value={tab.id}
            keepMounted
            className="min-w-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            {mountedTabs.has(tab.id) ? panels[tab.id] : null}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
