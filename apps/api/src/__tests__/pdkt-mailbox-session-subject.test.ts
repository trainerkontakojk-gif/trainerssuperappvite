import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateMailboxItem, mockInitSession, mockResolveConfig } =
  vi.hoisted(() => ({
    mockCreateMailboxItem: vi.fn(),
    mockInitSession: vi.fn(),
    mockResolveConfig: vi.fn(),
  }));

vi.mock("../services/pdkt/mailbox-service", () => ({
  createMailboxItem: mockCreateMailboxItem,
  fetchMailboxItems: vi.fn(),
  canDeletePdktMailboxItem: vi.fn(),
  softDeleteMailboxItem: vi.fn(),
  submitMailboxReply: vi.fn(),
  bulkSoftDeleteMailboxItems: vi.fn(),
}));

vi.mock("../services/pdkt-service", () => ({
  resolvePdktGenerationConfig: mockResolveConfig,
  initializeEmailSession: mockInitSession,
  getScenarios: vi.fn(),
  getConsumerTypes: vi.fn(),
  generateRandomIdentity: vi.fn(),
  generateScenarioEmailTemplate: vi.fn(),
}));

import { createMailboxSession } from "../services/pdkt/mailbox-session";
import { verifyPdktMailboxRetryToken } from "../services/pdkt/mailbox-retry";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";
const PARTICIPANT_SNAPSHOT = {
  type: "participant" as const,
  participantId: VALID_UUID,
  displayName: "Andi",
  batchName: "Batch 12",
  team: "Tim Alpha",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveConfig.mockReturnValue({
    scenario: { id: "pinjol" },
    config: { identity: { name: "Budi", email: "budi@mail.com" } },
  });
  mockInitSession.mockResolvedValue({
    success: true,
    message: {
      subject: "S",
      body: "B",
      to: "x",
      from: "y",
      id: "m1",
      timestamp: "t",
      isAgent: false,
    },
  });
  mockCreateMailboxItem.mockResolvedValue("mailbox-id");
});

describe("mailbox-session subject forwarding", () => {
  it("forwards participant selection to authoritative write", async () => {
    await createMailboxSession(
      {} as any,
      {
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
        simulationSubject: { type: "participant", participantId: VALID_UUID },
      } as any,
      "user-1",
    );
    expect(mockCreateMailboxItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        simulationSubject: { type: "participant", participantId: VALID_UUID },
      }),
      "user-1",
    );
    // AI generation must not receive peserta identity
    expect(mockInitSession).toHaveBeenCalled();
    const initConfig = mockInitSession.mock.calls[0][0];
    expect(JSON.stringify(initConfig)).not.toContain(VALID_UUID);
    expect(JSON.stringify(initConfig)).not.toContain("simulationSubject");
  });

  it("keeps the resolved subject snapshot with the mailbox write", async () => {
    await createMailboxSession(
      {} as any,
      {
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
        simulationSubject: { type: "participant", participantId: VALID_UUID },
        simulationSubjectSnapshot: PARTICIPANT_SNAPSHOT,
      } as any,
      "user-1",
    );

    expect(mockCreateMailboxItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        simulationSubject: { type: "participant", participantId: VALID_UUID },
        simulationSubjectSnapshot: PARTICIPANT_SNAPSHOT,
      }),
      "user-1",
    );
  });

  it("returns the generated inbound email in a signed retry draft when persistence fails", async () => {
    const persistenceError = Object.assign(new Error("database unavailable"), {
      status: 503,
    });
    mockCreateMailboxItem.mockRejectedValueOnce(persistenceError);

    const result = await createMailboxSession(
      {} as any,
      {
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
        simulationSubject: { type: "participant", participantId: VALID_UUID },
        simulationSubjectSnapshot: PARTICIPANT_SNAPSHOT,
      } as any,
      "user-1",
    );

    expect(result.success).toBe(false);
    expect(result.message).toEqual(
      expect.objectContaining({ subject: "S", body: "B" }),
    );
    expect(result.retryDraft?.token).toEqual(expect.any(String));
    expect(result.retryDraft?.batch.inbound_email).toEqual(result.message);

    const verified = verifyPdktMailboxRetryToken(
      result.retryDraft?.token || "",
      "user-1",
    );
    expect(verified.batch.inbound_email).toEqual(result.message);
    expect(verified.simulationSubjectSnapshot).toEqual(PARTICIPANT_SNAPSHOT);
  });

  it("defaults to self when omitted (old request/new backend)", async () => {
    await createMailboxSession(
      {} as any,
      {
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
      } as any,
      "user-1",
    );
    const [, payload] = mockCreateMailboxItem.mock.calls[0] as any[];
    const subj = (payload as any).simulationSubject ?? { type: "self" };
    expect(subj.type).toBe("self");
  });
});
