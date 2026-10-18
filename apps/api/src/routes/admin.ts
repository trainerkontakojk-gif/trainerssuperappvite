import { Hono, type Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import * as adminService from "../services/admin-service";
import * as adminUserService from "../services/admin-user-service";
import * as practiceLimits from "../services/practice-limits-service";
import * as accountControls from "../services/account-controls-service";
import { AdminUserError } from "../services/admin-user-service";
import { allowedOrigins } from "../lib/allowed-origins";
import { requireCapability } from "../middleware/role";
import {
  type Role,
  updateUserStatusSchema,
  updateUserRoleSchema,
  linkUserPesertaSchema,
  approveUserSchema,
  updatePracticeRulesSchema,
  setPracticeOverrideSchema,
  practiceModuleParamSchema,
  setActiveUntilSchema,
  bulkUserIdsSchema,
  bulkApproveSchema,
  bulkActiveUntilSchema,
  bulkPracticeLimitSchema,
  createAccessGroupSchema,
  updateAccessGroupSchema,
  addAccessGroupItemSchema,
  approveLeaderRequestSchema,
  rejectLeaderRequestSchema,
  revokeLeaderRequestSchema,
  reassignLeaderRequestGroupsSchema,
} from "@trainers/types";

type Variables = {
  user: User;
  profile: {
    role: Role;
    status: string;
    full_name: string | null;
  };
};

const admin = new Hono<{ Variables: Variables }>();

function actorOf(c: Context<{ Variables: Variables }>) {
  return {
    id: c.get("user").id,
    email: c.get("user").email || "System",
    role: c.get("profile").role,
  };
}

function adminUserFailure(c: Context, error: unknown) {
  if (error instanceof AdminUserError)
    return c.json(
      { success: false, error: { code: error.code, message: error.message } },
      error.status,
    );
  console.error("[admin] user request failed", error);
  return c.json(
    {
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Terjadi kesalahan pada server. Coba lagi.",
      },
    },
    500,
  );
}

// ── User Management Endpoints ──────────────────────────────
admin.get("/users", requireCapability("admin.users"), async (c) => {
  try {
    const data = await adminService.getUsers();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: { code: "SERVER_ERROR", message: error.message },
      },
      500,
    );
  }
});

