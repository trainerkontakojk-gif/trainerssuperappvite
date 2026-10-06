import type { MiddlewareHandler } from "hono";
import { can, type Capability, type Role } from "@trainers/types";

export interface Actor {
  id: string;
  role: Role;
}

/** Identity is supplied only by the authenticated middleware, never request input. */
export function getActor(context: {
  get: (key: "user" | "profile") => unknown;
}): Actor {
  const user = context.get("user") as { id: string };
  const profile = context.get("profile") as { role: Role };
  return { id: user.id, role: profile.role };
}

export function requireCapability(capability: Capability): MiddlewareHandler {
  return async (c, next) => {
    const profile = c.get("profile") as { role?: Role } | undefined;
    if (!can(profile?.role, capability)) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Anda tidak memiliki akses ke resource ini.",
          },
        },
        403,
      );
    }
    await next();
  };
}
