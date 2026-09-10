import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock("../services/pdkt/mailbox-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/pdkt/mailbox-service")>();
  return actual;
});

import { createMailboxItem } from "../services/pdkt/mailbox-service";

function clientWith(rpcImpl: any) {
  mockRpc.mockImplementation(rpcImpl);
  return { rpc: mockRpc } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mailbox-service subject error mapping", () => {
  const base: any = {
    sender_name: "Budi",
    sender_email: "budi@mail.com",
    subject: "S",
    snippet: "sn",
    scenario_snapshot: {},
    config_snapshot: {},
    inbound_email: {},
  };

  it("maps CONFLICT to 409 without overwriting", async () => {
    const client = clientWith(async () => ({
      data: null,
      error: {
        message: "CONFLICT: idempotency key digunakan untuk target berbeda",
      },
    }));
    await expect(
      createMailboxItem(client, {
        ...base,
        simulationSubject: {
          type: "participant",
          participantId: "123e4567-e89b-12d3-a456-426614174000",
        },
      } as any),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockRpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_batch_with_subject",
      expect.objectContaining({ p_subject_type: "participant" }),
    );
  });

  it("maps FORBIDDEN to 403", async () => {
    const client = clientWith(async () => ({
      data: null,
      error: {
        message: "FORBIDDEN: participant attribution requires admin/trainer",
      },
    }));
    await expect(
      createMailboxItem(client, {
        ...base,
        simulationSubject: {
          type: "participant",
          participantId: "123e4567-e89b-12d3-a456-426614174000",
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("maps a missing participant to a participant-specific 404", async () => {
    const client = clientWith(async () => ({
      data: null,
      error: { message: "NOT_FOUND: peserta tidak ditemukan" },
    }));

    await expect(
      createMailboxItem(client, {
        ...base,
        simulationSubject: {
          type: "participant",
          participantId: "123e4567-e89b-12d3-a456-426614174000",
        },
      } as any),
    ).rejects.toMatchObject({
      status: 404,
      message: "Peserta tidak ditemukan.",
    });
  });

  it("uses legacy self RPC when omitted", async () => {
    const client = clientWith(async () => ({ data: "id-1", error: null }));
    const id = await createMailboxItem(client, base as any);
    expect(id).toBe("id-1");
    expect(mockRpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_batch",
      expect.not.objectContaining({ p_subject_type: expect.anything() }),
    );
  });
});
