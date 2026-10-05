import type { KeyboardEvent, ReactNode } from "react";
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
}

export default function SidakAgentDetailTabs({
  activeTab,
  mountedTabs,
  onTabChange,
  panels,
  toolbar,
}: Props) {
  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      ![
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "ArrowUp",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? SIDAK_AGENT_DETAIL_TABS.length - 1
          : (index +
              (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) +
              SIDAK_AGENT_DETAIL_TABS.length) %
            SIDAK_AGENT_DETAIL_TABS.length;
    onTabChange(SIDAK_AGENT_DETAIL_TABS[nextIndex].id);
  };

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
          aria-label="Bagian profil agen"
          className="flex h-auto w-max min-w-0 justify-start gap-6 p-0"
        >
          {SIDAK_AGENT_DETAIL_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              id={"sidak-agent-tab-" + tab.id}
              onKeyDown={(event) =>
                handleTabKeyDown(
                  event,
                  SIDAK_AGENT_DETAIL_TABS.findIndex(
                    (item) => item.id === tab.id,
                  ),
                )
              }
              className="h-11 flex-none shrink-0 rounded-none px-0 text-sm font-medium text-muted-foreground after:!bottom-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-active:text-foreground motion-reduce:transition-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {toolbar ? <div className="pt-4">{toolbar}</div> : null}

      <div className="pt-6">
        {SIDAK_AGENT_DETAIL_TABS.filter((tab) => mountedTabs.has(tab.id)).map(
          (tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              keepMounted
              id={"sidak-agent-panel-" + tab.id}
              aria-label={tab.label}
              aria-labelledby={"sidak-agent-tab-" + tab.id}
              className="min-w-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              {panels[tab.id]}
            </TabsContent>
          ),
        )}
      </div>
    </Tabs>
  );
}
