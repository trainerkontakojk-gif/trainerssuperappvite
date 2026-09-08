import { env } from "./lib/env";
import app from "./app";
import { startApiRuntime } from "./api-runtime";

startApiRuntime({ app, port: env.PORT });
