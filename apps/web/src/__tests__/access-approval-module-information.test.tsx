import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  getAccessModulePresentation,
  AccessModuleBadge,
} from "../routes/dashboard/components/AccessModuleBadge";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
  postApi: vi.fn(),
  putApi: vi.fn(),
}));

vi.mock("../lib/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const pendingRequests = [
  {
    id: "pending-sidak",
    leader_user_id: "leader-sidak",
    leader_name: "Leader SIDAK",
    leader_email: "sidak@example.com",
    module: "sidak",
    created_at: "2026-06-08T08:00:00.000Z",
    status: "pending",
  },
  {
    id: "pending-all",
    leader_user_id: "leader-all",
    leader_name: "Leader Semua",
    leader_email: "all@example.com",
    module: "all",
    created_at: "2026-06-08T09:00:00.000Z",
    status: "pending",
  },
  {
    id: "pending-unknown",
    leader_user_id: "leader-unknown",
    leader_name: "Leader Unknown",
    leader_email: "unknown@example.com",
    module: "",
    created_at: "2026-06-08T10:00:00.000Z",
    status: "pending",
  },
];

const approvedRequests = [
  {
    id: "approved-ktp",
    leader_user_id: "leader-ktp",
    leader_name: "Leader KTP",
    leader_email: "ktp@example.com",
    module: "ktp",
    access_group_ids: ["group-1"],
    access_group_names: ["Tim Call Anis"],
    approved_at: "2026-06-08T10:00:00.000Z",
  },
];

const mockGroups = [
  { id: "group-1", name: "Tim Call Anis", description: null, is_active: true },
];

describe("getAccessModulePresentation", () => {
  it('maps "ktp" to label "KTP"', () => {
    expect(getAccessModulePresentation("ktp").label).toBe("KTP");
  });

  it('maps "SIDAK" (uppercase) to label "SIDAK"', () => {
    expect(getAccessModulePresentation("SIDAK").label).toBe("SIDAK");
  });

  it('maps " all " (with whitespace) to label "KTP + SIDAK"', () => {
    expect(getAccessModulePresentation(" all ").label).toBe("KTP + SIDAK");
  });

  it("maps undefined to label 'Modul tidak diketahui'", () => {
    expect(getAccessModulePresentation(undefined).label).toBe(
      "Modul tidak diketahui",
    );
  });

  it("maps null to label 'Modul tidak diketahui'", () => {
    expect(getAccessModulePresentation(null).label).toBe(
      "Modul tidak diketahui",
    );
  });

  it("maps unknown value to label 'Modul tidak diketahui'", () => {
    expect(getAccessModulePresentation("future-module").label).toBe(
      "Modul tidak diketahui",
    );
  });
});

describe("AccessModuleBadge", () => {
  it('renders "SIDAK" label with accessible aria-label', () => {
    render(<AccessModuleBadge module="sidak" />);
    const badge = screen.getByLabelText("Modul akses: SIDAK");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("SIDAK");
  });

  it('renders "KTP + SIDAK" label for "all"', () => {
    render(<AccessModuleBadge module="all" />);
    expect(
      screen.getByLabelText("Modul akses: KTP + SIDAK"),
    ).toBeInTheDocument();
  });

  it("renders fallback for null module", () => {
    render(<AccessModuleBadge module={null} />);
    expect(
      screen.getByLabelText("Modul akses: Modul tidak diketahui"),
    ).toBeInTheDocument();
  });

  it("is a span element (non-interactive)", () => {
    render(<AccessModuleBadge module="ktp" />);
    const badge = screen.getByLabelText("Modul akses: KTP");
    expect(badge.tagName).toBe("SPAN");
  });
});

describe("AccessApprovalPage - module labels on pending tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApiMock.mockImplementation((url: string | null) => {
      if (url === "/admin/leader-requests/pending")
        return { data: pendingRequests, loading: false, refetch: vi.fn() };
      if (url === "/admin/leader-requests/approved")
        return { data: approvedRequests, loading: false, refetch: vi.fn() };
      if (url === "/admin/access-groups")
        return { data: mockGroups, loading: false, refetch: vi.fn() };
      return { data: null, loading: false, refetch: vi.fn() };
    });
  });

  it("shows the requested module on every pending request card", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    expect(screen.getByLabelText("Modul akses: SIDAK")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Modul akses: KTP + SIDAK"),
    ).toBeInTheDocument();
  });

  it("shows fallback badge for requests with empty module", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    expect(
      screen.getByLabelText("Modul akses: Modul tidak diketahui"),
    ).toBeInTheDocument();
  });

  it("shows the module separately from access groups on approved tab", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Telah Disetujui" }));

    expect(screen.getByLabelText("Modul akses: KTP")).toBeInTheDocument();
    expect(screen.getByText("Tim Call Anis")).toBeInTheDocument();
  });

  it('filters requests by the human-readable module label "SIDAK"', async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Cari nama, email, atau modul..."),
      "SIDAK",
    );

    expect(screen.getByText("Leader SIDAK")).toBeInTheDocument();
    expect(screen.queryByText("Leader Unknown")).not.toBeInTheDocument();
  });

  it('finds "all" module requests when searching "semua modul"', async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Cari nama, email, atau modul..."),
      "semua modul",
    );

    expect(screen.getByText("Leader Semua")).toBeInTheDocument();
  });

  it("renders badge as span nested inside a button", async () => {
    const { default: AccessApprovalPage } =
      await import("../routes/dashboard/access-approval");
    render(<AccessApprovalPage />);

    const badge = screen.getByLabelText("Modul akses: SIDAK");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.closest("button")).not.toBeNull();
  });
});
