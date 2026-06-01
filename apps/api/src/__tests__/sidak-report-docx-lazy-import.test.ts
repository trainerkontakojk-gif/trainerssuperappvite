import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDocxBuilderLoaded } = vi.hoisted(() => ({
  mockDocxBuilderLoaded: vi.fn(),
}));

vi.mock("../lib/report-docx-builder", () => {
  mockDocxBuilderLoaded();
  return {
    buildAiReportDocx: vi.fn(),
  };
});

vi.mock("../services/sidak-service", () => ({
  aiReportSchema: { safeParse: vi.fn() },
  getAccessibleAgentIds: vi.fn(),
  getDataReportRows: vi.fn(),
  generateAiReport: vi.fn(),
  getReportChartData: vi.fn(),
  getSavedReports: vi.fn(),
  getSavedReportById: vi.fn(),
  deleteSavedReport: vi.fn(),
  saveAiReport: vi.fn(),
}));

vi.mock("../services/activity-log-service", () => ({
  logActivity: vi.fn(),
}));

describe("SIDAK report DOCX export", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not load the docx builder during route registration", async () => {
    await import("../routes/sidak/reports");

    expect(mockDocxBuilderLoaded).not.toHaveBeenCalled();
  });
});
