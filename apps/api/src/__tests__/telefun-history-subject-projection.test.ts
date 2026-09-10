import { describe, expect, it } from "vitest";

// Import the projector indirectly via sessions route? Export it for test.
// For minimal RED, test that projectTelefunHistoryRow preserves subject mapping.
// We replicate expected behavior: snake row -> camel snapshot.
import { mapSimulationSubjectRowToSnapshot } from "@trainers/types";

describe("telefun history projection (contract)", () => {
  it("maps snake attribution to snapshot without lookup", () => {
    const snapshot = mapSimulationSubjectRowToSnapshot({
      simulation_subject_type: "participant",
      simulation_subject_peserta_id: "123e4567-e89b-12d3-a456-426614174000",
      simulation_subject_name: "Andi",
      simulation_subject_batch_name: "Batch 12",
      simulation_subject_team: "Tim Alpha",
    });
    expect(snapshot.type).toBe("participant");
  });

  it("requires projectTelefunHistoryRow to include simulationSubject", async () => {
    const mod = await import("../routes/telefun/sessions");
    const row: any = {
      id: "t1",
      simulation_subject_type: "participant",
      simulation_subject_peserta_id: "123e4567-e89b-12d3-a456-426614174000",
      simulation_subject_name: "Andi",
      simulation_subject_batch_name: "Batch 12",
      simulation_subject_team: "Tim Alpha",
    };
    const projected: any = (mod as any).projectTelefunHistoryRow
      ? (mod as any).projectTelefunHistoryRow(row)
      : row;
    expect(projected.simulationSubject?.type).toBe("participant");
  });
});
