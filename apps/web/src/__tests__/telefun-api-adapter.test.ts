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
});
