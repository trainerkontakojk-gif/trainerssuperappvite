import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAgentDetail } from "../hooks/useAgentDetail";
import { useAuthStore } from "../store/authStore";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
  fetchApi: vi.fn(),
  putApi: vi.fn(),
  deleteApi: vi.fn(),
}));

function buildAgentDetailData(selectedService: string | null) {
  const callPeriod = {
    id: "period-call",
    month: 5,
    year: 2026,
    label: "05/2026",
    serviceType: "call",
    finalScore: 92,
    nonCriticalScore: 90,
    criticalScore: 94,
    sessionCount: 3,
    findingsCount: 7,
  };

  const emailPeriod = {
    id: "period-email",
    month: 4,
    year: 2026,
    label: "04/2026",
    serviceType: "email",
    finalScore: 88,
    nonCriticalScore: 86,
    criticalScore: 90,
    sessionCount: 2,
    findingsCount: 5,
  };

  const temuan = [
    {
      id: "temuan-call-1",
      peserta_id: "agent-1",
      period_id: "period-call",
      indicator_id: "indicator-call",
      service_type: "call",
      no_tiket: "T-001",
      nilai: 2,
      ketidaksesuaian: "Call issue",
      sebaiknya: "Improve call handling",
      tahun: 2026,
      created_at: "2026-05-10T00:00:00Z",
    },
    {
      id: "temuan-email-1",
      peserta_id: "agent-1",
      period_id: "period-email",
      indicator_id: "indicator-email",
      service_type: "email",
      no_tiket: "E-001",
      nilai: 1,
      ketidaksesuaian: "Email issue",
      sebaiknya: "Improve email handling",
      tahun: 2026,
      created_at: "2026-04-10T00:00:00Z",
    },
  ];

  const periodSummaries =
    selectedService === "email"
      ? [emailPeriod]
      : selectedService === "call"
        ? [callPeriod]
        : [emailPeriod, callPeriod];

  return {
    indicators: [
      {
        id: "indicator-call",
        service_type: "call",
        name: "Call Indicator",
        category: "critical",
        bobot: 1,
        has_na: false,
      },
      {
        id: "indicator-email",
        service_type: "email",
        name: "Email Indicator",
        category: "critical",
        bobot: 1,
        has_na: false,
      },
    ],
    periodSummaries,
    temuan,
    personalTrend: {
      labels: [],
      datasets: [],
    },
    availableYears: [2026],
    scoreHistory: [],
    initialYear: 2026,
    initialService: "email",
    initialTrendRange: { start: 1, end: 5 },
    peserta: {
      id: "agent-1",
      nama: "Noor Qodiri Mobarok",
      tim: "Tim Email",
      batch_name: "Tim Email",
      jabatan: "cca",
      foto_url: null,
      bergabung_date: "2025-05-01",
    },
  };
}

describe("useAgentDetail", () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, profile: null });
    useApiMock.mockImplementation((path: string | null) => {
      const serviceType = path ? new URLSearchParams(path.split("?")[1] ?? "").get("service_type") : null;
      return {
        data: buildAgentDetailData(serviceType),
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps every available service pill visible after the active service refetches", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => expect(result.current.selectedService).toBe("email"));

    expect(result.current.availableServiceTypes).toEqual(
      expect.arrayContaining(["call", "email"]),
    );
    expect(result.current.availableServiceTypes).toHaveLength(2);
  });
});
