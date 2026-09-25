import { describe, expect, it } from "vitest";
import * as sidakService from "../services/sidak-service";
import { roundTo as mathRoundTo } from "../lib/math-utils";

describe("Sidak Decomposition - Structural Property Tests", () => {
  it("verifies barrel export completeness", () => {
    const EXPECTED_EXPORTS = [
      "TRAINER_ROLES",
      "LEADER_ROLES",
      "EXCLUDED_FOLDERS",
      "EXCLUDED_JABATAN",
      "hasMeaningfulNote",
      "isCountableFinding",
      "emptyDashboardResponse",
      "roundTo",
      "getAccessibleAgentIds",
      "getAccessibleSidakFilters",
      "getFolderNamesByIds",
      "getFoldersByIds",
      "getPeriods",
      "createPeriod",
      "deletePeriod",
      "resolveActivePublishedRuleVersion",
      "hasDraftRuleVersion",
      "getIndicators",
      "createIndicator",
      "getTemuan",
      "createPerfectScoreSession",
      "validateTemuanBatch",
      "createTemuanBatch",
      "updateTemuan",
      "deleteTemuan",
      "refreshMaterializedView",
      "refreshDashboardSummary",
      "isAgentExcluded",
      "getSoftDeletedPesertaIds",
      "getAgents",
      "getAgentDirectorySummary",
      "getAgentDetail",
      "getRuleVersions",
      "createRuleVersion",
      "updateRuleVersion",
      "publishRuleVersion",
      "supersedeRuleVersion",
      "getRuleVersionMeta",
      "getRuleVersionIndicators",
      "addRuleVersionIndicator",
      "deleteRuleVersionIndicator",
      "updateRuleVersionIndicator",
      "getServiceTrendForDashboard",
      "getServiceTrendForDashboardByRange",
      "fetchPaginatedTrendData",
      "calculateTopParameters",
      "sliceTrendData",
      "getAvailableYears",
      "getDashboardData",
      "getDataReportRows",
      "getReportChartData",
      "getServiceWeights",
      "updateServiceWeight",
      "saveReportArchive",
      "getReportArchives",
      "getReportArchiveById",
      "deleteReportArchive",
      "generateAiReport",
      "aiReportSchema",
      "getAllFolders",
      "getAgentsByFolder",
    ];

    const actualExports = Object.keys(sidakService);

    // Check that every expected export is present in actual exports
    for (const exp of EXPECTED_EXPORTS) {
      expect(actualExports).toContain(exp);
      expect((sidakService as any)[exp]).toBeDefined();
    }
  });

  it("verifies roundTo behavioral equivalence on float edge cases", () => {
    // Original local roundTo implementation:
    const legacyRoundTo = (value: number, digits: number): number => {
      const factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    };

    const testCases = [
      { value: 1.005, digits: 2 },
      { value: 1.004, digits: 2 },
      { value: 1.006, digits: 2 },
      { value: -1.005, digits: 2 },
      { value: 0.1 + 0.2, digits: 2 },
      { value: 10.5, digits: 0 },
      { value: 10.4, digits: 0 },
      { value: 123.456, digits: 1 },
      { value: 123.456, digits: 2 },
      { value: 123.456, digits: 0 },
      { value: 0.0001, digits: 3 },
      { value: 0.9999, digits: 2 },
    ];

    for (const tc of testCases) {
      const legacyRes = legacyRoundTo(tc.value, tc.digits);
      const mathRes = mathRoundTo(tc.value, tc.digits);
      expect(mathRes).toBe(legacyRes);
    }
  });
});
