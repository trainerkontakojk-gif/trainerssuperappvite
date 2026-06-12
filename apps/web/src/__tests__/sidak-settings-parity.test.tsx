import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import SidakSettingsPage from "../routes/sidak/settings";

const mockPeriods = [
  { id: "p-1", month: 5, year: 2026, label: "Mei 2026" },
  { id: "p-2", month: 6, year: 2026, label: "Juni 2026" },
];

const mockVersions = [
  {
    id: "v-draft",
    service_type: "call",
    effective_period_id: "p-1",
    status: "draft",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "weighted",
    version_number: 2,
    created_at: "2026-05-24T00:00:00Z",
    created_from_version_id: "v-pub",
  },
  {
    id: "v-pub",
    service_type: "call",
    effective_period_id: "p-1",
    status: "published",
    critical_weight: 0.6,
    non_critical_weight: 0.4,
    scoring_mode: "weighted",
    version_number: 1,
    created_at: "2026-05-01T00:00:00Z",
    created_from_version_id: null,
  },
];

const mockRuleIndicators = [
  {
    id: "ri-1",
    rule_version_id: "v-draft",
    service_type: "call",
    name: "Greeting Opening",
    category: "critical",
    bobot: 0.3,
    has_na: true,
    threshold: 2,
    sort_order: 1,
    legacy_indicator_id: "gi-1",
    created_by: null,
    created_at: "2026-05-24T00:00:00Z",
  },
  {
    id: "ri-2",
    rule_version_id: "v-draft",
    service_type: "call",
    name: "Closing Script",
    category: "non_critical",
    bobot: 0.7,
    has_na: false,
    threshold: null,
    sort_order: 2,
    legacy_indicator_id: null,
    created_by: null,
    created_at: "2026-05-24T00:00:00Z",
  },
];

describe("Sidak settings page legacy parity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T00:00:00Z"));
    window.scrollTo = vi.fn() as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the sticky header and buttons properly for a draft version", () => {
    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    render(<SidakSettingsPage />);

    // Active version should be the draft version by default rules
    expect(screen.getByText("Draft Rules v2")).toBeInTheDocument();
    
    // Draft version should show Publish and Hapus Draft buttons
    expect(screen.getByRole("button", { name: /^Publish$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Hapus Draft$/i })).toBeInTheDocument();
  });

  it("renders the sticky header and buttons properly for a published version when selected", () => {
    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    render(<SidakSettingsPage />);

    // Click on the published version card in history list
    const pubCard = screen.getAllByRole("button").find(
      (btn) => btn.textContent?.includes("v1") && btn.textContent?.includes("published")
    );
    expect(pubCard).toBeDefined();
    fireEvent.click(pubCard!);

    // Active version should change to published
    expect(screen.getByText("Versi Aktif (Published) v1")).toBeInTheDocument();
    
    // Published version should show Create Revision button
    expect(screen.getByRole("button", { name: /Create Revision/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Hapus Draft$/i })).not.toBeInTheDocument();
  });

  it("renders legacy parity fields (threshold, sort_order, linked) in indicator list", async () => {
    vi.useRealTimers();

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/indicators")) {
        return { data: mockRuleIndicators, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    render(<SidakSettingsPage />);

    const draftCard = screen.getAllByRole("button").find(
      (btn) => btn.textContent?.includes("v2") && btn.textContent?.includes("draft")
    );
    expect(draftCard).toBeDefined();

    fireEvent.click(draftCard!);

    // Wait for indicators to load
    await screen.findByText("Greeting Opening", {}, { timeout: 3000 });

    // Legacy parity field badges should be visible
    expect(screen.getByText("Th: 2")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Linked")).toBeInTheDocument();

    vi.useFakeTimers();
  });

  it("shows CTA Create Revision from Published when draft is empty but published has indicators", async () => {
    vi.useRealTimers();

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/indicators")) {
        return { data: [], loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    render(<SidakSettingsPage />);

    // Draft is selected by default; indicators are empty
    await screen.findByText("Belum ada parameter di versi ini.", {}, { timeout: 3000 });

    // CTA should appear because published version exists and has indicators in mock data
    expect(screen.getByText(/Versi published/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Revision dari Published/i })).toBeInTheDocument();

    vi.useFakeTimers();
  });

  it("shows baseline-aware empty state when no rule version exists", async () => {
    vi.useRealTimers();

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: [], loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/rule-versions/meta")) {
        return {
          data: {
            service_type: "call",
            indicator_count: 12,
            has_weight: true,
            draft_count: 0,
            published_count: 0,
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    render(<SidakSettingsPage />);

    await screen.findByText(/Baseline tersedia: 12 parameter/, {}, { timeout: 3000 });
    expect(screen.getByText("Buat Baseline")).toBeInTheDocument();

    vi.useFakeTimers();
  });

  it("shows no-baseline empty state when meta has zero indicators", async () => {
    vi.useRealTimers();

    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/rule-versions/meta")) {
        return {
          data: {
            service_type: "call",
            indicator_count: 0,
            has_weight: false,
            draft_count: 0,
            published_count: 0,
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: [], loading: false, error: null, refetch: vi.fn() };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    render(<SidakSettingsPage />);

    await screen.findByText("Belum ada parameter baseline untuk service ini.", {}, { timeout: 3000 });
    expect(screen.getByText("Buat Baseline")).toBeInTheDocument();

    vi.useFakeTimers();
  });

  it("calls delete draft via useApi when clicking Hapus Draft", async () => {
    vi.useRealTimers();
    const refetchVersionsMock = vi.fn();
    useApiMock.mockImplementation((path: string) => {
      if (path.includes("/sidak/periods")) {
        return { data: mockPeriods, loading: false, error: null, refetch: vi.fn() };
      }
      if (path.includes("/sidak/rule-versions")) {
        return { data: mockVersions, loading: false, error: null, refetch: refetchVersionsMock };
      }
      return { data: [], loading: false, error: null, refetch: vi.fn() };
    });

    vi.spyOn(window, "confirm").mockImplementation(() => true);

    render(<SidakSettingsPage />);

    // Click Hapus Draft
    const deleteBtn = screen.getByRole("button", { name: /^Hapus Draft$/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith("Hapus draft v2 untuk Call efektif Mei 2026? Versi published tidak akan berubah.");
    
    // Wait for the async call to resolve and trigger refetch
    await vi.waitFor(() => {
      expect(refetchVersionsMock).toHaveBeenCalled();
    });

    vi.useFakeTimers();
  });
});