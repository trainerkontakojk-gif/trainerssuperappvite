import { env } from "./lib/env";
import app from "./app";
import { startApiRuntime } from "./api-runtime";

// Exit once graceful shutdown settles (workers fenced, HTTP closed). An
// abandoned provider call must not keep the process alive past SIGTERM.
startApiRuntime({
  app,
  port: env.PORT,
  setExitCode: (code) => process.exit(code),
});
