import { describe, expect, it, vi } from "vitest";
import {
  getTelefunSettings,
  saveTelefunSettings,
  mapTelefunSessionRow,
} from "../routes/telefun/telefunApi";
import type { TelefunSessionRow } from "../routes/telefun/telefunApi";

vi.mock("../hooks/useApi", () => ({
  getApi: vi.fn().mockResolvedValue({ success: true, selectedModel: "gemini" }),
  putApi: vi.fn().mockResolvedValue({ success: true }),
  deleteApi: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Telefun API Adapter", () => {
  it("fetches settings via getApi", async () => {
    const settings = await getTelefunSettings();
    expect(settings).toBeDefined();
  });

  it("saves settings via putApi", async () => {
    await saveTelefunSettings({ selectedModel: "gemini" } as any);
  });

  it("maps session rows to CallRecord correctly with canonical score", () => {
    const row: TelefunSessionRow = {
      id: "session-1",
      created_at: "2026-05-30T10:00:00Z",
      recording_path: "path/to/rec.webm",
      consumer_name: "John",
      scenario_title: "Scenario A",
      duration_seconds: 120,
      score: 8,
    };
    const record = mapTelefunSessionRow(row);
    expect(record.id).toBe("session-1");
    expect(record.score).toBe(8);
  });

  it("sets voiceAssessment to null when invalid in row", () => {
    const row: TelefunSessionRow = {
      id: "session-invalid",
      voice_assessment: { overallScore: 8 }, // Incomplete
    };
    const record = mapTelefunSessionRow(row);
    expect(record.voiceAssessment).toBeNull();
  });

  it("preserves score zero instead of falling back to dashboard score", () => {
    const row: TelefunSessionRow = {
      id: "session-zero",
      score: 0,
      voice_dashboard_metrics: { score: 8 },
    };

    expect(mapTelefunSessionRow(row).score).toBe(0);
  });

  it("uses dashboard score only when the canonical row score is absent", () => {
    const row: TelefunSessionRow = {
      id: "session-dashboard",
      score: null,
      voice_dashboard_metrics: { score: 7 },
    };

    expect(mapTelefunSessionRow(row).score).toBe(7);
  });

  it("parses valid messages into transcript entries", () => {
    const row: TelefunSessionRow = {
      id: "session-transcript",
      messages: [
        { speaker: "agent", text: "Halo", startMs: 1000 },
        { speaker: "consumer", text: "Halo juga", startMs: 3000 },
      ],
    };
    const record = mapTelefunSessionRow(row);
    expect(record.transcript).toHaveLength(2);
    expect(record.transcript![0].speaker).toBe("agent");
    expect(record.transcript![0].text).toBe("Halo");
  });

  it("cleans malformed messages via parseTelefunTranscript", () => {
    const row: TelefunSessionRow = {
      id: "session-malformed",
      messages: [
        { speaker: "agent", text: "Valid", startMs: 0 },
        { speaker: "unknown", text: "Invalid", startMs: 0 },
      ],
    };
    const record = mapTelefunSessionRow(row);
    expect(record.transcript).toHaveLength(1);
    expect(record.transcript![0].text).toBe("Valid");
  });

  it("returns empty array when messages is missing", () => {
    const row: TelefunSessionRow = { id: "session-nomessages" };
    const record = mapTelefunSessionRow(row);
    expect(record.transcript).toEqual([]);
  });
});
