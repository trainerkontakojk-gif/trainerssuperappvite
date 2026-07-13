import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";
import PdktSimulation from "../routes/pdkt/simulation";
import { EmailDetailPane } from "../routes/pdkt/components/EmailDetailPane";
import type { PdktMailboxItem } from "@trainers/types";

const useApiMock = vi.hoisted(() => vi.fn());
const historyGetMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  pdktClient: {
    settings: { $get: vi.fn().mockResolvedValue(null) },
    history: { $get: historyGetMock },
  },
  unwrapResponse: (value: unknown) => value,
}));

let mailboxResponse: PdktMailboxItem[];

// Mock the API hooks
vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

describe("PDKT Mailbox UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mailboxResponse = [
      {
        id: "m1",
        status: "open",
        sender_name: "Sender One",
        sender_email: "sender1@test.com",
        subject: "Subject One",
        created_at: new Date().toISOString(),
        inbound_email: { body: "Inbound body text" },
        emails_thread: [{ body: "Inbound body text", isAgent: false }],
      },
    ];
    historyGetMock.mockResolvedValue([]);
    useApiMock.mockImplementation((path: string) => ({
      data: path === "/pdkt/mailbox" ? mailboxResponse : [],
      loading: false,
      refetch: vi.fn(),
    }));
  });

  it("renders mailbox list items", async () => {
    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Sender One")).toBeDefined();
    expect(screen.getAllByText("Subject One").length).toBeGreaterThan(0);
  });

  it("shows error state when API returns error", async () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: "Anda tidak memiliki akses ke resource ini.",
      refetch: vi.fn(),
    });

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Gagal Memuat Email")).toBeDefined();
    expect(
      screen.getByText("Anda tidak memiliki akses ke resource ini."),
    ).toBeDefined();
    expect(screen.getByText("Coba Lagi")).toBeDefined();
  });

  it("calls refetch when retry button is clicked", async () => {
    const refetchMock = vi.fn();
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: "Network error",
      refetch: refetchMock,
    });

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);

    const retryBtn = await screen.findByText("Coba Lagi");
    fireEvent.click(retryBtn);
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not show error state while loading", async () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    await act(async () => {
      render(<RouterProvider router={router} />);
    });

    expect(screen.queryByText("Gagal Memuat Email")).toBeNull();
    expect(await screen.findByText("Simulasi PDKT")).toBeDefined();
    expect(document.querySelector(".animate-pulse")).toBeDefined();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("keeps archived replay local and does not mutate or lose it after mailbox refetch", async () => {
    const serverMailbox = Object.freeze([...mailboxResponse]);
    mailboxResponse = serverMailbox as unknown as PdktMailboxItem[];
    historyGetMock.mockResolvedValue([
      {
        id: "history-1",
        timestamp: new Date().toISOString(),
        config: {
          scenarios: [{ id: "scenario-1", title: "Scenario" }],
          consumerType: { name: "Consumer" },
        },
        emails: [
          {
            id: "inbound-1",
            from: "consumer@example.com",
            to: "agent@example.com",
            subject: "Archived subject",
            body: "Archived body",
            timestamp: new Date().toISOString(),
            isAgent: false,
          },
          {
            id: "reply-1",
            from: "agent@example.com",
            to: "consumer@example.com",
            subject: "Re: Archived subject",
            body: "Archived reply",
            timestamp: new Date().toISOString(),
            isAgent: true,
          },
        ],
        evaluation: { score: 88 },
        evaluation_status: "completed",
        time_taken: 42,
      },
    ]);

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const routeTree = rootRoute.addChildren([indexRoute]);
    const router = createRouter({ routeTree });
    const { rerender } = render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Riwayat" }));
    expect(await screen.findByText("Riwayat Simulasi PDKT")).toBeDefined();
    fireEvent.click(await screen.findByText("Re: Archived subject"));

    expect(mailboxResponse).toHaveLength(1);
    expect(
      (await screen.findAllByText("Archived body")).length,
    ).toBeGreaterThan(0);

    mailboxResponse = [...mailboxResponse];
    rerender(<RouterProvider router={router} />);
    expect(
      (await screen.findAllByText("Archived body")).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Semua" }));
    fireEvent.click(screen.getAllByText("Subject One")[0]);
    expect(screen.queryByText("Archived body")).toBeNull();
  });

  it("clears archived replay when history selects a real mailbox item", async () => {
    mailboxResponse = [
      {
        ...mailboxResponse[0],
        history_id: "history-real",
      },
    ];
    historyGetMock.mockResolvedValue([
      {
        id: "history-archived",
        timestamp: new Date().toISOString(),
        config: {
          scenarios: [{ id: "scenario-1", title: "Scenario" }],
          consumerType: { name: "Consumer" },
        },
        emails: [
          {
            id: "archived-inbound",
            from: "archived@example.com",
            to: "agent@example.com",
            subject: "Archived subject",
            body: "Archived body",
            timestamp: new Date().toISOString(),
            isAgent: false,
          },
          {
            id: "archived-reply",
            from: "agent@example.com",
            to: "archived@example.com",
            subject: "Re: Archived subject",
            body: "Archived reply",
            timestamp: new Date().toISOString(),
            isAgent: true,
          },
        ],
        evaluation: { score: 88 },
        evaluation_status: "completed",
      },
      {
        id: "history-real",
        timestamp: new Date().toISOString(),
        config: {
          scenarios: [{ id: "scenario-1", title: "Scenario" }],
          consumerType: { name: "Consumer" },
        },
        emails: [
          {
            id: "real-inbound",
            from: "sender1@test.com",
            to: "agent@example.com",
            subject: "Subject One",
            body: "Inbound body text",
            timestamp: new Date().toISOString(),
            isAgent: false,
          },
          {
            id: "real-reply",
            from: "agent@example.com",
            to: "sender1@test.com",
            subject: "Re: Subject One",
            body: "Real reply",
            timestamp: new Date().toISOString(),
            isAgent: true,
          },
        ],
        evaluation: { score: 90 },
        evaluation_status: "completed",
      },
    ]);

    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: PdktSimulation,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
    });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Riwayat" }));
    fireEvent.click(await screen.findByText("Re: Archived subject"));
    expect(await screen.findAllByText("Archived body")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Riwayat" }));
    fireEvent.click(await screen.findByText("Re: Subject One"));
    fireEvent.click(screen.getByRole("button", { name: "Semua" }));

    expect(screen.queryByText("Archived subject")).toBeNull();
  });
});

