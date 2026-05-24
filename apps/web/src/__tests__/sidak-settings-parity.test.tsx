import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
  getApi: vi.fn(),
  putApi: vi.fn(),
  postApi: vi.fn(),
  deleteApi: vi.fn(),
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

describe("Sidak settings page legacy parity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T00:00:00Z"));
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
});
