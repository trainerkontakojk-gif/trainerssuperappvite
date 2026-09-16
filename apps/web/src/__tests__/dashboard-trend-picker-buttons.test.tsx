import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardTrendPanel from "../routes/dashboard/DashboardTrendPanel";
import { MonthRangePicker } from "../components/ui/MonthRangePicker";
import { sidakClient, unwrapResponse } from "../lib/api";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ReferenceLine: () => null,
}));

vi.mock("../lib/api", () => ({
  sidakClient: {
    dashboard: {
      forecast: {
        $post: vi.fn(),
      },
    },
  },
  unwrapResponse: vi.fn(),
}));

const mockTrendData: any = {
  labels: ["Jan 26", "Feb 26"],
  totalData: [10, 15],
  serviceData: {
    call: [10, 15],
    chat: [4, 6],
  },
  activeServices: ["call", "chat"],
  serviceSummary: {
    call: { totalDefects: 25, auditedAgents: 5 },
    chat: { totalDefects: 10, auditedAgents: 3 },
  },
  totalSummary: { totalDefects: 35, auditedAgents: 8, activeServiceCount: 2 },
};

function renderPanel() {
  return render(
    <DashboardTrendPanel
      serviceTrendMap={{ all: mockTrendData } as any}
      availableYears={[2026]}
      selectedYear={2026}
      trendStartMonth={null}
      trendEndMonth={null}
      trendLoading={false}
      localTrendData={null}
      onYearChange={() => {}}
      onRangeChange={() => {}}
    />,
  );
}

describe("dashboard trend pickers look like buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sidakClient.dashboard.forecast.$post).mockResolvedValue(
      {} as any,
    );
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "missing",
      snapshot: null,
    });
  });

  it("service picker uses button-like segmented control, not line tabs", () => {
    renderPanel();

    const semuaTab = screen.getByRole("tab", { name: /Semua/i });
    const tabsList = semuaTab.closest('[data-slot="tabs-list"]');
    expect(tabsList).not.toBeNull();
    // Button-like segmented control: default variant with muted bg, not transparent line style
    expect(tabsList).toHaveAttribute("data-variant", "default");

    // Triggers must read as buttons: semibold, normal size — not tiny 9px uppercase
    expect(semuaTab.className).not.toContain("text-[9px]");
    expect(semuaTab.className).toMatch(/text-xs/);
    expect(semuaTab.className).toMatch(/font-semibold/);
  });

  it("service picker scrolls without showing a scrollbar", () => {
    renderPanel();

    const semuaTab = screen.getByRole("tab", { name: /Semua/i });
    const tabsList = semuaTab.closest('[data-slot="tabs-list"]');
    expect(tabsList).not.toBeNull();
    // Overflow content must stay swipeable/scrollable but with no visible scrollbar
    expect(tabsList!.className).toMatch(/scrollbar-width/);
    expect(tabsList!.className).toContain("[&::-webkit-scrollbar]:hidden");
  });

  it("month range picker in trend panel renders compact button-like selects", () => {
    const { container } = render(
      <MonthRangePicker
        selectedYear={2026}
        startMonth={null}
        endMonth={null}
        onRangeChange={() => {}}
        variant="compact"
      />,
    );

    // Compact must not render the standalone boxy card container
    const boxy = container.querySelector(".rounded-xl.border.bg-muted\\/20");
    expect(boxy).toBeNull();

    const triggers = container.querySelectorAll('[data-slot="select-trigger"]');
    expect(triggers.length).toBe(2);
    triggers.forEach((trigger) => {
      // Button-like: fixed h-8 height, semibold small text
      expect(trigger.className).toMatch(/h-8/);
      expect(trigger.className).toMatch(/font-semibold/);
      expect(trigger.className).not.toMatch(/min-h-10/);
    });
  });

  it("trend panel embeds month picker without standalone box styling", () => {
    const { container } = renderPanel();

    // No standalone helper text like "Rentang bulan dibatasi dalam tahun"
    expect(container.textContent).not.toMatch(/dibatasi dalam tahun/);

    // Month triggers inside panel should be button-height (h-8), not tall min-h-10/11
    const monthTriggers = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    ).filter((el) =>
      (el.getAttribute("aria-label") || "").toLowerCase().includes("bulan"),
    );
    expect(monthTriggers.length).toBe(2);
    monthTriggers.forEach((trigger) => {
      expect(trigger.className).toMatch(/h-8/);
    });
  });
});
