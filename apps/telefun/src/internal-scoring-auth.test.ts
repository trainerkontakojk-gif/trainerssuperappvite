import { describe, expect, it } from "vitest";
import { authorizeInternalScoring } from "./internal-scoring-auth.js";

describe("authorizeInternalScoring", () => {
  it("accepts only the exact bearer token", () => {
    expect(
      authorizeInternalScoring("Bearer internal-secret", "internal-secret"),
    ).toBe(true);
    expect(authorizeInternalScoring("Bearer wrong", "internal-secret")).toBe(
      false,
    );
    expect(authorizeInternalScoring(undefined, "internal-secret")).toBe(false);
  });

  it("rejects malformed authorization headers without leaking comparison", () => {
    expect(authorizeInternalScoring("", "internal-secret")).toBe(false);
    expect(authorizeInternalScoring("internal-secret", "internal-secret")).toBe(
      false,
    );
    expect(authorizeInternalScoring("Bearer ", "internal-secret")).toBe(false);
    expect(
      authorizeInternalScoring(
        null as string | null | undefined,
        "internal-secret",
      ),
    ).toBe(false);
  });

  it("rejects when the expected token is empty", () => {
    expect(authorizeInternalScoring("Bearer anything", "")).toBe(false);
  });
});
