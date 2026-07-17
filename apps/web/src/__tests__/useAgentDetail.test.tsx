import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAgentDetail } from "../hooks/useAgentDetail";
import { useAuthStore } from "../store/authStore";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
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

  const callPeriodJanuary = {
    id: "period-call-jan",
    month: 1,
    year: 2026,
    label: "01/2026",
    serviceType: "call",
    finalScore: 90,
    nonCriticalScore: 88,
    criticalScore: 92,
    sessionCount: 2,
    findingsCount: 3,
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
      id: "temuan-call-jan-1",
      peserta_id: "agent-1",
      period_id: "period-call-jan",
      indicator_id: "indicator-call",
      service_type: "call",
      no_tiket: "T-JAN-001",
      nilai: 1,
      ketidaksesuaian: "Call issue from January",
      sebaiknya: "Improve January call handling",
      tahun: 2026,
      created_at: "2026-01-10T00:00:00Z",
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
        ? [callPeriodJanuary, callPeriod]
        : [emailPeriod, callPeriod];

  return {
    ...(selectedService === "call"
      ? {
          rootCauses: [
            {
              clusterId: "salah_jawaban",
              label: "Jawaban salah/tidak akurat",
              priority: 8,
              findingsCount: 2,
              affectedTickets: 2,
              criticalFindingsCount: 1,
              averageNilai: 0.5,
              matchedKeywords: ["salah jawaban"],
              recommendation:
                "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
              evidence: [
                {
                  id: "e-call-jan",
                  no_tiket: "T-JAN-001",
                  periodId: "period-call-jan",
                  indicatorName: "Call Indicator",
                  nilai: 1,
                  text: "Call January evidence",
                },
                {
                  id: "e-call",
                  no_tiket: "T-001",
                  periodId: "period-call",
                  indicatorName: "Call Indicator",
                  nilai: 0,
                  text: "Call active evidence",
                },
                {
                  id: "e-old",
                  no_tiket: "OLD-001",
                  periodId: "period-old",
                  indicatorName: "Call Indicator",
                  nilai: 0,
                  text: "Old stale evidence",
                },
              ],
              periods: [
                {
                  periodId: "period-call-jan",
                  month: 1,
                  year: 2026,
                  label: "01/2026",
                  serviceType: "call",
                  findingsCount: 1,
                  criticalFindingsCount: 0,
                  affectedTickets: 1,
                },
                {
                  periodId: "period-call",
                  month: 5,
                  year: 2026,
                  label: "05/2026",
                  serviceType: "call",
                  findingsCount: 2,
                  criticalFindingsCount: 1,
                  affectedTickets: 2,
                },
              ],
            },
          ],
        }
      : selectedService === "email"
        ? {
            rootCauses: [
              {
                clusterId: "kurang_menggali",
                label: "Kurang menggali kebutuhan",
                priority: 5,
                findingsCount: 1,
                affectedTickets: 1,
                criticalFindingsCount: 0,
                averageNilai: 2,
                matchedKeywords: ["kurang menggali"],
                recommendation:
                  "Latih pertanyaan klarifikasi agar kebutuhan, kronologi, dan konteks pelanggan tergali tuntas.",
                evidence: [
                  {
                    id: "e-email",
                    no_tiket: "E-001",
                    periodId: "period-email",
                    indicatorName: "Email Indicator",
                    nilai: 1,
                    text: "Email active evidence",
                  },
                ],
                periods: [
                  {
                    periodId: "period-email",
                    month: 4,
                    year: 2026,
                    label: "04/2026",
                    serviceType: "email",
                    findingsCount: 1,
                    criticalFindingsCount: 0,
                    affectedTickets: 1,
                  },
                ],
              },
            ],
          }
        : {
            rootCauses: [
              {
                clusterId: "salah_jawaban",
                label: "Jawaban salah/tidak akurat",
                priority: 8,
                findingsCount: 2,
                affectedTickets: 2,
                criticalFindingsCount: 1,
                averageNilai: 0.5,
                matchedKeywords: ["salah jawaban"],
                recommendation:
                  "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
                evidence: [
                {
                  id: "e-call-jan",
                  no_tiket: "T-JAN-001",
                  periodId: "period-call-jan",
                  indicatorName: "Call Indicator",
                  nilai: 1,
                  text: "Call January evidence",
                },
                {
                  id: "e-call",
                  no_tiket: "T-001",
                  periodId: "period-call",
                    indicatorName: "Call Indicator",
                    nilai: 0,
                    text: "Call active evidence",
                  },
                  {
                    id: "e-old",
                    no_tiket: "OLD-001",
                    periodId: "period-old",
                    indicatorName: "Call Indicator",
                    nilai: 0,
                    text: "Old stale evidence",
                  },
                ],
              periods: [
                {
                  periodId: "period-call-jan",
                  month: 1,
                  year: 2026,
                  label: "01/2026",
                  serviceType: "call",
                  findingsCount: 1,
                  criticalFindingsCount: 0,
                  affectedTickets: 1,
                },
                {
                  periodId: "period-call",
                  month: 5,
                    year: 2026,
                    label: "05/2026",
                    serviceType: "call",
                    findingsCount: 2,
                    criticalFindingsCount: 1,
                    affectedTickets: 2,
                  },
                ],
              },
              {
                clusterId: "kurang_menggali",
                label: "Kurang menggali kebutuhan",
                priority: 5,
                findingsCount: 1,
                affectedTickets: 1,
                criticalFindingsCount: 0,
                averageNilai: 2,
                matchedKeywords: ["kurang menggali"],
                recommendation:
                  "Latih pertanyaan klarifikasi agar kebutuhan, kronologi, dan konteks pelanggan tergali tuntas.",
                evidence: [
                  {
                    id: "e-email",
                    no_tiket: "E-001",
                    periodId: "period-email",
                    indicatorName: "Email Indicator",
                    nilai: 1,
                    text: "Email active evidence",
                  },
                ],
                periods: [
                  {
                    periodId: "period-email",
                    month: 4,
                    year: 2026,
                    label: "04/2026",
                    serviceType: "email",
                    findingsCount: 1,
                    criticalFindingsCount: 0,
                    affectedTickets: 1,
                  },
                ],
              },
            ],
          }),
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
    comparisonTable: {
      scope: {
        year: 2026,
        serviceType: "email",
        startMonth: 1,
        endMonth: 5,
        teamLabel: "Tim Email",
        serviceLabel: "Email",
      },
      rows: [
        {
          key: "total",
          label: "Total Temuan",
          agentCount: 6,
          teamAverage: 4,
          serviceAverage: 5,
          teamAgentCount: 3,
          serviceAgentCount: 10,
        },
        {
          key: "indicator-email",
          label: "Email Indicator",
          agentCount: 3,
          teamAverage: 2,
          serviceAverage: 2.5,
          teamAgentCount: 3,
          serviceAgentCount: 10,
        },
      ],
    },
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
      const serviceType = path
        ? new URLSearchParams(path.split("?")[1] ?? "").get("service_type")
        : null;
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

  it("handleInputAudit navigates with folder param encoded", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { ...originalLocation, assign: assignMock };

    const { result } = renderHook(() => useAgentDetail("agent-1"));
    await waitFor(() => expect(result.current.selectedService).toBe("email"));

    result.current.handleInputAudit();

    const calledUrl = assignMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl, "http://localhost");
    expect(url.pathname).toBe("/sidak/input");
    expect(url.searchParams.get("agent_id")).toBe("agent-1");
    expect(url.searchParams.get("folder")).toBe("Tim Email");

    (window as any).location = originalLocation;
  });

  it("restores the latest available month when the active service changes so Top 5 stays populated", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => expect(result.current.selectedService).toBe("email"));
    await waitFor(() => expect(result.current.selectedMonth).toBe(4));

    result.current.handleServiceChange("call");

    await waitFor(() => expect(result.current.selectedService).toBe("call"));
    await waitFor(() => expect(result.current.selectedMonth).toBe(5));
    await waitFor(() => expect(result.current.topTickets).toHaveLength(1));

    expect(result.current.topTickets[0]).toMatchObject({
      no_tiket: "T-001",
      findingCount: 1,
    });
  });

  it("returns root causes year-to-date through the active selected month and service", async () => {
    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => expect(result.current.selectedService).toBe("email"));
    await waitFor(() => expect(result.current.selectedMonth).toBe(4));
    expect(
      result.current.activeRootCauses.map((cause) => cause.clusterId),
    ).toEqual(["kurang_menggali"]);

    result.current.handleServiceChange("call");

    await waitFor(() => expect(result.current.selectedService).toBe("call"));
    await waitFor(() => expect(result.current.selectedMonth).toBe(5));
    expect(
      result.current.activeRootCauses.map((cause) => cause.clusterId),
    ).toEqual(["salah_jawaban"]);
    expect(result.current.activeRootCauses[0]).toMatchObject({
      findingsCount: 3,
      affectedTickets: 3,
      criticalFindingsCount: 1,
    });
    expect(
      result.current.activeRootCauses[0].evidence.map((item) => item.id),
    ).toEqual(["e-call-jan", "e-call"]);

    act(() => {
      result.current.handleMonthSelect(1);
    });

    await waitFor(() => expect(result.current.selectedMonth).toBe(1));
    expect(result.current.activeRootCauses[0]).toMatchObject({
      findingsCount: 1,
      affectedTickets: 1,
      criticalFindingsCount: 0,
    });
    expect(
      result.current.activeRootCauses[0].evidence.map((item) => item.id),
    ).toEqual(["e-call-jan"]);
  });

  it("returns empty root causes when data has no rootCauses", async () => {
    useApiMock.mockImplementation((_path: string | null) => {
      const data = buildAgentDetailData("email");
      const { rootCauses: _rootCauses, ...rest } = data as any;
      return {
        data: { ...rest, rootCauses: undefined },
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => expect(result.current.selectedService).toBe("email"));
    expect(result.current.activeRootCauses).toEqual([]);
  });

  it("re-sorts active root causes by impact after YTD aggregation", async () => {
    useApiMock.mockImplementation((path: string | null) => {
      const serviceType = path
        ? new URLSearchParams(path.split("?")[1] ?? "").get("service_type")
        : null;
      const data = buildAgentDetailData(serviceType) as any;

      if (serviceType === "call") {
        const salahJawaban = data.rootCauses[0];
        data.rootCauses = [
          {
            ...salahJawaban,
            clusterId: "salah_penggunaan_sistem",
            label: "Kesalahan penggunaan sistem/APPK",
            priority: 9,
            findingsCount: 1,
            affectedTickets: 1,
            criticalFindingsCount: 0,
            matchedKeywords: ["appk"],
            evidence: [],
            periods: [
              {
                periodId: "period-call",
                month: 5,
                year: 2026,
                label: "05/2026",
                serviceType: "call",
                findingsCount: 1,
                criticalFindingsCount: 0,
                affectedTickets: 1,
              },
            ],
          },
          salahJawaban,
        ];
      }

      return { data, loading: false, error: null, refetch: vi.fn() };
    });

    const { result } = renderHook(() => useAgentDetail("agent-1"));
    await waitFor(() => expect(result.current.selectedService).toBe("email"));
    result.current.handleServiceChange("call");
    await waitFor(() => expect(result.current.selectedService).toBe("call"));

    expect(result.current.activeRootCauses.map((cause) => cause.clusterId)).toEqual([
      "salah_jawaban",
      "salah_penggunaan_sistem",
    ]);
  });

  it("includes temuan with unknown/inactive indicator_id using fallback label instead of silently filtering them out", async () => {
    useApiMock.mockImplementation((path: string | null) => {
      const serviceType = path
        ? new URLSearchParams(path.split("?")[1] ?? "").get("service_type")
        : null;
      const data = buildAgentDetailData(serviceType);
      // Add a temuan whose indicator_id does NOT exist in the active indicators array
      data.temuan.push({
        id: "temuan-defunct-indicator",
        peserta_id: "agent-1",
        period_id: "period-call",
        indicator_id: "indicator-defunct",
        service_type: "call",
        no_tiket: "T-DEFUNCT",
        nilai: 2,
        ketidaksesuaian: "Historical finding with inactive indicator",
        sebaiknya: "N/A",
        tahun: 2026,
        created_at: "2026-04-01T00:00:00Z",
      });
      return { data, loading: false, error: null, refetch: vi.fn() };
    });

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => expect(result.current.selectedService).toBe("email"));

    result.current.handleServiceChange("call");
    await waitFor(() => expect(result.current.selectedService).toBe("call"));
    await waitFor(() => expect(result.current.selectedMonth).toBe(5));

    const items = result.current.temuanDisplayItems;
    const defunctItem = items.find(
      (item) => item.id === "temuan-defunct-indicator",
    );
    expect(defunctItem).toBeDefined();
    expect(defunctItem!.indicatorName).toBe("Indikator lama/nonaktif");
    expect(defunctItem!.ketidaksesuaian).toBe(
      "Historical finding with inactive indicator",
    );
    expect(defunctItem!.no_tiket).toBe("T-DEFUNCT");
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it("does not reset the selected service while a stale previous-service response is still loading", async () => {
    useApiMock.mockImplementation((path: string | null) => {
      const serviceType = path
        ? new URLSearchParams(path.split("?")[1] ?? "").get("service_type")
        : null;
      const isSwitchingToCall = serviceType === "call";

      return {
        data: buildAgentDetailData(isSwitchingToCall ? "email" : serviceType),
        loading: isSwitchingToCall,
        error: null,
        refetch: vi.fn(),
      };
    });

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => expect(result.current.selectedService).toBe("email"));

    result.current.handleServiceChange("call");

    await waitFor(() => expect(result.current.selectedService).toBe("call"));
  });
});
