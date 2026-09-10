import { describe, expect, it } from "vitest";
import {
  mapSimulationSubjectRowToSnapshot,
  normalizeSimulationSubjectSelection,
  simulationSubjectSelectionSchema,
  simulationSubjectSnapshotSchema,
} from "@trainers/types";
import { resolveSimulationSubjectSnapshot } from "../services/simulation-subject-service";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("simulation-subject contract and mapper", () => {
  it("accepts self selection", () => {
    expect(
      simulationSubjectSelectionSchema.safeParse({ type: "self" }).success,
    ).toBe(true);
  });

  it("accepts participant selection with valid UUID", () => {
    const parsed = simulationSubjectSelectionSchema.safeParse({
      type: "participant",
      participantId: VALID_UUID,
    });
    expect(parsed.success).toBe(true);
  });

  it("normalizes omitted legacy request to self on write ingress", () => {
    expect(normalizeSimulationSubjectSelection(undefined)).toEqual({
      type: "self",
    });
  });

  it("rejects explicit null", () => {
    expect(simulationSubjectSelectionSchema.safeParse(null).success).toBe(
      false,
    );
  });

  it("rejects unknown type", () => {
    expect(
      simulationSubjectSelectionSchema.safeParse({ type: "unknown" }).success,
    ).toBe(false);
  });

  it("rejects invalid UUID", () => {
    expect(
      simulationSubjectSelectionSchema.safeParse({
        type: "participant",
        participantId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects self with participant id", () => {
    expect(
      simulationSubjectSelectionSchema.safeParse({
        type: "self",
        participantId: VALID_UUID,
      }).success,
    ).toBe(false);
  });

  it("rejects injected snapshot fields from browser", () => {
    expect(
      simulationSubjectSelectionSchema.safeParse({
        type: "self",
        displayName: "Andi",
      }).success,
    ).toBe(false);
    expect(
      simulationSubjectSelectionSchema.safeParse({
        type: "participant",
        participantId: VALID_UUID,
        displayName: "Andi",
      }).success,
    ).toBe(false);
  });

  it("maps legacy null/absent row to unknown without guessing self", () => {
    expect(
      mapSimulationSubjectRowToSnapshot({
        simulation_subject_type: null,
        simulation_subject_peserta_id: null,
        simulation_subject_name: null,
        simulation_subject_batch_name: null,
        simulation_subject_team: null,
      }),
    ).toEqual({
      type: "unknown",
      participantId: null,
      displayName: null,
      batchName: null,
      team: null,
    });
  });

  it("maps self mailbox row with null snapshot to self without fake name", () => {
    const snapshot = mapSimulationSubjectRowToSnapshot({
      simulation_subject_type: "self",
      simulation_subject_peserta_id: null,
      simulation_subject_name: null,
      simulation_subject_batch_name: null,
      simulation_subject_team: null,
    });
    expect(snapshot.type).toBe("self");
    expect(snapshot.participantId).toBeNull();
    expect(simulationSubjectSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    );
  });

  it("maps malformed participant metadata to unknown instead of claiming a target", () => {
    expect(
      mapSimulationSubjectRowToSnapshot({
        simulation_subject_type: "participant",
        simulation_subject_peserta_id: null,
        simulation_subject_name: "  ",
        simulation_subject_batch_name: "Batch 12",
        simulation_subject_team: "Tim Alpha",
      }),
    ).toEqual({
      type: "unknown",
      participantId: null,
      displayName: null,
      batchName: null,
      team: null,
    });
  });

  it("maps participant row preserving snapshot including null FK after delete", () => {
    const snapshot = mapSimulationSubjectRowToSnapshot({
      simulation_subject_type: "participant",
      simulation_subject_peserta_id: null,
      simulation_subject_name: "Andi",
      simulation_subject_batch_name: "Batch 12",
      simulation_subject_team: "Tim Alpha",
    });
    expect(snapshot).toEqual({
      type: "participant",
      participantId: null,
      displayName: "Andi",
      batchName: "Batch 12",
      team: "Tim Alpha",
    });
  });

  it("does not look up latest participant name on read", () => {
    const snapshot = mapSimulationSubjectRowToSnapshot({
      simulation_subject_type: "participant",
      simulation_subject_peserta_id: VALID_UUID,
      simulation_subject_name: "Old Name",
      simulation_subject_batch_name: "Batch 1",
      simulation_subject_team: "Tim A",
    });
    expect(snapshot.displayName).toBe("Old Name");
    expect(snapshot.batchName).toBe("Batch 1");
  });
});

describe("simulation-subject resolver/auth", () => {
  it("resolves self from actor profile without peserta lookup", async () => {
    const snapshot = await resolveSimulationSubjectSnapshot(
      { id: "user-1", role: "agent", full_name: "Trainer A" },
      { type: "self" },
    );
    expect(snapshot).toEqual({
      type: "self",
      participantId: null,
      displayName: "Trainer A",
      batchName: null,
      team: null,
    });
  });

  it("falls back to safe label when profile name blank", async () => {
    const snapshot = await resolveSimulationSubjectSnapshot(
      { id: "user-1", role: "trainer", full_name: "  " },
      { type: "self" },
    );
    expect(snapshot.displayName).toBe("Diri sendiri");
  });

  it("allows admin/trainer participant with minimal lookup", async () => {
    const snapshot = await resolveSimulationSubjectSnapshot(
      { id: "admin-1", role: "admin" },
      { type: "participant", participantId: VALID_UUID },
      {
        getPesertaById: async () => ({
          id: VALID_UUID,
          nama: "Andi",
          batch_name: "Batch 12",
          tim: "Tim Alpha",
        }),
      },
    );
    expect(snapshot).toEqual({
      type: "participant",
      participantId: VALID_UUID,
      displayName: "Andi",
      batchName: "Batch 12",
      team: "Tim Alpha",
    });
  });

  it("denies participant for non-manager role", async () => {
    await expect(
      resolveSimulationSubjectSnapshot(
        { id: "agent-1", role: "agent" },
        { type: "participant", participantId: VALID_UUID },
        { getPesertaById: async () => ({ id: VALID_UUID, nama: "Andi" }) },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns 401 without valid auth", async () => {
    await expect(
      resolveSimulationSubjectSnapshot(null, { type: "self" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns 404 when peserta missing without leaking data", async () => {
    await expect(
      resolveSimulationSubjectSnapshot(
        { id: "admin-1", role: "trainer" },
        { type: "participant", participantId: VALID_UUID },
        { getPesertaById: async () => null },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("maps DB failure to human-friendly 500, not 404 or raw SQL", async () => {
    await expect(
      resolveSimulationSubjectSnapshot(
        { id: "admin-1", role: "admin" },
        { type: "participant", participantId: VALID_UUID },
        {
          getPesertaById: async () => {
            throw new Error("relation does not exist");
          },
        },
      ),
    ).rejects.toMatchObject({ status: 500, code: "SERVER_ERROR" });
  });
});
