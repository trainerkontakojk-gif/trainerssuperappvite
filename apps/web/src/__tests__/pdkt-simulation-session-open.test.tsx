import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PdktSimulation from "../routes/pdkt/simulation";
import type {
  PdktMailboxItem,
  PdktScenario,
  PdktConsumerType,
  PdktSessionConfig,
  PdktSessionHistory,
} from "@trainers/types";

const useApiMock = vi.hoisted(() => vi.fn());
const settingsGetMock = vi.hoisted(() => vi.fn());
const historyGetMock = vi.hoisted(() => vi.fn());
const mailboxDetailGetMock = vi.hoisted(() => vi.fn());
const settingsPostMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  pdktClient: {
    settings: { $get: settingsGetMock, $post: settingsPostMock },
    history: { $get: historyGetMock },
    mailbox: {
      $post: vi.fn(),
      $get: vi.fn(),
      [":id"]: { $get: mailboxDetailGetMock },
    },
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

const consumerTypes: PdktConsumerType[] = [
  { id: "marah", name: "Marah", description: "Marah." },
];

const ATTACHMENT = "data:image/png;base64,AAAA";

function buildListRow(id: string, withAttachment: boolean): PdktMailboxItem {
  const timestamp = new Date().toISOString();

  return {
    id,
    user_id: "user-1",
    status: "open",
    created_at: timestamp,
    last_activity_at: timestamp,
    sender_name: "Sender One",
    sender_email: "sender1@test.com",
    subject: "Subject One",
    snippet: "Inbound body text",
    scenario_snapshot: scenario,
    config_snapshot: sessionConfig,
    inbound_email: {
      id: `msg-${id}`,
      from: "sender1@test.com",
      to: "ojk@kontak157.go.id",
      subject: "Subject One",
      body: "Inbound body text",
      timestamp,
      isAgent: false,
      ...(withAttachment ? { attachments: [ATTACHMENT] } : {}),
    },
    emails_thread: [],
    permissions: { can_delete: true },
  };
}

function mockUseApi(mailbox: PdktMailboxItem[]) {
  useApiMock.mockImplementation((path: string | null) => ({
    data: path === "/pdkt/mailbox" ? mailbox : [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }));
}

describe("PDKT simulation session open", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    historyGetMock.mockResolvedValue([]);
    mailboxDetailGetMock.mockResolvedValue(null);
    settingsPostMock.mockResolvedValue({ data: null });
    mockUseApi([buildListRow("m1", false)]);
  });

  it("reuses landing data instead of refetching settings, history, and catalog", async () => {
    render(
      <PdktSimulation
        onBack={() => {}}
        initialSettings={null}
        initialHistory={[] as PdktSessionHistory[]}
        initialScenarios={[scenario]}
        initialConsumerTypes={consumerTypes}
      />,
    );

    expect((await screen.findAllByText("Subject One")).length).toBeGreaterThan(
      0,
    );

    expect(settingsGetMock).not.toHaveBeenCalled();
    expect(historyGetMock).not.toHaveBeenCalled();

    const requestedPaths = useApiMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toContain("/pdkt/mailbox");
    expect(requestedPaths).not.toContain("/pdkt/scenarios");
    expect(requestedPaths).not.toContain("/pdkt/consumer-types");
  });

  it("still loads settings and history when the landing page did not provide them", async () => {
    settingsGetMock.mockResolvedValue(null);
    historyGetMock.mockResolvedValue([]);

    render(<PdktSimulation onBack={() => {}} />);

    expect((await screen.findAllByText("Subject One")).length).toBeGreaterThan(
      0,
    );

    expect(settingsGetMock).toHaveBeenCalledTimes(1);
    expect(historyGetMock).toHaveBeenCalledTimes(1);
    const requestedPaths = useApiMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toContain("/pdkt/scenarios");
    expect(requestedPaths).toContain("/pdkt/consumer-types");
  });

  it("loads the selected mailbox detail once to reveal inline attachments", async () => {
    mailboxDetailGetMock.mockResolvedValue(buildListRow("m1", true));

    render(<PdktSimulation onBack={() => {}} />);

    expect(await screen.findByText(/Lampiran \(1\)/)).toBeDefined();
    expect(mailboxDetailGetMock).toHaveBeenCalledTimes(1);
    expect(mailboxDetailGetMock).toHaveBeenCalledWith({ param: { id: "m1" } });
  });

  it("keeps the settings version and synchronizes a newer revision to the landing page", async () => {
    const user = userEvent.setup();
    const version = "2026-09-15T00:00:00.000Z";
    const nextVersion = "2026-09-15T00:01:00.000Z";
    const onSettingsChange = vi.fn();
    settingsPostMock.mockResolvedValue({
      headers: new Headers({ "x-settings-version": nextVersion }),
    });

    render(
      <PdktSimulation
        onBack={() => {}}
        initialSettings={null}
        initialSettingsVersion={version}
        initialScenarios={[scenario]}
        initialConsumerTypes={consumerTypes}
        onSettingsChange={onSettingsChange}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Pengaturan" }));
    await user.click(
      await screen.findByRole("button", { name: /Simpan Perubahan/ }),
    );

    expect(settingsPostMock).toHaveBeenCalledTimes(1);
    expect(settingsPostMock.mock.calls[0][1]).toEqual({
      headers: { "x-settings-version": version },
    });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.any(Object),
      nextVersion,
    );
  });
});