admin.get(
  "/users/:id",
  requireCapability("admin.users"),
  async (c) => {
    try {
      const detail = await adminUserService.getUserDetail(c.req.param("id"));
      const data = {
        ...detail,
        practice_limits: await practiceLimits.getUserPracticeLimits(
          detail.user.id,
          detail.user.role,
        ),
      };
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.get(
  "/peserta-options",
  requireCapability("admin.users"),
  zValidator(
    "query",
    z.object({
      q: z.string().max(80).optional(),
      user_id: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const query = c.req.valid("query");
    try {
      const data = await adminUserService.getPesertaLinkOptions(
        query.q ?? "",
        query.user_id ?? null,
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.put(
  "/users/:id/peserta",
  requireCapability("admin.users"),
  zValidator("json", linkUserPesertaSchema),
  async (c) => {
    try {
      await adminUserService.linkUserPeserta(
        actorOf(c),
        c.req.param("id"),
        c.req.valid("json").peserta_id,
      );
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.delete(
  "/users/:id/peserta",
  requireCapability("admin.users"),
  async (c) => {
    try {
      await adminUserService.unlinkUserPeserta(actorOf(c), c.req.param("id"));
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.post(
  "/users/:id/approve",
  requireCapability("admin.users"),
  zValidator("json", approveUserSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      await adminService.approveUser(
        actorOf(c),
        c.req.param("id"),
        body.role,
        body.peserta_id,
        body.active_until ?? null,
      );
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

// ── Masa aktif and bulk actions (plans/markdown/kontrol-user-fase-5b.md) ──
admin.put(
  "/users/:id/active-until",
  requireCapability("admin.users"),
  zValidator("json", setActiveUntilSchema),
  async (c) => {
    try {
      await adminUserService.setActiveUntil(
        actorOf(c),
        c.req.param("id"),
        c.req.valid("json").active_until,
      );
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.post(
  "/users/bulk-peserta-suggestions",
  requireCapability("admin.users"),
  zValidator("json", bulkUserIdsSchema),
  async (c) => {
    try {
      const data = await accountControls.pesertaSuggestions(
        c.req.valid("json").user_ids,
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.post(
  "/users/bulk-approve",
  requireCapability("admin.users"),
  zValidator("json", bulkApproveSchema),
  async (c) => {
    try {
      const data = await accountControls.bulkApprove(
        actorOf(c),
        c.req.valid("json"),
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.post(
  "/users/bulk-suspend",
  requireCapability("admin.users"),
  zValidator("json", bulkUserIdsSchema),
  async (c) => {
    try {
      const data = await accountControls.bulkSuspend(
        actorOf(c),
        c.req.valid("json").user_ids,
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.post(
  "/users/bulk-active-until",
  requireCapability("admin.users"),
  zValidator("json", bulkActiveUntilSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const data = await accountControls.bulkActiveUntil(
        actorOf(c),
        body.user_ids,
        body.active_until,
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.post(
  "/users/bulk-practice-limit",
  requireCapability("practice.limits.manage"),
  zValidator("json", bulkPracticeLimitSchema),
  async (c) => {
    try {
      const data = await accountControls.bulkPracticeLimit(
        actorOf(c),
        c.req.valid("json"),
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

// ── Practice limits (plans/markdown/kontrol-user-fase-4.md) ──
admin.get(
  "/practice-limits",
  requireCapability("practice.limits.manage"),
  async (c) => {
    try {
      const data = await practiceLimits.getPracticeLimitsOverview();
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.put(
  "/practice-limits/rules",
  requireCapability("practice.limits.manage"),
  zValidator("json", updatePracticeRulesSchema),
  async (c) => {
    try {
      await practiceLimits.updatePracticeRules(
        actorOf(c),
        c.req.valid("json").rules,
      );
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.put(
  "/users/:id/practice-limits/:module",
  requireCapability("practice.limits.manage"),
  zValidator("param", practiceModuleParamSchema),
  zValidator("json", setPracticeOverrideSchema),
  async (c) => {
    const { id, module } = c.req.valid("param");
    try {
      await practiceLimits.setPracticeOverride(
        actorOf(c),
        id,
        module,
        c.req.valid("json"),
      );
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.delete(
  "/users/:id/practice-limits/:module",
  requireCapability("practice.limits.manage"),
  zValidator("param", practiceModuleParamSchema),
  async (c) => {
    const { id, module } = c.req.valid("param");
    try {
      await practiceLimits.clearPracticeOverride(actorOf(c), id, module);
      return c.json({ success: true, data: null });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

admin.put(
  "/users/:id/status",
  requireCapability("admin.users"),
  zValidator("json", updateUserStatusSchema),
  async (c) => {
    const userId = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    const profile = c.get("profile");

    try {
      await adminService.updateUserStatus(
        userId,
        body.status,
        user.id,
        user.email || "System",
        profile.role,
      );
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.put(
  "/users/:id/role",
  requireCapability("admin.users"),
  zValidator("json", updateUserRoleSchema),
  async (c) => {
    const userId = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    const profile = c.get("profile");

    try {
      await adminService.updateUserRole(
        userId,
        body.role,
        user.id,
        user.email || "System",
        profile.role,
      );
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.delete("/users/:id", requireCapability("admin.users"), async (c) => {
  const userId = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");

  try {
    await adminService.deleteUser(
      userId,
      user.id,
      user.email || "System",
      profile?.role,
    );
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: error.message },
      },
      400,
    );
  }
});

// ── Access Groups Endpoints ─────────────────────────────────
admin.get(
  "/access-groups",
  requireCapability("admin.accessGroups"),
  async (c) => {
    try {
      const data = await adminService.getAccessGroups();
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

admin.post(
  "/access-groups",
  requireCapability("admin.accessGroups"),
  zValidator("json", createAccessGroupSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const data = await adminService.createAccessGroup(
        body.name,
        body.description,
      );
      return c.json({ success: true, data }, 201);
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.put(
  "/access-groups/:id",
  requireCapability("admin.accessGroups"),
  zValidator("json", updateAccessGroupSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
      await adminService.updateAccessGroup(id, body);
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.get(
  "/access-groups/:id/items",
  requireCapability("admin.accessGroups"),
  async (c) => {
    const id = c.req.param("id");
    try {
      const data = await adminService.getAccessGroupItems(id);
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

admin.post(
  "/access-groups/:id/items",
  requireCapability("admin.accessGroups"),
  zValidator("json", addAccessGroupItemSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
      const data = await adminService.addAccessGroupItem(
        id,
        body.fieldName,
        body.fieldValue,
      );
      return c.json({ success: true, data }, 201);
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.delete(
  "/access-groups/items/:itemId",
  requireCapability("admin.accessGroups"),
  async (c) => {
    const itemId = c.req.param("itemId");
    try {
      await adminService.removeAccessGroupItem(itemId);
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.get(
  "/access-scope-options",
  requireCapability("admin.accessGroups"),
  async (c) => {
    try {
      const data = await adminService.getAccessScopeOptions();
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

// ── Leader Request Endpoints ─────────────────────────────────
admin.get(
  "/leader-requests/pending",
  requireCapability("admin.leaderAccess"),
  async (c) => {
    try {
      const data = await adminService.getPendingLeaderRequests();
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

admin.get(
  "/leader-requests/approved",
  requireCapability("admin.leaderAccess"),
  async (c) => {
    try {
      const data = await adminService.getApprovedLeaderRequests();
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

admin.post(
  "/leader-requests/:id/approve",
  requireCapability("admin.leaderAccess"),
  zValidator("json", approveLeaderRequestSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    try {
      await adminService.approveLeaderRequest(id, body.accessGroupIds, user.id);
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.post(
  "/leader-requests/:id/reject",
  requireCapability("admin.leaderAccess"),
  zValidator("json", rejectLeaderRequestSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    try {
      await adminService.rejectLeaderRequest(id, body.note, user.id);
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.post(
  "/leader-requests/:id/revoke",
  requireCapability("admin.leaderAccess"),
  zValidator("json", revokeLeaderRequestSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    try {
      await adminService.revokeLeaderRequest(id, body.note, user.id);
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

admin.put(
  "/leader-requests/:id/groups",
  requireCapability("admin.leaderAccess"),
  zValidator("json", reassignLeaderRequestGroupsSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");
    try {
      await adminService.reassignLeaderRequestGroups(
        id,
        body.accessGroupIds,
        user.id,
      );
      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: error.message },
        },
        400,
      );
    }
  },
);

// ── Password Reset ────────────────────────────────────────────
admin.post(
  "/users/:id/reset-password",
  requireCapability("admin.users"),
  async (c) => {
    // Only a trusted app origin becomes the link target; otherwise the
    // project Site URL is used.
    const origin = c.req.header("Origin");
    const redirectTo =
      origin && allowedOrigins.includes(origin)
        ? `${origin}/reset-password`
        : null;
    try {
      const data = await adminUserService.sendPasswordReset(
        actorOf(c),
        c.req.param("id"),
        redirectTo,
      );
      return c.json({ success: true, data });
    } catch (error) {
      return adminUserFailure(c, error);
    }
  },
);

// ── Activity Logs ────────────────────────────────────────────
admin.get(
  "/activity-logs",
  requireCapability("admin.activityLogs.read"),
  async (c) => {
    try {
      const data = await adminService.getActivityLogs();
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

export { admin as adminRouter };
