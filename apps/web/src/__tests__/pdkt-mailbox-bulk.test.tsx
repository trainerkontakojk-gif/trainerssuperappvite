import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";
import PdktSimulation from "../routes/pdkt/simulation";

const useApiMock = vi.hoisted(() => vi.fn());

const mockNotify = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

const mockPdktPost = vi.hoisted(() => vi.fn());

vi.mock("../lib/toast", () => ({
  notify: mockNotify,
}));

vi.mock("../../lib/api", () => ({
  pdktClient: {
    settings: { $get: vi.fn().mockResolvedValue(null) },
    history: { $get: vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) },
    mailbox: {
      "batch-delete": { $post: (...args: unknown[]) => mockPdktPost(...args) },
    },
  },
  unwrapResponse: (x: any) => x,
}));

describe("PDKT Mailbox Bulk Delete UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockMailboxItems = [
      {
        id: "m1",
        status: "open",
        sender_name: "Sender One",
        sender_email: "sender1@test.com",
        subject: "Subject One",
        created_at: new Date().toISOString(),
        inbound_email: { body: "Inbound body text" },
        emails_thread: [{ body: "Inbound body text", isAgent: false }],
        permissions: { can_delete: true },
      },
      {
        id: "m2",
        status: "open",
        sender_name: "Sender Two",
        sender_email: "sender2@test.com",
        subject: "Subject Two",
        created_at: new Date().toISOString(),
        inbound_email: { body: "Inbound body text 2" },
        emails_thread: [{ body: "Inbound body text 2", isAgent: false }],
        permissions: { can_delete: true },
      },
    ];

    useApiMock.mockReturnValue({
      data: mockMailboxItems,
      loading: false,
      refetch: vi.fn(),
    });
  });

  it("toggles bulk selection mode and shows checkboxes", async () => {
    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);

    // Click "Pilih Banyak" button
    const pilihBanyakBtn = await screen.findByTitle("Pilih Banyak");
    expect(pilihBanyakBtn).toBeDefined();
    fireEvent.click(pilihBanyakBtn);

    // Verify checkboxes are rendered
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);

    // Verify Cancel button is rendered
    expect(screen.getByText("Batal")).toBeDefined();

    // Click cancel and verify checkboxes disappear
    fireEvent.click(screen.getByText("Batal"));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("selects items and triggers bulk delete", async () => {
    mockPdktPost.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      errors: [],
    });
    window.confirm = vi.fn().mockReturnValue(true);

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);

    // Toggle bulk mode
    fireEvent.click(await screen.findByTitle("Pilih Banyak"));

    const checkboxes = screen.getAllByRole("checkbox");

    // Select both checkboxes
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Trash/delete icon should appear in header
    const bulkDeleteBtn = screen.getByTitle("Hapus 2 email terpilih");
    expect(bulkDeleteBtn).toBeDefined();

    // Click delete
    fireEvent.click(bulkDeleteBtn);

    expect(window.confirm).toHaveBeenCalledWith("Hapus 2 email terpilih?");
    await waitFor(() => {
      expect(mockNotify.success).toHaveBeenCalledWith("2 email berhasil dihapus.");
    });
  });

  it("shows partial result warning when some selected emails fail to delete", async () => {
    mockPdktPost.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      errors: ["Email dengan ID m2 tidak diizinkan untuk dihapus oleh Anda."],
    });
    window.confirm = vi.fn().mockReturnValue(true);

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByTitle("Pilih Banyak"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByTitle("Hapus 2 email terpilih"));

    await waitFor(() => {
      expect(mockNotify.warning).toHaveBeenCalledWith(
        "1 email berhasil dihapus, 1 gagal.",
        "Email dengan ID m2 tidak diizinkan untuk dihapus oleh Anda.",
      );
    });
  });
});
