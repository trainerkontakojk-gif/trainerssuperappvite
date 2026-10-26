import { expect } from "@playwright/test";
import { createAdmin, type LoopbackEnv } from "./sidakRealBackend";

/** Finalize returns before its fire-and-forget enqueue RPC commits. */
export async function waitForTelefunQueueEnqueue(
  env: LoopbackEnv,
  userId: string,
  sessionId: string,
) {
  await expect
    .poll(
      async () => {
        const { data, error } = await createAdmin(env)
          .from("telefun_history")
          .select("scoring_status, scoring_next_attempt_at, recording_status")
          .eq("user_id", userId)
          .eq("id", sessionId)
          .single();
        if (error) throw error;
        return {
          ...data,
          scheduled: data.scoring_next_attempt_at !== null,
          due:
            data.scoring_next_attempt_at !== null &&
            Date.parse(data.scoring_next_attempt_at) <= Date.now(),
        };
      },
      {
        message: `finalize must persist a due enqueue for ${sessionId}`,
        timeout: 5_000,
        intervals: [50, 100, 250],
      },
    )
    .toMatchObject({ scoring_status: "pending", scheduled: true, due: true });
}

/**
 * Execute the production query against real PostgREST, with fixture ownership
 * applied BEFORE its limit. This tests eligibility, not global queue fairness.
 * All production predicates/order/limit and returned rows remain unchanged.
 */
export async function fetchOwnedTelefunQueueJobs<
  Job extends { sessionId: string },
>(
  env: LoopbackEnv,
  userId: string,
  ids: string[],
  expectedIds: string[],
  fetchPendingJobs: (limit: number) => Promise<Job[]>,
): Promise<Job[]> {
  expect(ids.length, "nonempty fixture queue scope").toBeGreaterThan(0);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(expectedIds.every((id) => ids.includes(id))).toBe(true);
  const { data: owned, error } = await createAdmin(env)
    .from("telefun_history")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  expect(error, "read queue fixture ownership").toBeNull();
  expect(
    owned?.map((row) => row.id).sort(),
    "only run-owned queue IDs",
  ).toEqual([...ids].sort());

  const originalFetch = globalThis.fetch;
  let observedQuery: string | null = null;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/telefun_history" &&
      url.searchParams.get("scoring_status") ===
        "in.(pending,failed,processing)" &&
      url.searchParams.has("limit")
    ) {
      expect(observedQuery, "exactly one production queue query").toBeNull();
      expect(
        url.searchParams.has("id"),
        "no existing ID filter overwritten",
      ).toBe(false);
      expect(
        url.searchParams.has("user_id"),
        "no existing owner filter overwritten",
      ).toBe(false);
      url.searchParams.set("id", `in.(${ids.join(",")})`);
      url.searchParams.set("user_id", `eq.${userId}`);
      observedQuery = url.search;
      return originalFetch(new Request(url, request));
    }
    return originalFetch(request);
  };
  let jobs: Job[];
  try {
    // Keep a bounded real query; never increase the limit to escape old data.
    jobs = await fetchPendingJobs(ids.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(
    observedQuery,
    "production queue SELECT must be observed",
  ).not.toBeNull();
  const returnedIds = jobs.map((job) => job.sessionId).sort();
  if (JSON.stringify(returnedIds) !== JSON.stringify([...expectedIds].sort())) {
    const state = await createAdmin(env)
      .from("telefun_history")
      .select(
        "id, status, recording_status, recording_error, recording_path, agent_recording_path, scoring_status, scoring_next_attempt_at, scoring_ready_at, scoring_claimed_at, scoring_claim_owner",
      )
      .eq("user_id", userId)
      .in("id", ids);
    throw new Error(
      `Queue fixture admission mismatch before worker/gate: ${JSON.stringify({
        expectedIds,
        returnedIds,
        observedQuery,
        now: new Date().toISOString(),
        state: state.data,
        readError: state.error?.message,
      })}`,
    );
  }
  return jobs;
}

export async function waitForGate(
  entered: Promise<void>,
  label: string,
  work?: Promise<unknown>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      entered,
      ...(work
        ? [
            work.then((result) => {
              throw new Error(
                `${label}: work settled before fixture gate: ${JSON.stringify(result)}`,
              );
            }),
          ]
        : []),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} did not reach its fixture gate`)),
          15_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
