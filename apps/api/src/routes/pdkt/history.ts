import { Hono } from "hono";
import { PdktSessionHistory } from "@trainers/types";
import * as pdktService from "../../services/pdkt-service";
import { requireRole } from "../../middleware/role";
import { createAdminClient } from "../../lib/supabase";
import {
  Variables,
  getUserClient,
  jsonServerError,
} from "./route-utils";

const history = new Hono<{ Variables: Variables }>();

history.get(
  "/",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const userClient = getUserClient(c);

    try {
      const { data, error } = await userClient
        .from("pdkt_history")
        .select("*")
        .eq("user_id", user.id)
        .order("timestamp", { ascending: false });

      if (error) throw error;

      return c.json({
        success: true,
        data: (data || []) as PdktSessionHistory[],
      });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

history.get(
  "/eval/:id",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const id = c.req.param("id");
    const userClient = getUserClient(c);

    try {
      // First, try querying via userClient (respects RLS, works if they own the row)
      let { data, error } = await userClient
        .from("pdkt_history")
        .select("evaluation_status, evaluation, evaluation_error")
        .eq("id", id)
        .single();

      // Fallback: check if the history item is associated with a mailbox item
      // that the user has access to (pdkt_mailbox_items select policy is select_all)
      if (error || !data) {
        const { data: mailboxItem } = await userClient
          .from("pdkt_mailbox_items")
          .select("id")
          .eq("history_id", id)
          .maybeSingle();

        if (mailboxItem) {
          const adminClient = createAdminClient();
          const { data: adminData, error: adminError } = await adminClient
            .from("pdkt_history")
            .select("evaluation_status, evaluation, evaluation_error")
            .eq("id", id)
            .single();

          if (!adminError && adminData) {
            data = adminData;
            error = null;
          }
        }
      }

      if (error || !data) {
        return c.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "History not found or access denied.",
            },
          },
          404,
        );
      }

      return c.json({ success: true, data });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

history.post(
  "/retry-eval",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    try {
      const body = await c.req.json();
      const historyId = body.historyId;
      if (!historyId) {
        return c.json(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: "historyId is required" },
          },
          400,
        );
      }

      const user = c.get("user");
      const userClient = getUserClient(c);

      // Verify the row is visible to the current user client. Shared history
      // visibility is delegated to Supabase RLS instead of owner-only filtering.
      let { data, error } = await userClient
        .from("pdkt_history")
        .select("id")
        .eq("id", historyId)
        .maybeSingle();

      // Fallback: check if the history item is associated with a mailbox item
      // that the user has access to (pdkt_mailbox_items select policy is select_all)
      if (error || !data) {
        const { data: mailboxItem } = await userClient
          .from("pdkt_mailbox_items")
          .select("id")
          .eq("history_id", historyId)
          .maybeSingle();

        if (mailboxItem) {
          const adminClient = createAdminClient();
          const { data: adminData, error: adminError } = await adminClient
            .from("pdkt_history")
            .select("id")
            .eq("id", historyId)
            .maybeSingle();

          if (!adminError && adminData) {
            data = adminData;
            error = null;
          }
        }
      }

      if (error || !data) {
        return c.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "History item not found or access denied.",
            },
          },
          404,
        );
      }

      const evalPromise = pdktService.processPdktEvaluation(historyId, user.id);
      try {
        if (c.executionCtx?.waitUntil) {
          c.executionCtx.waitUntil(evalPromise);
        } else {
          evalPromise.catch((err) =>
            console.error("[PDKT Async Eval Retry Error]", err),
          );
        }
      } catch (_execCtxErr) {
        evalPromise.catch((err) =>
          console.error("[PDKT Async Eval Retry Error]", err),
        );
      }

      return c.json({ success: true, message: "Evaluation retrying." });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

history.delete(
  "/",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();

    try {
      const { error } = await adminClient
        .from("pdkt_history")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      return c.json({ success: true, message: "All PDKT history deleted." });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

history.delete(
  "/:id",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const adminClient = createAdminClient();

    try {
      const { error } = await adminClient
        .from("pdkt_history")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      return c.json({ success: true, message: "PDKT history item deleted." });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

export { history };
