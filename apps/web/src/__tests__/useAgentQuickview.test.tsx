import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SidakAgentQuickviewResponse } from "@trainers/types";
import { useAgentQuickview } from "../hooks/useAgentQuickview";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

const quickviewFixture: SidakAgentQuickviewResponse = {
  context: {
    agentId: "agent-1",
    year: 2026,
    serviceType: "call",
    periodMode: "ytd",
  },
  combinedTeam: {
    rank: 8,
    total: 64,
    scopeId: "folder-parent",
    scopeLabel: "Tim Call",
    basis: "least_findings_ytd",
  },
  leaderTeam: {
    rank: 2,
    total: 12,
    scopeId: "folder-child",
    scopeLabel: "Leader Dimas",
    basis: "least_findings_ytd",
  },
  forecast: {
    status: "improving",
    label: "Membaik",
    supportingText: "Temuan diproyeksikan turun",
    findingsSlope: -1.25,
    sourcePointCount: 5,
    confidence: "high",
    horizonMonths: 3,
  },
};

describe("useAgentQuickview", () => {
  beforeEach(() => {
    useApiMock.mockReset();
    useApiMock.mockReturnValue({
      data: quickviewFixture,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("requests the selected agent, year, and service context", () => {
    const { result } = renderHook(() =>
      useAgentQuickview("agent-1", 2026, "call"),
    );

    expect(useApiMock).toHaveBeenCalledWith(
      "/sidak/agents/agent-1/quickview?year=2026&service_type=call",
    );
    expect(result.current.data).toEqual(quickviewFixture);
    expect(result.current.loading).toBe(false);
  });

  it("suppresses retained data from a stale service response", () => {
    useApiMock.mockReturnValue({
      data: {
        ...quickviewFixture,
        context: {
          ...quickviewFixture.context,
          serviceType: "email",
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useAgentQuickview("agent-1", 2026, "call"),
    );

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("suppresses a stale error immediately when year, service, or agent changes", () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: "Request lama gagal",
      refetch: vi.fn(),
    });

    const { result, rerender } = renderHook(
      ({
        agentId,
        year,
        serviceType,
      }: {
        agentId: string;
        year: number;
        serviceType: string;
      }) => useAgentQuickview(agentId, year, serviceType),
      {
        initialProps: {
          agentId: "agent-1",
          year: 2026,
          serviceType: "call",
        },
      },
    );

    expect(result.current.error).toBe("Request lama gagal");
    expect(result.current.loading).toBe(false);

    rerender({
      agentId: "agent-1",
      year: 2025,
      serviceType: "call",
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    rerender({
      agentId: "agent-1",
      year: 2025,
      serviceType: "email",
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    rerender({
      agentId: "agent-2",
      year: 2025,
      serviceType: "email",
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("does not request quickview data before a service is selected", () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAgentQuickview("agent-1", 2026, ""));

    expect(useApiMock).toHaveBeenCalledWith(null);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("clears a retained request error when the selected service becomes empty", () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: "Request lama gagal",
      refetch: vi.fn(),
    });

    const { result, rerender } = renderHook(
      ({ serviceType }: { serviceType: string }) =>
        useAgentQuickview("agent-1", 2026, serviceType),
      {
        initialProps: {
          serviceType: "call",
        },
      },
    );

    expect(result.current.error).toBe("Request lama gagal");

    rerender({ serviceType: "" });

    expect(useApiMock).toHaveBeenLastCalledWith(null);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
