import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
        "Semakin tinggi peringkat, semakin sedikit temuan sepanjang tahun. Peringkat terakhir menunjukkan jumlah temuan terbanyak. Jumlah temuan yang sama mendapat peringkat yang sama.",
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
    expect(screen.getByText("Belum ada agen pembanding")).toBeInTheDocument();
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
      expect(
        within(metric).getByText("Peringkat belum tersedia"),
      ).toBeInTheDocument();
      expect(
        within(metric).queryByText("Belum ada agen pembanding"),
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
      within(metric).getByText("Belum masuk peringkat pada cakupan ini"),
    ).toBeInTheDocument();
    expect(
      within(metric).queryByText("Belum ada agen pembanding"),
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
    expect(
      within(metric).queryByText("Data belum cukup"),
    ).not.toBeInTheDocument();
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
      screen.getByText("Cakupan sama dengan Tim Gabungan"),
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

  // ── Tie info fixtures ──
  const tiedQuickview1: SidakAgentQuickviewResponse = {
    ...quickviewFixture,
    combinedTeam: {
      ...quickviewFixture.combinedTeam!,
      rank: 1,
      total: 64,
      tiedAgents: [{ agentId: "tania-002", nama: "Tania" }],
    },
  };

  const tiedQuickview2: SidakAgentQuickviewResponse = {
    ...quickviewFixture,
    combinedTeam: {
      ...quickviewFixture.combinedTeam!,
      rank: 1,
      total: 64,
      tiedAgents: [
        { agentId: "tania-002", nama: "Tania" },
        { agentId: "budi-003", nama: "Budi" },
      ],
    },
  };

  const tiedQuickviewMany: SidakAgentQuickviewResponse = {
    ...quickviewFixture,
    combinedTeam: {
      ...quickviewFixture.combinedTeam!,
      rank: 2,
      total: 64,
      tiedAgents: [
        { agentId: "tania-002", nama: "Tania" },
        { agentId: "budi-003", nama: "Budi Santoso" },
        { agentId: "siti-004", nama: "Siti Rahma" },
        { agentId: "dimas-005", nama: "Dimas Putra" },
      ],
    },
  };

  // ── Tie 1 peer ──
  it("shows 'Berbagi peringkat ... dengan {nama}' when 1 peer tied", () => {
    renderQuickview({ data: tiedQuickview1 });

    const metric = screen.getByRole("group", {
      name: /Tim Gabungan: peringkat 1/,
    });
    expect(
      within(metric).getByText("Berbagi peringkat 1 dengan Tania"),
    ).toBeInTheDocument();
    expect(within(metric).getByText("#1")).toBeInTheDocument();
  });

  // ── Tie 2 peer ──
  it("shows '... dengan {nama1} dan {nama2}' when 2 peers tied", () => {
    renderQuickview({ data: tiedQuickview2 });

    const metric = screen.getByRole("group", {
      name: /Tim Gabungan: peringkat 1/,
    });
    expect(
      within(metric).getByText("Berbagi peringkat 1 dengan Tania dan Budi"),
    ).toBeInTheDocument();
  });

  // ── Tie many (≥3) — collapsed ──
  it("shows collapsed form when 3+ peers tied, with disclosure button", () => {
    renderQuickview({ data: tiedQuickviewMany });

    const metric = screen.getByRole("group", {
      name: /Tim Gabungan: peringkat 2/,
    });
    expect(
      within(metric).getByText(
        "Berbagi peringkat 2 dengan Tania dan 3 agen lain",
      ),
    ).toBeInTheDocument();

    const btn = within(metric).getByRole("button", {
      name: /Lihat semua agen yang berbagi peringkat 2/,
    });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls");
    expect(btn.getAttribute("aria-controls")).toBeTruthy();
    expect(btn).toHaveAttribute(
      "aria-label",
      "Lihat semua agen yang berbagi peringkat 2",
    );
  });

  // ── Tie many — expanded ──
  it("shows all peer names when disclosure is expanded", async () => {
    const user = userEvent.setup();
    renderQuickview({ data: tiedQuickviewMany });

    await user.click(
      screen.getByRole("button", {
        name: /Lihat semua agen yang berbagi peringkat 2/,
      }),
    );

    const btn = screen.getByRole("button", {
      name: /Sembunyikan daftar agen yang berbagi peringkat 2/,
    });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn).toHaveAttribute(
      "aria-label",
      "Sembunyikan daftar agen yang berbagi peringkat 2",
    );
    // aria-controls points to the rendered peers panel
    const panelId = btn.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();

    // All names visible (with bullet prefix in <li>)
    expect(screen.getByText(/Budi Santoso/)).toBeInTheDocument();
    expect(screen.getByText(/Siti Rahma/)).toBeInTheDocument();
    expect(screen.getByText(/Dimas Putra/)).toBeInTheDocument();
  });

  // ── No tie (empty array) ──
  it("does NOT render tie info when tiedAgents is empty array", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        combinedTeam: {
          ...quickviewFixture.combinedTeam!,
          tiedAgents: [],
        },
      },
    });
    expect(screen.queryByText(/^Berbagi peringkat/)).not.toBeInTheDocument();
  });

  // ── Legacy (undefined) ──
  it("does NOT render tie info when tiedAgents is undefined (legacy contract)", () => {
    renderQuickview();
    expect(screen.queryByText(/^Berbagi peringkat/)).not.toBeInTheDocument();
  });

  // ── Null (rank unavailable) ──
  it("does NOT render tie info when tiedAgents is null", () => {
    renderQuickview({
      data: {
        ...quickviewFixture,
        combinedTeam: {
          ...quickviewFixture.combinedTeam!,
          rank: null,
          total: 0,
          tiedAgents: null,
        },
      },
    });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/^Berbagi peringkat/)).not.toBeInTheDocument();
  });

  // ── Tie info + ranking basis footnote coexist ──
  it("tie info renders alongside the ranking-basis footnote", () => {
    renderQuickview({ data: tiedQuickview1 });
    expect(
      screen.getByText(/Jumlah temuan yang sama mendapat peringkat yang sama/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Berbagi peringkat 1 dengan Tania"),
    ).toBeInTheDocument();
  });

  // ── Loading / null data: no stale tie ──
  it("does NOT render tie info during loading state", () => {
    renderQuickview({ data: null, loading: true });
    expect(screen.queryByText(/^Berbagi peringkat/)).not.toBeInTheDocument();
  });
});
