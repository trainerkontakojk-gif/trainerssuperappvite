import { describe, expect, it, vi } from "vitest";
import { getTelefunSettings, saveTelefunSettings, mapTelefunSessionRow } from "../routes/telefun/telefunApi";

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

  it("maps session rows to CallRecord correctly", () => {
    const row = {
      id: "session-1",
      created_at: "2026-05-30T10:00:00Z",
      recording_url: "http://storage.com/rec.webm",
      consumer_name: "John",
      consumer_phone: "123",
      consumer_city: "Jakarta",
      scenario_title: "Scenario A",
      duration: 120,
      configured_duration: 300,
      score: 98,
    };
    const record = mapTelefunSessionRow(row);
    expect(record.id).toBe("session-1");
    expect(record.consumerName).toBe("John");
    expect(record.duration).toBe(120);
  });
});
