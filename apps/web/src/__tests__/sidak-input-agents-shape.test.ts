import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeAgentsResponse } from "../routes/sidak/input";

describe("normalizeAgentsResponse", () => {
  it("returns empty array for null", () => {
    expect(normalizeAgentsResponse(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeAgentsResponse(undefined)).toEqual([]);
  });

  it("returns empty array for string", () => {
    expect(normalizeAgentsResponse("garbage")).toEqual([]);
  });

  it("returns empty array for number", () => {
    expect(normalizeAgentsResponse(42)).toEqual([]);
  });

  it("extracts agents array from object shape (AgentDirectoryResponse)", () => {
    const payload = {
      agents: [
        { id: "a1", nama: "Alice", batch_name: "Alpha" },
        { id: "a2", nama: "Bob", batch_name: "Beta" },
      ],
      batches: ["Alpha", "Beta"],
    };
    expect(normalizeAgentsResponse(payload)).toEqual(payload.agents);
  });

  it("returns empty array when object has no agents key", () => {
    expect(normalizeAgentsResponse({ other: "data" })).toEqual([]);
  });

  it("returns empty array when agents is not an array", () => {
    expect(normalizeAgentsResponse({ agents: "not-an-array" })).toEqual([]);
  });

  it("passes through legacy array shape", () => {
    const payload = [
      { id: "a1", nama: "Alice" },
      { id: "a2", nama: "Bob" },
    ];
    expect(normalizeAgentsResponse(payload)).toEqual(payload);
  });
});
