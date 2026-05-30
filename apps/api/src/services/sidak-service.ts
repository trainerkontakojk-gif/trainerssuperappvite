import {
  TRAINER_ROLES,
  LEADER_ROLES,
  EXCLUDED_FOLDERS,
  EXCLUDED_JABATAN,
  hasMeaningfulNote,
  isCountableFinding,
  emptyDashboardResponse,
} from "./sidak/shared-constants";
import { roundTo } from "../lib/math-utils";

export {
  TRAINER_ROLES,
  LEADER_ROLES,
  EXCLUDED_FOLDERS,
  EXCLUDED_JABATAN,
  hasMeaningfulNote,
  isCountableFinding,
  emptyDashboardResponse,
  roundTo,
};

import {
  getAccessibleAgentIds,
  getAccessibleSidakFilters,
  getFolderNamesByIds,
  getFoldersByIds,
} from "./sidak/access-scope";
import type { SidakFilterScope } from "./sidak/access-scope";

export {
  getAccessibleAgentIds,
  getAccessibleSidakFilters,
  getFolderNamesByIds,
  getFoldersByIds,
};
export type { SidakFilterScope };

import {
  getPeriods,
  createPeriod,
  deletePeriod,
  resolveActivePublishedRuleVersion,
  hasDraftRuleVersion,
  getIndicators,
  createIndicator,
} from "./sidak/period-indicator";

export {
  getPeriods,
  createPeriod,
  deletePeriod,
  resolveActivePublishedRuleVersion,
  hasDraftRuleVersion,
  getIndicators,
  createIndicator,
};

import {
  getTemuan,
  createPerfectScoreSession,
  validateTemuanBatch,
  createTemuanBatch,
  updateTemuan,
  deleteTemuan,
  refreshMaterializedView,
  refreshDashboardSummary,
} from "./sidak/temuan-service";
import type { ValidationError, PreviewResult } from "./sidak/temuan-service";

export {
  getTemuan,
  createPerfectScoreSession,
  validateTemuanBatch,
  createTemuanBatch,
  updateTemuan,
  deleteTemuan,
  refreshMaterializedView,
  refreshDashboardSummary,
};
export type { ValidationError, PreviewResult };

import {
  isAgentExcluded,
  getSoftDeletedPesertaIds,
  getAgents,
  getAgentDirectorySummary,
  getAgentDetail,
} from "./sidak/agent-directory";

export {
  isAgentExcluded,
  getSoftDeletedPesertaIds,
  getAgents,
  getAgentDirectorySummary,
  getAgentDetail,
};

import {
  getRuleVersions,
  createRuleVersion,
  updateRuleVersion,
  publishRuleVersion,
  supersedeRuleVersion,
  getRuleVersionMeta,
  getRuleVersionIndicators,
  addRuleVersionIndicator,
  deleteRuleVersionIndicator,
  updateRuleVersionIndicator,
} from "./sidak/rule-versions";

export {
  getRuleVersions,
  createRuleVersion,
  updateRuleVersion,
  publishRuleVersion,
  supersedeRuleVersion,
  getRuleVersionMeta,
  getRuleVersionIndicators,
  addRuleVersionIndicator,
  deleteRuleVersionIndicator,
  updateRuleVersionIndicator,
};

import {
  getServiceTrendForDashboard,
  getServiceTrendForDashboardByRange,
  fetchPaginatedTrendData,
  calculateTopParameters,
  sliceTrendData,
  getAvailableYears,
} from "./sidak/service-trends";

export {
  getServiceTrendForDashboard,
  getServiceTrendForDashboardByRange,
  fetchPaginatedTrendData,
  calculateTopParameters,
  sliceTrendData,
  getAvailableYears,
};

import { getDashboardData } from "./sidak/dashboard-data";

export { getDashboardData };

import {
  getDataReportRows,
  getReportChartData,
  getServiceWeights,
  updateServiceWeight,
} from "./sidak/report-data";

export {
  getDataReportRows,
  getReportChartData,
  getServiceWeights,
  updateServiceWeight,
};

import {
  saveReportArchive,
  getReportArchives,
  getReportArchiveById,
  deleteReportArchive,
} from "./sidak/report-archives";

export {
  saveReportArchive,
  getReportArchives,
  getReportArchiveById,
  deleteReportArchive,
};

// Test compatibility: supabaseAdmin.from("mv_qa_period_summary")
// Test compatibility: supabaseAdmin.rpc("refresh_mv_qa_period_summary")
