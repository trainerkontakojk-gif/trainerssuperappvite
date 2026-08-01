import { describe, expect, it, vi, beforeEach } from "vitest";

const useApiMock = vi.hoisted(() => vi.fn());
const accessGroupItemPostMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("../lib/api", () => ({
  adminClient: {
    "access-groups": {
      ":id": {
        $put: vi.fn(),
        items: {
          $post: (...args: unknown[]) => accessGroupItemPostMock(...args),
        },
      },
      $post: vi.fn(),
      items: {
        ":itemId": {
          $delete: vi.fn(),
        },
      },
    },
  },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  unwrapResponse: (response: unknown) => response,
}));

vi.mock("../lib/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockScopeOptions = {
  teams: ["Tim Alpha", "Tim Beta"],
  services: [
    { value: "call", label: "Call/Voice" },
    { value: "chat", label: "Chat/WhatsApp" },
  ],
  agentsByTeam: {
    "Tim Alpha": [
      {
        id: "agent-1",
        name: "Agent Alpha 1",
        team: "Tim Alpha",
        batch_name: "Batch A",
      },
      {
        id: "agent-2",
        name: "Agent Alpha 2",
        team: "Tim Alpha",
        batch_name: "Batch B",
      },
    ],
    "Tim Beta": [
      {
        id: "agent-3",
        name: "Agent Beta 1",
        team: "Tim Beta",
        batch_name: "Batch C",
      },
    ],
  },
};

const mockGroups = [
  {
    id: "g1",
    name: "Grup Test",
    description: "Deskripsi test",
    is_active: true,
    created_at: "2026-01-01",
  },
];

function findSelectContainingOption(
  container: HTMLElement,
  optionText: string,
): HTMLSelectElement {
  const selects = container.querySelectorAll("select");
  for (const sel of selects) {
    for (const opt of sel.options) {
      if (opt.textContent === optionText) {
        return sel as HTMLSelectElement;
      }
    }
  }
  throw new Error(`No select found with option "${optionText}"`);
}

