import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const [focusWithinList, setFocusWithinList] = useState(false);

  useLayoutEffect(() => {
    const strip = scrollRef.current;
    const list = strip?.querySelector('[role="tablist"]');
    if (!strip || !list) return;

    const updateEdges = () => {
      const start = strip.scrollLeft > 1;
      const end = strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1;
      setEdges((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      );
    };

    const revealActiveTab = () => {
      const active = list.querySelector('[aria-selected="true"]');
      if (active && strip.scrollWidth > strip.clientWidth) {
        const bounds = strip.getBoundingClientRect();
        const tab = active.getBoundingClientRect();
        const inset = parseFloat(getComputedStyle(strip).scrollPaddingLeft);
        const left = tab.left - bounds.left - inset;
        const right = tab.right - bounds.right + inset;
        const delta = left < 0 ? left : Math.max(0, right);
        // Scroll only the strip, not the page or the focused element.
        if (delta !== 0) strip.scrollBy({ left: delta, behavior: "instant" });
      }
      updateEdges();
    };

    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(strip);
    observer.observe(list);
    strip.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", updateEdges);
    };
  }, [activeTab]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as SidakAgentDetailTab)}
      className="min-w-0 flex-col"
    >
      <div className="relative -mx-4 border-b border-border sm:mx-0">
        <div
          ref={scrollRef}
          data-scroll-x="agent-tabs"
          className="overflow-x-auto overscroll-x-contain scroll-px-4 px-4 sm:px-0"
        >
          <TabsList
            variant="line"
            activateOnFocus={false}
            aria-label="Bagian profil agen"
            onFocus={() => setFocusWithinList(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setFocusWithinList(false);
              }
            }}
            className="flex h-auto w-max min-w-0 justify-start gap-6 p-0 any-pointer-coarse:gap-3"
          >
            {SIDAK_AGENT_DETAIL_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                // Base UI owns roving focus inside the list. Re-enter on selection.
                {...(!focusWithinList && { tabIndex: tab.id === activeTab ? 0 : -1 })}
                className="h-11 flex-none shrink-0 rounded-none px-0 text-sm font-medium text-muted-foreground after:!bottom-0 after:bg-transparent after:border-b-2 after:border-solid after:border-foreground hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-active:text-foreground motion-reduce:transition-none any-pointer-coarse:min-h-[44px] any-pointer-coarse:min-w-[44px] any-pointer-coarse:px-2"
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
        {edges.start ? (
          <span
            aria-hidden="true"
            data-testid="agent-tabs-fade-start"
            className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-r from-background to-transparent forced-colors:hidden"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden="true"
            data-testid="agent-tabs-fade-end"
            className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-l from-background to-transparent forced-colors:hidden"
          />
        ) : null}
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
