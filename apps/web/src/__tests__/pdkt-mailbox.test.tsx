import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";
import PdktSimulation from "../routes/pdkt/simulation";
import { EmailDetailPane } from "../routes/pdkt/components/EmailDetailPane";
import * as useApiModule from "../hooks/useApi";
import type { PdktMailboxItem } from "@trainers/types";

// Mock the API hooks
vi.mock("../hooks/useApi", () => ({
  useApi: vi.fn(),
  getApi: vi.fn(),
  postApi: vi.fn(),
  deleteApi: vi.fn(),
}));

describe("PDKT Mailbox UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    (useApiModule.useApi as any).mockReturnValue({
      data: [
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
      ],
      loading: false,
      refetch: vi.fn(),
    });

    (useApiModule.getApi as any).mockImplementation((url: string) => {
      if (url === "/pdkt/settings")
        return Promise.resolve(null);
      if (url === "/pdkt/history") return Promise.resolve([]);
      return Promise.resolve(null);
    });
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
});
