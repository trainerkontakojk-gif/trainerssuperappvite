import type { KeyboardEvent, ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  SIDAK_AGENT_DETAIL_TABS,
  type SidakAgentDetailTab,
} from "./sidak-agent-detail-tabs.constants";

interface Props {
  activeTab: SidakAgentDetailTab;
  mountedTabs: ReadonlySet<SidakAgentDetailTab>;
  onTabChange: (tab: SidakAgentDetailTab) => void;
  panels: Record<SidakAgentDetailTab, ReactNode>;
}

export default function SidakAgentDetailTabs({
  activeTab,
  mountedTabs,
  onTabChange,
  panels,
}: Props) {
  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? SIDAK_AGENT_DETAIL_TABS.length - 1
          : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + SIDAK_AGENT_DETAIL_TABS.length) % SIDAK_AGENT_DETAIL_TABS.length;
    onTabChange(SIDAK_AGENT_DETAIL_TABS[nextIndex].id);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as SidakAgentDetailTab)}
      className="min-w-0 flex-col"
    >
      <TabsList
        variant="line"
        aria-label="Bagian profil agen"
        className="flex h-auto min-h-11 !w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-none border-b border-border p-0 no-scrollbar"
      >
        {SIDAK_AGENT_DETAIL_TABS.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            id={"sidak-agent-tab-" + tab.id}
            onKeyDown={(event) =>
              handleTabKeyDown(
                event,
                SIDAK_AGENT_DETAIL_TABS.findIndex((item) => item.id === tab.id),
              )
            }
            className="h-11 min-h-11 flex-none shrink-0 rounded-none px-4 text-sm font-semibold"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

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
