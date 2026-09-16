import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PdktSimulation from "../routes/pdkt/simulation";
import type {
  PdktMailboxItem,
  PdktScenario,
  PdktSessionConfig,
} from "@trainers/types";

const useApiMock = vi.hoisted(() => vi.fn());
const historyGetMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  pdktClient: {
    settings: { $get: vi.fn().mockResolvedValue(null) },
    history: { $get: historyGetMock },
    mailbox: { $post: vi.fn() },
  },
  unwrapResponse: (value: unknown) => value,
  ApiError: class ApiError extends Error {},
}));

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

const scenario: PdktScenario = {
  id: "s1",
  category: "Transaksi",
  title: "Keluhan transaksi",
  description: "Konsumen melaporkan transaksi yang gagal.",
  isActive: true,
};

const sessionConfig: PdktSessionConfig = {
  scenarios: [scenario],
  consumerType: { id: "marah", name: "Marah", description: "Marah." },
  identity: {
    name: "Konsumen",
    email: "konsumen@test.com",
    city: "Jakarta",
    bodyName: "Konsumen",
  },
  enableImageGeneration: false,
  selectedModel: "gemini-3.8-flash",
  resolvedConsumerNameMentionPattern: "none",
  writingStyleMode: "training",
};

function buildMailboxItem(id: string, subject: string): PdktMailboxItem {
  const timestamp = new Date().toISOString();

  return {
    id,
    user_id: "user-1",
    status: "open",
    created_at: timestamp,
    last_activity_at: timestamp,
    sender_name: `Sender ${id}`,
    sender_email: `${id}@test.com`,
    subject,
    snippet: "Inbound body text",
    scenario_snapshot: scenario,
    config_snapshot: sessionConfig,
    inbound_email: {
      id: `msg-${id}`,
      from: `${id}@test.com`,
      to: "ojk@kontak157.go.id",
      subject,
      body: "Inbound body text",
      timestamp,
      isAgent: false,
    },
    emails_thread: [],
    permissions: { can_delete: true },
  };
}

describe("PDKT simulation session layout contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    historyGetMock.mockResolvedValue([]);
    useApiMock.mockImplementation((path: string) => ({
      data:
        path === "/pdkt/mailbox" ? [buildMailboxItem("m1", "Subject One")] : [],
      loading: false,
      refetch: vi.fn(),
    }));
  });

  it("keeps the mailbox sidebar beside the detail pane inside the session shell", async () => {
    render(<PdktSimulation onBack={() => {}} />);

    const sidebar = await screen.findByRole("complementary", {
      name: "Mailbox",
    });
    const shell = sidebar.closest('[data-slot="card"]') as HTMLElement | null;

    expect(shell).not.toBeNull();
    expect(
      shell?.className.split(/\s+/),
      "shell simulasi harus flex-row agar sidebar dan detail bersebelahan",
    ).toContain("flex-row");
  });

  it("keeps the mailbox sidebar a full-height scroll column", async () => {
    render(<PdktSimulation onBack={() => {}} />);

    const sidebar = await screen.findByRole("complementary", {
      name: "Mailbox",
    });
    const classes = sidebar.className.split(/\s+/);

    for (const required of ["flex", "flex-col", "h-full"]) {
      expect(classes, `sidebar mailbox harus memiliki ${required}`).toContain(
        required,
      );
    }

    const scrollArea = Array.from(sidebar.children).find((child) =>
      child.className.includes("overflow-y-auto"),
    );
    expect(
      scrollArea,
      "daftar email harus berada di area scroll yang dibatasi sidebar",
    ).toBeTruthy();
    expect(scrollArea?.className).toContain("flex-1");
  });
});