describe("EmailDetailPane Component", () => {
  const mockItem: PdktMailboxItem = {
    id: "m2",
    status: "replied",
    sender_name: "Jane Doe",
    sender_email: "jane@example.com",
    subject: "Refund request",
    created_at: new Date().toISOString(),
    inbound_email: { body: "I want a refund" } as any,
    emails_thread: [
      {
        body: "I want a refund",
        isAgent: false,
        timestamp: new Date().toISOString(),
        from: "jane@example.com",
        to: "ojk@kontak157.go.id",
        id: "1",
      },
    ] as any,
    updated_at: new Date().toISOString(),
    history_id: "hist123",
  };

  it("renders the email header and body", () => {
    const handleReply = vi.fn();
    const handleDelete = vi.fn();
    const handleRetry = vi.fn();

    render(
      <EmailDetailPane
        item={mockItem}
        onReply={handleReply}
        onDelete={handleDelete}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={handleRetry}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeDefined();
    expect(screen.getByText("Refund request")).toBeDefined();
    expect(screen.getByText("I want a refund")).toBeDefined();
  });

  it("renders the actual recipient string from the inbound email payload", () => {
    render(
      <EmailDetailPane
        item={{
          ...mockItem,
          inbound_email: {
            ...(mockItem.inbound_email as any),
            to: "alpha@test.com, beta@test.com",
          },
        }}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={() => {}}
      />,
    );

    expect(screen.getByText("Kepada:")).toBeDefined();
    expect(screen.getByText("alpha@test.com, beta@test.com")).toBeDefined();
  });

  it("shows loader when evaluation is processing", () => {
    render(
      <EmailDetailPane
        item={mockItem}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus="processing"
        evaluationError={null}
        onRetryEval={() => {}}
      />,
    );

    expect(screen.getByText("Menganalisis Jawaban...")).toBeDefined();
  });

  it("shows error message and retry button when evaluation fails", () => {
    const handleRetry = vi.fn();
    render(
      <EmailDetailPane
        item={mockItem}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus="failed"
        evaluationError="Rate limit exceeded"
        onRetryEval={handleRetry}
      />,
    );

    expect(screen.getByText("Evaluasi Gagal")).toBeDefined();
    expect(screen.getByText("Rate limit exceeded")).toBeDefined();
    const retryBtn = screen.getByText("Coba Lagi");
    expect(retryBtn).toBeDefined();

    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("displays evaluation score and details when completed", () => {
    const mockEval = {
      score: 85,
      feedback: "Good reply but watch grammar.",
      typos: ["salah ketik"],
      clarityIssues: ["too long"],
      contentGaps: ["missed SLA detail"],
    };

    render(
      <EmailDetailPane
        item={mockItem}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={mockEval}
        evaluationStatus="completed"
        evaluationError={null}
        onRetryEval={() => {}}
      />,
    );

    expect(screen.getByText("85%")).toBeDefined();
    expect(screen.getByText("salah ketik")).toBeDefined();
    expect(screen.getByText("too long")).toBeDefined();
    expect(screen.getByText("missed SLA detail")).toBeDefined();
    expect(screen.getByText('"Good reply but watch grammar."')).toBeDefined();
  });

  it("renders creator info in EmailDetailPane", () => {
    const itemWithCreator = {
      ...mockItem,
      created_by_user: {
        id: "u-1",
        full_name: "Siti Aminah",
        role: "Trainer",
        is_current_user: false,
      },
    };
    render(
      <EmailDetailPane
        item={itemWithCreator}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={() => {}}
      />,
    );
    expect(screen.getByText("Dibuat oleh Siti Aminah · Trainer")).toBeDefined();
  });

  it("disables delete button in EmailDetailPane when permissions.can_delete is false", () => {
    const itemRestricted = {
      ...mockItem,
      permissions: {
        can_delete: false,
      },
    };
    render(
      <EmailDetailPane
        item={itemRestricted}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={() => {}}
      />,
    );
    const deleteBtn = screen.getByTitle(
      "Hanya pembuat email, admin, atau trainer yang bisa menghapus",
    );
    expect(deleteBtn).toBeDefined();
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders back button in EmailDetailPane and calls onBackToList when clicked", () => {
    const handleBackToList = vi.fn();
    render(
      <EmailDetailPane
        item={mockItem}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={() => {}}
        onBackToList={handleBackToList}
      />,
    );
    const backBtn = screen.getByTitle("Kembali ke Daftar Email");
    expect(backBtn).toBeDefined();
    fireEvent.click(backBtn);
    expect(handleBackToList).toHaveBeenCalledTimes(1);
  });
});
