import { Context, Next } from "hono";

export const requestLogger = async (c: Context, next: Next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const user = c.get("user") as { id?: string } | undefined;
  const userId = user?.id || "anon";

  console.log(`[${method}] ${path} ${status} ${duration}ms ${userId}`);
};
