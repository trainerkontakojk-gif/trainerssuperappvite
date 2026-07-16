import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  SidakAgentForecastQuickview,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import AgentPerformanceQuickview from "../components/sidak/AgentPerformanceQuickview";

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

function renderQuickview(
  props: {
    data?: SidakAgentQuickviewResponse | null;
    loading?: boolean;
    error?: string | null;
  } = {},
) {
  return render(
    <AgentPerformanceQuickview
      data={props.data === undefined ? quickviewFixture : props.data}
      loading={props.loading ?? false}
      error={props.error ?? null}
    />,
  );
}

describe("AgentPerformanceQuickview", () => {
  it("renders both ranking cohorts, forecast status, and ranking basis", () => {
    renderQuickview();

    expect(screen.getByText("Tim Gabungan")).toBeInTheDocument();
    expect(screen.getByText("#8")).toBeInTheDocument();
    expect(screen.getByText("dari 64")).toBeInTheDocument();
    expect(screen.getByText("Tim Leader")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Membaik")).toBeInTheDocument();
    expect(screen.getByText("Temuan diproyeksikan turun")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Semakin tinggi peringkat, semakin sedikit temuan YTD. Peringkat terakhir menunjukkan jumlah temuan terbanyak. Jumlah yang sama mendapat peringkat yang sama.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a non-data loading skeleton", () => {
    renderQuickview({ data: null, loading: true });

    expect(
      screen.getByLabelText("Memuat quickview performa agent"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tim Gabungan")).not.toBeInTheDocument();
  });

  it("explains when a ranking cohort has no comparison agent", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        combinedTeam: {
          ...quickviewFixture.combinedTeam!,
          rank: null,
          total: 0,
        },
      },
    });

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Belum ada agent pembanding")).toBeInTheDocument();
  });

  it.each([
    ["Tim Gabungan", "combinedTeam"],
    ["Tim Leader", "leaderTeam"],
  ] as const)(
    "renders a neutral unavailable state when %s is missing after a partial failure",
    (label, field) => {
      renderQuickview({
        data: {
          ...quickviewFixture,
          [field]: null,
        },
      });

      const metric = screen.getByRole("group", {
        name: `${label}: belum tersedia`,
      });
      expect(within(metric).getByText("Ranking belum tersedia")).toBeInTheDocument();
      expect(
        within(metric).queryByText("Belum ada agent pembanding"),
      ).not.toBeInTheDocument();
    },
  );

  it("explains when the agent is outside an existing cohort ranking", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        combinedTeam: {
          ...quickviewFixture.combinedTeam!,
          rank: null,
          total: 7,
        },
      },
    });

    const metric = screen.getByRole("group", {
      name: "Tim Gabungan: belum tersedia",
    });
    expect(within(metric).getByText("—")).toBeInTheDocument();
    expect(
      within(metric).getByText("Agent belum masuk ranking pada konteks ini"),
    ).toBeInTheDocument();
    expect(
      within(metric).queryByText("Belum ada agent pembanding"),
    ).not.toBeInTheDocument();
  });

  it("renders the insufficient forecast guidance", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        forecast: {
          status: "insufficient_data",
          label: "Data belum cukup",
          supportingText: "Butuh minimal 2 periode audit",
          findingsSlope: null,
          sourcePointCount: 1,
          confidence: null,
          horizonMonths: 3,
        },
      },
    });

    expect(screen.getByText("Data belum cukup")).toBeInTheDocument();
    expect(
      screen.getByText("Butuh minimal 2 periode audit"),
    ).toBeInTheDocument();
  });

  it("renders a neutral unavailable state when forecast is partially unavailable", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        forecast: null,
      },
    });

    const metric = screen.getByRole("group", {
      name: "Forecast: belum tersedia",
    });
    expect(within(metric).getByText("—")).toBeInTheDocument();
    expect(
      within(metric).getByText("Forecast belum tersedia"),
    ).toBeInTheDocument();
    expect(within(metric).queryByText("Data belum cukup")).not.toBeInTheDocument();
    expect(
      within(metric).queryByText("Butuh minimal 2 periode audit"),
    ).not.toBeInTheDocument();
  });

  it("renders a calm request error state", () => {
    renderQuickview({
      data: null,
      error: "Network failure",
    });

    expect(
      screen.getByText("Quickview belum dapat dimuat"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Network failure")).not.toBeInTheDocument();
  });

  it("avoids presenting an identical leader scope as a different cohort", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        leaderTeam: {
          ...quickviewFixture.leaderTeam!,
          scopeId: quickviewFixture.combinedTeam!.scopeId,
        },
      },
    });

    expect(
      screen.getByText("Cohort yang sama dengan Tim Gabungan"),
    ).toBeInTheDocument();
  });

  it("uses the required mobile-first three-column class contract", () => {
    renderQuickview();

    expect(
      screen.getByRole("region", { name: "Quickview performa agent" }),
    ).toHaveClass("grid-cols-1", "md:grid-cols-3");
  });

  it.each<
    [
      SidakAgentForecastQuickview["status"],
      SidakAgentForecastQuickview["label"],
    ]
  >([
    ["improving", "Membaik"],
    ["stable", "Stabil/Stagnan"],
    ["declining", "Memburuk"],
    ["insufficient_data", "Data belum cukup"],
  ])("renders an icon and visible label for %s forecast", (status, label) => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        forecast: {
          ...quickviewFixture.forecast!,
          status,
          label,
        },
      },
    });

    const metric = screen.getByRole("group", {
      name: `Forecast: ${label}`,
    });
    expect(within(metric).getByText(label)).toBeInTheDocument();
    expect(metric.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});
