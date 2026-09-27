import { describe, expect, it } from "vitest";
import { getReportFindingText } from "../routes/sidak/reports-data-utils";

describe("getReportFindingText", () => {
  it("uses a visible placeholder when the finding is empty", () => {
    expect(getReportFindingText({ ketidaksesuaian: "   " })).toBe("-");
  });
});
