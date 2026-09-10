import { describe, expect, it } from "vitest";
import { mapTelefunSessionRow } from "../routes/telefun/telefunApi";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("mapTelefunSessionRow subject", () => {
  it("prefers camelCase server snapshot (server wins)", () => {
    const row: any = {
      id: "t1",
      created_at: "2026-09-09T00:00:00Z",
      scenario_title: "S",
      consumer_name: "Budi",
      user_id: "user-1",
      simulationSubject: {
        type: "participant",
        participantId: VALID_UUID,
        displayName: "Andi",
        batchName: "Batch 12",
        team: "Tim Alpha",
      },
      simulation_subject_type: "self",
      simulation_subject_name: "Fake",
    };
    const rec = mapTelefunSessionRow(row);
    expect((rec as any).simulationSubject.type).toBe("participant");
    expect((rec as any).userId).toBe("user-1");
  });

  it("maps legacy snake null to unknown", () => {
    const rec = mapTelefunSessionRow({
      id: "t2",
      created_at: "2026-09-09T00:00:00Z",
      scenario_title: "S",
      consumer_name: "Budi",
    } as any);
    expect((rec as any).simulationSubject.type).toBe("unknown");
  });
});
