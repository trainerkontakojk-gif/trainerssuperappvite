import type {
  PendingLeaderRequest,
  ApprovedLeaderAccess,
} from "@trainers/types";
import { getAccessModulePresentation } from "./components/AccessModuleBadge";

export type LeaderAccessRequest = PendingLeaderRequest | ApprovedLeaderAccess;

export interface LeaderAccessRequestGroup {
  leaderUserId: string;
  leaderName: string;
  leaderEmail: string;
  requests: LeaderAccessRequest[];
  requestByModule: Map<string, LeaderAccessRequest>;
  moduleKeys: string[];
  moduleLabel: string;
  latestTimestamp: string;
  accessGroupNames: string[];
}

const MODULE_ORDER: Record<string, number> = {
  all: 0,
  ktp: 1,
  sidak: 2,
};

function getModulePriority(module: string): number {
  return MODULE_ORDER[module] ?? Number.MAX_SAFE_INTEGER;
}

function getLatestTimestamp(request: LeaderAccessRequest): string {
  return "created_at" in request ? request.created_at : request.approved_at;
}

export function resolveDefaultRequest(
  group: LeaderAccessRequestGroup,
  currentRequestId?: string | null,
): LeaderAccessRequest {
  if (currentRequestId) {
    const current = group.requests.find((r) => r.id === currentRequestId);
    if (current) return current;
  }

  const ktp = group.requestByModule.get("ktp");
  if (ktp) return ktp;

  const sidak = group.requestByModule.get("sidak");
  if (sidak) return sidak;

  return group.requests[0];
}

export function groupLeaderAccessRequests(
  requests: LeaderAccessRequest[],
): LeaderAccessRequestGroup[] {
  const groups = new Map<string, LeaderAccessRequest[]>();

  for (const request of requests) {
    const uid = request.leader_user_id;
    if (!groups.has(uid)) {
      groups.set(uid, []);
    }
    groups.get(uid)!.push(request);
  }

  const result: LeaderAccessRequestGroup[] = [];

  for (const [leaderUserId, memberRequests] of groups) {
    memberRequests.sort(
      (a, b) => getModulePriority(a.module) - getModulePriority(b.module),
    );

    const sortedByDate: LeaderAccessRequest[] = [...memberRequests].sort(
      (a, b) =>
        new Date(getLatestTimestamp(b)).getTime() -
        new Date(getLatestTimestamp(a)).getTime(),
    );

    const newest = sortedByDate[0];
    const leaderName = newest.leader_name;
    const leaderEmail = newest.leader_email;

    const requestByModule = new Map<string, LeaderAccessRequest>();
    const moduleKeys: string[] = [];
    const accessGroupNamesSet = new Set<string>();

    for (const req of memberRequests) {
      requestByModule.set(req.module, req);
      if (!moduleKeys.includes(req.module)) {
        moduleKeys.push(req.module);
      }
      if ("access_group_names" in req) {
        for (const name of req.access_group_names) {
          accessGroupNamesSet.add(name);
        }
      }
    }

    const hasAll = requestByModule.has("all");
    const hasKtp = requestByModule.has("ktp");
    const hasSidak = requestByModule.has("sidak");

    let moduleLabel: string;
    if (hasAll || (hasKtp && hasSidak)) {
      moduleLabel = "KTP + SIDAK";
    } else if (hasKtp) {
      moduleLabel = getAccessModulePresentation("ktp").label;
    } else if (hasSidak) {
      moduleLabel = getAccessModulePresentation("sidak").label;
    } else {
      moduleLabel = getAccessModulePresentation(
        memberRequests[0]?.module ?? null,
      ).label;
    }

    const latestTimestamp = sortedByDate.reduce((latest, req) => {
      const ts = getLatestTimestamp(req);
      return ts > latest ? ts : latest;
    }, getLatestTimestamp(sortedByDate[0]));

    result.push({
      leaderUserId,
      leaderName,
      leaderEmail,
      requests: memberRequests,
      requestByModule,
      moduleKeys,
      moduleLabel,
      latestTimestamp,
      accessGroupNames: [...accessGroupNamesSet],
    });
  }

  result.sort(
    (a, b) =>
      new Date(b.latestTimestamp).getTime() -
      new Date(a.latestTimestamp).getTime(),
  );

  return result;
}
