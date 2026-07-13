// Runs in the fast Node suite; no rendered React surface is required.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  canOverwriteTelefunLocalHistory,
  parseTelefunLocalHistory,
  shouldPersistTelefunLocalHistory,
} from "../routes/telefun/telefunLocalHistory";
import type { CallRecord } from "../routes/telefun/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingSource = readFileSync(
  join(__dirname, "../routes/telefun/index.tsx"),
  "utf8",
);

const localRecord: CallRecord = {
  id: "local-1",
  date: "2026-07-13T10:00:00.000Z",
  url: "blob:local",
  consumerName: "Konsumen Lokal",
  scenarioTitle: "Skenario Lokal",
  duration: 30,
};

describe("Telefun local history parsing", () => {
  it("warns once and marks invalid JSON as corrupt", () => {
    const warn = vi.fn();

    expect(parseTelefunLocalHistory("{broken", warn)).toEqual({
      records: [],
      isCorrupt: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.join(" ")).not.toContain("broken");
  });

  it("warns once and marks non-array JSON as corrupt", () => {
    const warn = vi.fn();

    expect(
      parseTelefunLocalHistory(JSON.stringify({ id: "not-an-array" }), warn),
    ).toEqual({ records: [], isCorrupt: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[null]],
    [["not-a-record"]],
    [[{ date: "2026-07-13T10:00:00.000Z" }]],
    [[{ id: "missing-date" }]],
  ])("marks arrays containing invalid records as corrupt", (payload) => {
    const warn = vi.fn();

    expect(parseTelefunLocalHistory(JSON.stringify(payload), warn)).toEqual({
      records: [],
      isCorrupt: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns a valid local-only array without warning", () => {
    const warn = vi.fn();

    expect(
      parseTelefunLocalHistory(JSON.stringify([localRecord]), warn),
    ).toEqual({ records: [localRecord], isCorrupt: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns an empty array without warning when local storage has no history", () => {
    const warn = vi.fn();

    expect(parseTelefunLocalHistory(null, warn)).toEqual({
      records: [],
      isCorrupt: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("preserves corrupt local payloads instead of overwriting them with server rows", () => {
    expect(shouldPersistTelefunLocalHistory([localRecord], true)).toBe(false);
    expect(shouldPersistTelefunLocalHistory([localRecord], false)).toBe(true);
    expect(shouldPersistTelefunLocalHistory([], false)).toBe(false);
  });

  it("blocks later automatic writes until the user explicitly clears corrupt history", () => {
    expect(canOverwriteTelefunLocalHistory(true)).toBe(false);
    expect(canOverwriteTelefunLocalHistory(false)).toBe(true);
  });

  it("initializes the corruption guard before awaiting server history", () => {
    const loadHistorySource = landingSource.slice(
      landingSource.indexOf("const loadHistory = async"),
      landingSource.indexOf("loadSettings();"),
    );

    expect(loadHistorySource.indexOf("parseTelefunLocalHistory")).toBeLessThan(
      loadHistorySource.indexOf("await getTelefunSessions"),
    );
    expect(
      loadHistorySource.indexOf("localHistoryIsCorruptRef.current"),
    ).toBeLessThan(loadHistorySource.indexOf("await getTelefunSessions"));
  });
});