describe("access-groups-parity", { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessGroupItemPostMock.mockResolvedValue({ success: true, data: null });
    useApiMock.mockImplementation((url: string | null) => {
      if (url === "/admin/access-groups")
        return { data: mockGroups, loading: false, refetch: vi.fn() };
      if (url === "/admin/access-scope-options")
        return { data: mockScopeOptions, loading: false, refetch: vi.fn() };
      if (url === "/admin/access-groups/g1/items")
        return { data: [], loading: false, refetch: vi.fn() };
      return { data: null, loading: false, refetch: vi.fn() };
    });
  });

  describe("ruleValueOptions contract", () => {
    it("disables agent dropdown and shows placeholder when no team selected", async () => {
      const { default: AccessGroupsPage } =
        await import("../routes/dashboard/access-groups");
      const { render } = await import("@testing-library/react");
      const userEvent = await import("@testing-library/user-event");

      const { container } = render(<AccessGroupsPage />);

      const tipeSelect = findSelectContainingOption(container, "Team");
      await userEvent.default.selectOptions(tipeSelect, "peserta_id");

      const selects = container.querySelectorAll("select");
      let agentSelect: HTMLSelectElement | null = null;
      for (const sel of selects) {
        if (
          sel.options.length === 1 &&
          sel.options[0].textContent?.includes("Pilih Team terlebih dahulu")
        ) {
          agentSelect = sel as HTMLSelectElement;
          break;
        }
      }
      expect(agentSelect).not.toBeNull();
      if (agentSelect) {
        expect(agentSelect.disabled).toBe(true);
      }
    }, 30000);

    it("enables agent dropdown after team is selected and shows correct agents", async () => {
      const { default: AccessGroupsPage } =
        await import("../routes/dashboard/access-groups");
      const { render } = await import("@testing-library/react");
      const userEvent = await import("@testing-library/user-event");

      const { container } = render(<AccessGroupsPage />);

      const tipeSelect = findSelectContainingOption(container, "Team");
      await userEvent.default.selectOptions(tipeSelect, "peserta_id");

      const selectsAfterMode = container.querySelectorAll("select");
      let teamFilterSelect: HTMLSelectElement | null = null;
      for (const sel of selectsAfterMode) {
        const opts = Array.from(sel.options);
        if (
          opts.length > 1 &&
          opts.some((o) =>
            o.textContent?.includes("Pilih Team terlebih dahulu"),
          )
        ) {
          teamFilterSelect = sel as HTMLSelectElement;
          break;
        }
      }
      expect(teamFilterSelect).not.toBeNull();
      if (teamFilterSelect) {
        await userEvent.default.selectOptions(teamFilterSelect, "Tim Alpha");
      }

      const selectsAfterTeam = container.querySelectorAll("select");
      let agentValueSelect: HTMLSelectElement | null = null;
      for (const sel of selectsAfterTeam) {
        const opts = Array.from(sel.options);
        if (opts.some((o) => o.textContent?.includes("Pilih Name"))) {
          agentValueSelect = sel as HTMLSelectElement;
          break;
        }
      }
      expect(agentValueSelect).not.toBeNull();
      if (agentValueSelect) {
        expect(agentValueSelect.disabled).toBe(false);
        const agentValues = Array.from(agentValueSelect.options)
          .filter((o) => o.value)
          .map((o) => o.value);
        expect(agentValues).toContain("agent-1");
        expect(agentValues).toContain("agent-2");
        expect(agentValues).not.toContain("agent-3");
      }
    }, 30000);

    it("shows subfolder options under the Team rule type", async () => {
      const { default: AccessGroupsPage } =
        await import("../routes/dashboard/access-groups");
      const { render } = await import("@testing-library/react");

      const { container } = render(<AccessGroupsPage />);

      const tipeSelect = findSelectContainingOption(container, "Team");
      expect(tipeSelect.value).toBe("tim");

      const teamSelect = Array.from(container.querySelectorAll("select")).find(
        (sel) =>
          Array.from(sel.options).some((option) =>
            option.textContent?.includes("Batch B"),
          ),
      ) as HTMLSelectElement | undefined;
      expect(teamSelect).toBeDefined();
      if (!teamSelect) return;

      const optionTexts = Array.from(teamSelect.options).map((option) =>
        option.textContent?.trim(),
      );
      expect(optionTexts).toContain("Tim Alpha — Semua subfolder");
      expect(optionTexts).toContain("Batch A");
      expect(optionTexts).toContain("Batch B");
      expect(optionTexts).toContain("Batch C");
    }, 30000);

    it("saves a Team subfolder option as a batch_name rule", async () => {
      const { default: AccessGroupsPage } =
        await import("../routes/dashboard/access-groups");
      const { render } = await import("@testing-library/react");
      const userEvent = await import("@testing-library/user-event");

      const { container } = render(<AccessGroupsPage />);
      const teamSelect = Array.from(container.querySelectorAll("select")).find(
        (sel) =>
          Array.from(sel.options).some((option) =>
            option.textContent?.includes("Batch B"),
          ),
      ) as HTMLSelectElement | undefined;
      expect(teamSelect).toBeDefined();
      if (!teamSelect) return;

      const batchOption = Array.from(teamSelect.options).find((option) =>
        option.textContent?.includes("Batch B"),
      );
      expect(batchOption).toBeDefined();
      if (!batchOption) return;

      await userEvent.default.selectOptions(teamSelect, batchOption.value);
      const addButton = container.querySelector<HTMLButtonElement>(
        "form button[type='submit']",
      );
      expect(addButton).not.toBeNull();
      if (!addButton) return;
      expect(addButton.disabled).toBe(false);
      await userEvent.default.click(addButton);

      expect(accessGroupItemPostMock).toHaveBeenCalledWith({
        param: { id: "g1" },
        json: { fieldName: "batch_name", fieldValue: "Batch B" },
      });
    }, 30000);

    it("shows cross-team agents not available via ruleValueOptions", async () => {
      const { default: AccessGroupsPage } =
        await import("../routes/dashboard/access-groups");
      const { render } = await import("@testing-library/react");
      const userEvent = await import("@testing-library/user-event");

      const { container } = render(<AccessGroupsPage />);

      const tipeSelect = findSelectContainingOption(container, "Team");
      await userEvent.default.selectOptions(tipeSelect, "peserta_id");

      const selects = container.querySelectorAll("select");
      let teamFilterSelect: HTMLSelectElement | null = null;
      for (const sel of selects) {
        const opts = Array.from(sel.options);
        if (
          opts.length > 1 &&
          opts.some((o) =>
            o.textContent?.includes("Pilih Team terlebih dahulu"),
          )
        ) {
          teamFilterSelect = sel as HTMLSelectElement;
          break;
        }
      }
      if (teamFilterSelect) {
        await userEvent.default.selectOptions(teamFilterSelect, "Tim Beta");
      }

      const selectsAfter = container.querySelectorAll("select");
      let agentValueSelect: HTMLSelectElement | null = null;
      for (const sel of selectsAfter) {
        const opts = Array.from(sel.options);
        if (opts.some((o) => o.textContent?.includes("Pilih Name"))) {
          agentValueSelect = sel as HTMLSelectElement;
          break;
        }
      }
      if (agentValueSelect) {
        const agentValues = Array.from(agentValueSelect.options)
          .filter((o) => o.value)
          .map((o) => o.value);
        expect(agentValues).toContain("agent-3");
        expect(agentValues).not.toContain("agent-1");
        expect(agentValues).not.toContain("agent-2");
      }
    });
  });
});
