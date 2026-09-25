import { describe, it, expect } from "vitest";
import { normalizeAgentsResponse } from "../routes/sidak/input";
import { resolveInitialInputService } from "../lib/sidak-input-service";

describe("normalizeAgentsResponse", () => {
  it("returns empty array for null", () => {
    expect(normalizeAgentsResponse(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeAgentsResponse(undefined)).toEqual([]);
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

  it("requires an explicit service for Mix agents instead of defaulting to CSO", () => {
    expect(resolveInitialInputService("Mix")).toBe("");
    expect(resolveInitialInputService("Telepon")).toBe("call");
    expect(resolveInitialInputService("Email")).toBe("email");
  });
});
