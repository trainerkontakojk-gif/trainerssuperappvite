import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ActivitiesPage from "../routes/dashboard/activities";
import { useApi } from "../hooks/useApi";
import { adminClient } from "../lib/api";

// Mock the hooks and clients
vi.mock("../hooks/useApi");
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    adminClient: {
      "activity-logs": {
        ":id": {
          $delete: vi.fn(),
        },
      },
    },
  };
});

const mockLogs = [
  {
    id: "1",
    user_id: "u1",
    user_name: "Admin User",
    action: "CREATE_USER",
    type: "USER_MUTATION",
    module: "ADMIN",
    created_at: new Date().toISOString(),
    details: {},
  },
  {
    id: "2",
    user_id: "u2",
    user_name: "Trainer User",
    action: "APPROVE_LEADER",
    type: "APPROVAL",
    module: "ACCESS",
    created_at: new Date().toISOString(),
    details: {},
  },
];

describe("ActivitiesPage Smoke Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useApi as any).mockReturnValue({
      data: mockLogs,
      loading: false,
      refetch: vi.fn(),
    });
  });

  it("renders page header and title", () => {
    render(<ActivitiesPage />);
    expect(screen.getByText("Log Aktivitas")).toBeInTheDocument();
    expect(screen.getByText("Audit Trail")).toBeInTheDocument();
  });

  it("renders the logs table with data", () => {
    render(<ActivitiesPage />);
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("CREATE_USER")).toBeInTheDocument();
    expect(screen.getByText("Trainer User")).toBeInTheDocument();
    expect(screen.getByText("APPROVE_LEADER")).toBeInTheDocument();
  });

  it("filters logs based on search term", async () => {
    render(<ActivitiesPage />);
    const searchInput = screen.getByPlaceholderText(/Cari aktor/i);
    
    fireEvent.change(searchInput, { target: { value: "Trainer" } });
    
    expect(screen.getByText("Trainer User")).toBeInTheDocument();
    expect(screen.queryByText("Admin User")).not.toBeInTheDocument();
  });

  it("shows empty state when no logs match", async () => {
    render(<ActivitiesPage />);
    const searchInput = screen.getByPlaceholderText(/Cari aktor/i);
    
    fireEvent.change(searchInput, { target: { value: "NonExistent" } });
    
    expect(screen.getByText("Belum ada aktivitas")).toBeInTheDocument();
  });
});
