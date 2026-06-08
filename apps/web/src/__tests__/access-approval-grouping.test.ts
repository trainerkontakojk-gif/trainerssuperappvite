import { describe, it, expect } from "vitest";
import {
  groupLeaderAccessRequests,
  resolveDefaultRequest,
} from "../routes/dashboard/access-approval-grouping";
import type {
  PendingLeaderRequest,
  ApprovedLeaderAccess,
} from "@trainers/types";

const ktpRequest: PendingLeaderRequest = {
  id: "request-ktp",
  leader_user_id: "leader-1",
  leader_name: "Trainers",
  leader_email: "trainer@example.com",
  module: "ktp",
  created_at: "2026-06-04T08:00:00.000Z",
  status: "pending",
};

const sidakRequest: PendingLeaderRequest = {
  id: "request-sidak",
  leader_user_id: "leader-1",
  leader_name: "Trainers",
  leader_email: "trainer@example.com",
  module: "sidak",
  created_at: "2026-06-04T09:00:00.000Z",
  status: "pending",
};

const allRequest: PendingLeaderRequest = {
  id: "request-all",
  leader_user_id: "leader-2",
  leader_name: "Leader All",
  leader_email: "all@example.com",
  module: "all",
  created_at: "2026-06-05T00:00:00.000Z",
  status: "pending",
};

describe("groupLeaderAccessRequests", () => {
  it("groups ktp and sidak requests by leader_user_id", () => {
    const groups = groupLeaderAccessRequests([ktpRequest, sidakRequest]);

    expect(groups).toHaveLength(1);
    expect(groups[0].leaderUserId).toBe("leader-1");
    expect(groups[0].requests.map((r) => r.id)).toEqual([
      "request-ktp",
      "request-sidak",
    ]);
  });

  it("does not group different leader ids with the same email", () => {
    const sameEmailDiffId1: PendingLeaderRequest = {
      ...ktpRequest,
      leader_user_id: "leader-a",
      id: "req-a",
    };
    const sameEmailDiffId2: PendingLeaderRequest = {
      ...sidakRequest,
      leader_user_id: "leader-b",
      id: "req-b",
    };

    const groups = groupLeaderAccessRequests([
      sameEmailDiffId1,
      sameEmailDiffId2,
    ]);

    expect(groups).toHaveLength(2);
  });

  it("uses the newest request identity and timestamp", () => {
    const groups = groupLeaderAccessRequests([ktpRequest, sidakRequest]);

    expect(groups[0].leaderName).toBe("Trainers");
    expect(groups[0].leaderEmail).toBe("trainer@example.com");
    expect(groups[0].latestTimestamp).toBe("2026-06-04T09:00:00.000Z");
  });

  it("sorts groups by latest timestamp descending", () => {
    const newerRequest: PendingLeaderRequest = {
      id: "request-newer",
      leader_user_id: "leader-newer",
      leader_name: "Newer",
      leader_email: "newer@example.com",
      module: "ktp",
      created_at: "2026-06-10T00:00:00.000Z",
      status: "pending",
    };

    const groups = groupLeaderAccessRequests([ktpRequest, newerRequest]);

    expect(groups).toHaveLength(2);
    expect(groups[0].leaderUserId).toBe("leader-newer");
    expect(groups[1].leaderUserId).toBe("leader-1");
  });

  it("returns KTP + SIDAK for combined coverage", () => {
    const groups = groupLeaderAccessRequests([ktpRequest, sidakRequest]);

    expect(groups[0].moduleLabel).toBe("KTP + SIDAK");
  });

  it("keeps module 'all' as one concrete request", () => {
    const groups = groupLeaderAccessRequests([allRequest]);

    expect(groups).toHaveLength(1);
    expect(groups[0].moduleLabel).toBe("KTP + SIDAK");
    expect(groups[0].requests).toHaveLength(1);
    expect(groups[0].requests[0].id).toBe("request-all");
  });

  it("unions approved access-group names for card summary", () => {
    const approvedKtp: ApprovedLeaderAccess = {
      id: "approved-ktp",
      leader_user_id: "leader-3",
      leader_name: "Leader Tiga",
      leader_email: "tiga@example.com",
      module: "ktp",
      access_group_ids: ["g1"],
      access_group_names: ["Tim Call"],
      approved_at: "2026-06-06T00:00:00.000Z",
    };
    const approvedSidak: ApprovedLeaderAccess = {
      id: "approved-sid",
      leader_user_id: "leader-3",
      leader_name: "Leader Tiga",
      leader_email: "tiga@example.com",
      module: "sidak",
      access_group_ids: ["g2"],
      access_group_names: ["Tim Email", "Tim Call"],
      approved_at: "2026-06-06T00:00:00.000Z",
    };

    const groups = groupLeaderAccessRequests([approvedKtp, approvedSidak]);

    expect(groups).toHaveLength(1);
    expect(groups[0].accessGroupNames).toEqual(
      expect.arrayContaining(["Tim Call", "Tim Email"]),
    );
  });

  it("preserves every request id in the group", () => {
    const thirdReq: PendingLeaderRequest = {
      id: "request-unknown",
      leader_user_id: "leader-1",
      leader_name: "Trainers",
      leader_email: "trainer@example.com",
      module: "future-module",
      created_at: "2026-06-04T10:00:00.000Z",
      status: "pending",
    };

    const groups = groupLeaderAccessRequests([
      ktpRequest,
      sidakRequest,
      thirdReq,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].requests).toHaveLength(3);
    expect(groups[0].requests.map((r) => r.id)).toEqual([
      "request-ktp",
      "request-sidak",
      "request-unknown",
    ]);
  });

  it("orders requests by module priority (all > ktp > sidak > unknown)", () => {
    const groups = groupLeaderAccessRequests([sidakRequest, ktpRequest]);

    expect(groups[0].requests.map((r) => r.module)).toEqual(["ktp", "sidak"]);
  });

  it("returns KTP only label when only ktp exists", () => {
    const groups = groupLeaderAccessRequests([ktpRequest]);
    expect(groups[0].moduleLabel).toBe("KTP");
  });

  it("returns SIDAK only label when only sidak exists", () => {
    const groups = groupLeaderAccessRequests([sidakRequest]);
    expect(groups[0].moduleLabel).toBe("SIDAK");
  });
});

describe("resolveDefaultRequest", () => {
  const group = groupLeaderAccessRequests([ktpRequest, sidakRequest])[0];

  it("prefers ktp when no current request", () => {
    const result = resolveDefaultRequest(group);
    expect(result.id).toBe("request-ktp");
  });

  it("preserves current request when still in group", () => {
    const result = resolveDefaultRequest(group, "request-sidak");
    expect(result.id).toBe("request-sidak");
  });

  it("falls back to ktp when current request no longer exists", () => {
    const result = resolveDefaultRequest(group, "request-stale");
    expect(result.id).toBe("request-ktp");
  });
});
