import { expect, test } from "@playwright/test";
import { readLoopbackEnv, runSql } from "./helpers/sidakRealBackend";
import { bootLocalService } from "./helpers/bootLocalService";

// Real database aggregate probe: local-only, not part of CI's no-backend
// proxy suite. The disposable workdir and dedicated ports are mandatory.
test("idle Telefun does not claim retired WebRTC orphans", async () => {
  if (!process.env.E2E_SUPABASE_WORKDIR)
    throw new Error("Disposable Supabase workdir required");
  const env = readLoopbackEnv();
  if (
    new URL(env.apiUrl).port !== "55321" ||
    new URL(env.dbUrl).port !== "55322"
  )
    throw new Error("Unexpected disposable Supabase ports");
  const count = () =>
    Number(
      runSql(
        env,
        `SELECT coalesce(sum(calls),0) FROM pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS (%' AND query LIKE '%claim_telefun_realtime_orphans%';`,
      ),
    );
  const before = count();
  const app = bootLocalService("telefun", env.apiUrl, {
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS: "1000",
  });
  try {
    const url = await app.url();
    expect((await fetch(`${url}/health`)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 4000));
  } finally {
    await app.close();
  }
  const calls = count() - before;
  console.log(`idle orphan claim count: ${calls}`);
  expect(calls).toBe(0);
});
