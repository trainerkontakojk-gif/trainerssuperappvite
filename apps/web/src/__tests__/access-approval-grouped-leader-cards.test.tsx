import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("../lib/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../../lib/api", () => ({
  adminClient: {
    "leader-requests": {
      ":id": {
        approve: { $post: vi.fn().mockResolvedValue({}) },
        reject: { $post: vi.fn().mockResolvedValue({}) },
        revoke: { $post: vi.fn().mockResolvedValue({}) },
        groups: { $put: vi.fn().mockResolvedValue({}) },
      },
    },
  },
  getErrorMessage: (e: any) => e?.message || "Error",
  unwrapResponse: (x: any) => x,
}));

const ktpRequest = {
  id: "request-ktp",
  leader_user_id: "leader-1",
  leader_name: "Trainers",
  leader_email: "trainer@example.com",
  module: "ktp",
  created_at: "2026-06-04T08:00:00.000Z",
  status: "pending",
};

const sidakRequest = {
  id: "request-sidak",
  leader_user_id: "leader-1",
  leader_name: "Trainers",
  leader_email: "trainer@example.com",
  module: "sidak",
  created_at: "2026-06-04T09:00:00.000Z",
  status: "pending",
};

const approvedKtp = {
  id: "approved-ktp",
  leader_user_id: "leader-approved",
  leader_name: "Leader Approved",
  leader_email: "approved@example.com",
  module: "ktp",
  access_group_ids: ["g1"],
  access_group_names: ["Tim Call Anis"],
  approved_at: "2026-06-05T00:00:00.000Z",
};

const approvedSidak = {
  id: "approved-sid",
  leader_user_id: "leader-approved",
  leader_name: "Leader Approved",
  leader_email: "approved@example.com",
  module: "sidak",
  access_group_ids: ["g2", "g3"],
  access_group_names: ["Tim Email", "Tim Call Anis"],
  approved_at: "2026-06-05T00:00:00.000Z",
};

const mockGroups = [
  { id: "g1", name: "Tim Call Anis", description: null, is_active: true },
  { id: "g2", name: "Tim Email", description: null, is_active: true },
  { id: "g3", name: "Tim Chat", description: null, is_active: true },
];

describe("AccessApprovalPage - grouped leader cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApiMock.mockImplementation((url: string | null) => {
      if (url === "/admin/leader-requests/pending")
        return {
          data: [ktpRequest, sidakRequest],
          loading: false,
          refetch: vi.fn(),
        };
      if (url === "/admin/leader-requests/approved")
        return {
          data: [approvedKtp, approvedSidak],
          loading: false,
          refetch: vi.fn(),
        };
      if (url === "/admin/access-groups")
        return { data: mockGroups, loading: false, refetch: vi.fn() };
      return { data: null, loading: false, refetch: vi.fn() };
    });
  });

  it("renders one card per leader with combined KTP + SIDAK badge", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    expect(screen.getAllByText("Trainers")).toHaveLength(1);
    expect(screen.getAllByText("trainer@example.com")).toHaveLength(1);
    expect(
      screen.getByLabelText("Modul akses: KTP + SIDAK"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 permintaan")).toBeInTheDocument();
  });

  it("shows module switcher after clicking a grouped card", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Trainers"));

    expect(
      screen.getByRole("group", { name: "Pilih request modul" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pilih request KTP" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Pilih request SIDAK" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("switches selected request when clicking module option", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Trainers"));

    await user.click(
      screen.getByRole("button", { name: "Pilih request SIDAK" }),
    );

    expect(
      screen.getByRole("button", { name: "Pilih request SIDAK" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Pilih request KTP" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("sends mutation to the active request only (SIDAK)", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Trainers"));
    await user.click(
      screen.getByRole("button", { name: "Pilih request SIDAK" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Pilih request SIDAK" }),
    );
    await user.click(screen.getByText("Tim Call Anis"));

    const approveBtn = screen.getByRole("button", {
      name: /Setujui Akses SIDAK/i,
    });
    await user.click(approveBtn);
  });

  it("sends reject mutation for the active module", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Trainers"));
    await user.click(screen.getByRole("button", { name: "Pilih request KTP" }));

    const noteInput = screen.getByPlaceholderText(
      "Tulis alasan jika menolak permintaan...",
    );
    await user.type(noteInput, "Alasan penolakan");

    const rejectBtn = screen.getByRole("button", { name: /Tolak KTP/i });
    await user.click(rejectBtn);
  });

  it("shows status badge on approved tab and module summary", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Telah Disetujui" }));

    expect(
      screen.getByLabelText("Modul akses: KTP + SIDAK"),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Leader Approved"));
    expect(
      screen.getByRole("group", { name: "Pilih request modul" }),
    ).toBeInTheDocument();
  });

  it("renders card with single request without count badge", async () => {
    useApiMock.mockImplementation((url: string | null) => {
      if (url === "/admin/leader-requests/pending")
        return { data: [ktpRequest], loading: false, refetch: vi.fn() };
      if (url === "/admin/leader-requests/approved")
        return { data: [], loading: false, refetch: vi.fn() };
      if (url === "/admin/access-groups")
        return { data: mockGroups, loading: false, refetch: vi.fn() };
      return { data: null, loading: false, refetch: vi.fn() };
    });

    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    expect(screen.getByLabelText("Modul akses: KTP")).toBeInTheDocument();
    expect(screen.queryByText("1 permintaan")).not.toBeInTheDocument();
  });

  it("shows different leader_user_id as separate cards", async () => {
    const secondLeader = {
      ...ktpRequest,
      id: "req-2",
      leader_user_id: "leader-2",
      leader_name: "Leader Dua",
    };
    useApiMock.mockImplementation((url: string | null) => {
      if (url === "/admin/leader-requests/pending")
        return {
          data: [ktpRequest, secondLeader],
          loading: false,
          refetch: vi.fn(),
        };
      if (url === "/admin/leader-requests/approved")
        return { data: [], loading: false, refetch: vi.fn() };
      if (url === "/admin/access-groups")
        return { data: mockGroups, loading: false, refetch: vi.fn() };
      return { data: null, loading: false, refetch: vi.fn() };
    });

    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    expect(screen.getByText("Trainers")).toBeInTheDocument();
    expect(screen.getByText("Leader Dua")).toBeInTheDocument();
  });
});
