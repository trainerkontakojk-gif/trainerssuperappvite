import { env } from "./lib/env";
import { serve } from "@hono/node-server";
import app from "./app";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[API] Server running on http://localhost:${info.port}`);
});
