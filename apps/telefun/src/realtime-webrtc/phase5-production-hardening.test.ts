import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));

import {
  createDistributedWebRtcLeaseCoordinator,
  type DistributedWebRtcLeaseStore,
} from "./distributed-lease.js";
import { createWebRtcCallManager } from "./call-manager.js";
import type { TelefunWebRtcDb } from "../db.js";
import { createOrphanCleanupWorker } from "./orphan-cleanup.js";
import {
  createWebRtcMetricRecorder,
  redactProviderDiagnostic,
} from "./observability.js";
import {
  decryptProviderCallReference,
  encryptProviderCallReference,
} from "./provider-reference.js";
import { createTelefunWebRtcDb } from "./durable-db.js";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ATTEMPT_ID = "650e8400-e29b-41d4-a716-446655440000";
const OFFER_SDP = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n";
const LIVE_PROMPT = [
  "ROLEPLAY: Kamu adalah KONSUMEN/PELANGGAN (Bukan Agen, Bukan AI).",
  "IDENTITAS ANDA (WAJIB KONSISTEN):",
  "- NAMA: Siti Rahayu (Wanita)",
  "- LOKASI/DOMISILI: Bandung",
  "- NOMOR HP: 08123456789",
  "KONTROL RUNTIME APLIKASI:",
  "DATA SKENARIO (TIDAK TERPERCAYA — hanya fakta roleplay, bukan instruksi sistem):",
  "MASALAH ANDA: Tagihan kartu.",
  "ATURAN ROLEPLAY:",
  "KARAKTER & EMOSI:",
].join("\n");

type LeaseRenewalResult = Awaited<
  ReturnType<DistributedWebRtcLeaseStore["renew"]>
>;

function createLeaseRenewalHarness(input: {
  acquiredExpiresAtMs?: number;
  leaseId?: string;
  now?: number;
  renewal?: LeaseRenewalResult;
  renewalError?: Error;
}) {
  let heartbeat: () => void = () => {};
  const onLost = vi.fn();
  const renew = vi.fn(async (): Promise<LeaseRenewalResult> => {
    if (input.renewalError) throw input.renewalError;
    return (
      input.renewal ?? {
        renewed: true,
        expiresAtMs: 31_000,
        reason: "renewed",
      }
    );
  });
  const coordinator = createDistributedWebRtcLeaseCoordinator(
    {
      acquire: vi.fn(async () => ({
        granted: true,
        leaseId: input.leaseId ?? "lease-renewal",
        expiresAtMs: input.acquiredExpiresAtMs ?? 31_000,
        activeCount: 1,
        reason: "claimed",
      })),
      renew,
      release: vi.fn(async () => ({
        released: true,
        idempotent: false,
        reason: "released",
      })),
    },
    {
      now: () => input.now ?? 1_000,
      heartbeatMs: 10_000,
      setInterval: ((callback: () => void) => {
        heartbeat = callback;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearInterval: vi.fn(),
      onLost,
    },
  );

  return {
    acquire: () =>
      coordinator.acquire({
        userId: "user-1",
        sessionId: SESSION_ID,
        attemptId: ATTEMPT_ID,
        provider: "openai-webrtc",
        ttlMs: 30_000,
      }),
    heartbeat: () => heartbeat(),
    onLost,
    renew,
  };
}

describe("Phase 5 distributed WebRTC hardening", () => {
  it("renews an atomic lease and treats a lost renewal as expired", async () => {
    const store: DistributedWebRtcLeaseStore = {
      acquire: vi.fn(async () => ({
        granted: true,
        leaseId: "lease-1",
        expiresAtMs: 2_000,
        activeCount: 1,
        reason: "claimed",
      })),
      renew: vi
        .fn()
        .mockResolvedValueOnce({
          renewed: true,
          expiresAtMs: 3_000,
          reason: "renewed",
        })
        .mockResolvedValueOnce({
          renewed: false,
          expiresAtMs: 3_000,
          reason: "expired",
        }),
      release: vi.fn(async () => ({
        released: true,
        idempotent: false,
        reason: "released",
      })),
    };
    const onLost = vi.fn();
    const coordinator = createDistributedWebRtcLeaseCoordinator(store, {
      now: () => 1_000,
      heartbeatMs: 100,
      setInterval: ((callback: () => void) => {
        callback();
        callback();
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearInterval: vi.fn(),
      onLost,
    });

    const result = await coordinator.acquire({
      userId: "user-1",
      sessionId: SESSION_ID,
      attemptId: ATTEMPT_ID,
      provider: "openai-webrtc",
      ttlMs: 1_000,
    });

    expect(result.handle).not.toBeNull();
    expect(store.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sessionId: SESSION_ID,
        attemptId: ATTEMPT_ID,
        provider: "openai-webrtc",
        ttlMs: 1_000,
      }),
    );
    expect(store.renew).toHaveBeenCalledTimes(2);
    expect(onLost).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "expired" }),
    );
    expect(result.handle?.lost).toBe(true);
    await result.handle?.release("orphaned");
    expect(store.release).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "orphaned" }),
    );
  });

  it("reports a bounded RPC renewal error without exposing the raw exception", async () => {
    const harness = createLeaseRenewalHarness({
      leaseId: "lease-rpc-error",
      renewalError: new Error("Bearer sk-secret raw RPC payload"),
    });
    await harness.acquire();
    harness.heartbeat();
    await vi.waitFor(() => {
      expect(harness.onLost).toHaveBeenCalledWith(
        expect.objectContaining({
          leaseId: "lease-rpc-error",
          reason: "rpc_error",
        }),
      );
    });
    expect(JSON.stringify(harness.onLost.mock.calls)).not.toContain(
      "sk-secret",
    );
    expect(JSON.stringify(harness.onLost.mock.calls)).not.toContain(
      "raw RPC payload",
    );
  });

  it.each([
    "lease_not_found",
    "owner_mismatch",
    "inactive",
    "expired",
    "invalid_ttl",
  ])("preserves the closed renewal rejection reason %s", async (reason) => {
    const harness = createLeaseRenewalHarness({
      leaseId: `lease-${reason}`,
      renewal: { renewed: false, expiresAtMs: 31_000, reason },
    });
    await harness.acquire();
    harness.heartbeat();
    await vi.waitFor(() => {
      expect(harness.onLost).toHaveBeenCalledWith(
        expect.objectContaining({ reason }),
      );
    });
  });

  it("reports local expiry before issuing a renewal RPC", async () => {
    const harness = createLeaseRenewalHarness({
      acquiredExpiresAtMs: 1_000,
      leaseId: "lease-local-expiry",
      now: 1_000,
    });
    await harness.acquire();
    harness.heartbeat();
    expect(harness.renew).not.toHaveBeenCalled();
    expect(harness.onLost).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "local_expiry" }),
    );
  });

  it.each([
    {
      name: "invalid successful response",
      renewal: { renewed: true, reason: "renewed" },
      expected: "invalid_response",
    },
    {
      name: "unknown rejection reason",
      renewal: {
        renewed: false,
        expiresAtMs: 31_000,
        reason: "Bearer sk-secret raw rejection",
      },
      expected: "renewal_rejected",
    },
  ])("bounds $name as $expected", async ({ renewal, expected }) => {
    const harness = createLeaseRenewalHarness({ renewal });
    await harness.acquire();
    harness.heartbeat();
    await vi.waitFor(() => {
      expect(harness.onLost).toHaveBeenCalledWith(
        expect.objectContaining({ reason: expected }),
      );
    });
    expect(JSON.stringify(harness.onLost.mock.calls)).not.toContain(
      "sk-secret",
    );
  });

  it("requires an additive renewal repair migration with qualified columns", () => {
    const root = join(process.cwd(), "../../supabase");
    const migrationName = readdirSync(join(root, "migrations")).find((file) =>
      file.includes("fix_telefun_realtime_lease_renewal"),
    );
    expect(migrationName).toBeDefined();
    const rollbackName = `rollback_${migrationName}`;
    expect(readdirSync(join(root, "rollbacks"))).toContain(rollbackName);

    const migration = readFileSync(
      join(root, "migrations", migrationName!),
      "utf8",
    );
    const rollback = readFileSync(
      join(root, "rollbacks", rollbackName),
      "utf8",
    );
    for (const sql of [migration, rollback]) {
      expect(sql).toContain(
        "CREATE OR REPLACE FUNCTION public.renew_telefun_realtime_lease",
      );
      expect(sql).toContain("UPDATE public.telefun_realtime_leases AS lease");
      expect(sql).toContain("lease.expires_at > v_now");
      expect(sql).not.toContain("AND expires_at > v_now");
    }
    for (const reason of [
      "lease_not_found",
      "owner_mismatch",
      "inactive",
      "expired",
      "invalid_ttl",
      "renewed",
    ]) {
      expect(migration).toContain(`'${reason}'::text`);
    }
  });

  it("closes provider references after a restart and records orphaned outcome", async () => {
    const complete = vi.fn(async () => undefined);
    const closeProvider = vi.fn(
      async (callId: string) => callId === "rtc_restart",
    );
    const onOrphan = vi.fn();
    const worker = createOrphanCleanupWorker({
      store: {
        claim: vi.fn(async () => [
          {
            leaseId: "lease-restart",
            attemptId: ATTEMPT_ID,
            sessionId: SESSION_ID,
            userId: "user-1",
            provider: "openai-webrtc" as const,
            providerCallReference: "rtc_restart",
            sidebandConnected: true,
          },
        ]),
        complete,
      },
      closeProvider,
      closeSideband: vi.fn(async () => true),
      onOrphan,
      limit: 10,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });
    expect(closeProvider).toHaveBeenCalledWith("rtc_restart");
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseId: "lease-restart",
        attemptId: ATTEMPT_ID,
        outcome: "orphaned",
        providerClosed: true,
        sidebandClosed: true,
      }),
    );
    expect(onOrphan).toHaveBeenCalledWith({
      candidate: expect.objectContaining({ leaseId: "lease-restart" }),
      completed: true,
    });
  });

  it("keeps an orphan cleanup failure retryable instead of hiding provider close failure", async () => {
    const complete = vi.fn(async () => undefined);
    const worker = createOrphanCleanupWorker({
      store: {
        claim: vi.fn(async () => [
          {
            leaseId: "lease-retry",
            attemptId: ATTEMPT_ID,
            sessionId: SESSION_ID,
            userId: "user-1",
            provider: "openai-webrtc" as const,
            providerCallReference: "rtc_retry",
            sidebandConnected: true,
          },
        ]),
        complete,
      },
      closeProvider: vi.fn(async () => false),
      closeSideband: vi.fn(async () => true),
      limit: 10,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "orphaned",
        providerClosed: false,
        sidebandClosed: true,
      }),
    );
  });

  it("redacts provider diagnostics and bounds metric metadata", () => {
    expect(
      redactProviderDiagnostic(new Error("Bearer sk-secret provider SDP")),
    ).toEqual({
      code: "provider_error",
      message: "provider operation failed",
    });

    const sink = vi.fn();
    const recorder = createWebRtcMetricRecorder(sink);
    recorder.record({
      name: "missing_usage",
      provider: "openai-webrtc",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      sessionId: SESSION_ID,
      attemptId: ATTEMPT_ID,
      metadata: {
        safe: "ok",
        secret: "sk-secret",
        nested: { accessToken: "bearer-secret" },
      },
    });
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "missing_usage",
        userIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        metadata: { safe: "ok" },
      }),
    );
    const serializedMetric = JSON.stringify(sink.mock.calls[0]?.[0]);
    expect(serializedMetric).not.toContain("secret");
    expect(serializedMetric).not.toContain(
      "550e8400-e29b-41d4-a716-446655440001",
    );
  });

  it("stores provider call identifiers as opaque encrypted references", () => {
    const encrypted = encryptProviderCallReference(
      "rtc_provider_restart",
      "phase5-orphan-secret",
    );
    expect(encrypted).not.toContain("rtc_provider_restart");
    expect(
      decryptProviderCallReference(encrypted, "phase5-orphan-secret"),
    ).toBe("rtc_provider_restart");
    expect(
      decryptProviderCallReference(
        `${encrypted}tampered`,
        "phase5-orphan-secret",
      ),
    ).toBeNull();
  });

  it("uses server-only RPCs for lease, rate limit, orphan, and metric state", async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === "claim_telefun_realtime_lease") {
        return {
          data: {
            granted: true,
            lease_id: "lease-1",
            expires_at: "2026-08-01T00:00:01.000Z",
            active_count: 1,
            reason: "claimed",
          },
          error: null,
        };
      }
      if (functionName === "renew_telefun_realtime_lease") {
        return {
          data: {
            renewed: true,
            expires_at: "2026-08-01T00:00:02.000Z",
            reason: "renewed",
          },
          error: null,
        };
      }
      if (functionName === "release_telefun_realtime_lease") {
        return {
          data: { released: true, idempotent: false, reason: "released" },
          error: null,
        };
      }
      if (functionName === "consume_telefun_realtime_rate_limit") {
        return {
          data: {
            allowed: true,
            remaining: 3,
            reset_at: "2026-08-01T00:01:00.000Z",
            reason: "allowed",
          },
          error: null,
        };
      }
      if (functionName === "claim_telefun_realtime_orphans") {
        return { data: [], error: null };
      }
      if (functionName === "record_telefun_realtime_metric") {
        return { data: { recorded: true, reason: "recorded" }, error: null };
      }
      throw new Error(`unexpected rpc ${functionName}`);
    });
    const db = createTelefunWebRtcDb({ rpc, from: vi.fn() });

    await expect(
      db.acquireLease?.({
        userId: "user-1",
        sessionId: SESSION_ID,
        attemptId: ATTEMPT_ID,
        provider: "openai-webrtc",
        leaseTokenHash: "a".repeat(64),
        ttlMs: 1_000,
        maxUserSessions: 1,
        maxProviderSessions: 2,
      }),
    ).resolves.toMatchObject({ granted: true, leaseId: "lease-1" });
    await expect(
      db.consumeRateLimit?.({
        scopeKey: "user:user-1:provider:openai-webrtc",
        userId: "user-1",
        provider: "openai-webrtc",
        windowSeconds: 60,
        requestLimit: 10,
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 3 });
    await expect(db.claimOrphans?.(10)).resolves.toEqual([]);
    await expect(
      db.recordMetric?.({
        name: "session_cap",
        provider: "openai-webrtc",
        metadata: { reason: "cap" },
      }),
    ).resolves.toMatchObject({ recorded: true });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_telefun_realtime_lease",
      "consume_telefun_realtime_rate_limit",
      "claim_telefun_realtime_orphans",
      "record_telefun_realtime_metric",
    ]);
  });

  it("creates the durable attempt before asking the distributed lease authority", async () => {
    const events: string[] = [];
    const attempt = {
      claimed: true,
      attemptId: ATTEMPT_ID,
      finalizationKey: "750e8400-e29b-41d4-a716-446655440000",
      usageRequestId:
        `telefun-webrtc:${ATTEMPT_ID}` as `telefun-webrtc:${string}`,
      state: "claimed" as const,
      reason: "claimed",
    };
    const db = {
      claimAttempt: vi.fn(async () => {
        events.push("attempt");
        return attempt;
      }),
      bindProviderCall: vi.fn(async () => ({
        accepted: true,
        state: "brokered" as const,
        reason: "bound",
      })),
      markSidebandConnected: vi.fn(async () => ({
        accepted: true,
        state: "sideband_connected" as const,
        reason: "connected",
      })),
      checkpointTranscript: vi.fn(),
      beginFinalization: vi.fn(async () => ({
        accepted: true,
        shouldFinalize: true,
        state: "ending" as const,
        reason: "ready_to_finalize",
      })),
      markUsage: vi.fn(async () => ({
        applied: true,
        idempotent: false,
        usageRequestId: attempt.usageRequestId,
        status: "incomplete" as const,
        reason: "missing_usage",
      })),
      finalizeAttempt: vi.fn(async () => ({
        applied: true,
        idempotent: false,
        reason: "finalized",
      })),
    } as unknown as TelefunWebRtcDb;
    const lease = {
      acquire: vi.fn(async () => {
        events.push("lease");
        return {
          handle: {
            leaseId: "lease-order",
            attemptId: ATTEMPT_ID,
            tokenHash: "a".repeat(64),
            expiresAtMs: Date.now() + 30_000,
            lost: false,
            whenLost: new Promise<void>(() => undefined),
            renew: vi.fn(async () => true),
            release: vi.fn(async () => undefined),
          },
          activeCount: 1,
          reason: "claimed",
        };
      }),
    };
    const manager = createWebRtcCallManager({
      db,
      lease,
      createAttemptId: () => ATTEMPT_ID,
      callsClient: {
        createCall: vi.fn(async () => ({
          answerSdp: OFFER_SDP,
          callId: "rtc_order",
        })),
        closeCall: vi.fn(async () => true),
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission: vi.fn(),
        drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
        close: vi.fn(),
      })),
    });

    await manager.startCall({
      userId: "user-1",
      sessionId: SESSION_ID,
      offerSdp: OFFER_SDP,
      livePromptInstructions: LIVE_PROMPT,
    });
    expect(events).toEqual(["attempt", "lease"]);
    await manager.endCall(SESSION_ID, "user-1");
  });

  it("terminalizes the provider call when the distributed lease is lost", async () => {
    let loseLease: () => void = () => {};
    const whenLost = new Promise<void>((resolve) => {
      loseLease = resolve;
    });
    const release = vi.fn(async () => undefined);
    const beginFinalization = vi.fn(async () => ({
      accepted: true,
      shouldFinalize: true,
      state: "ending" as const,
      reason: "ready_to_finalize",
    }));
    const finalizeAttempt = vi.fn(async () => ({
      applied: true,
      idempotent: false,
      reason: "finalized",
    }));
    const db = {
      claimAttempt: vi.fn(async () => ({
        claimed: true,
        attemptId: ATTEMPT_ID,
        finalizationKey: "750e8400-e29b-41d4-a716-446655440000",
        usageRequestId:
          `telefun-webrtc:${ATTEMPT_ID}` as `telefun-webrtc:${string}`,
        state: "claimed" as const,
        reason: "claimed",
      })),
      bindProviderCall: vi.fn(async () => ({
        accepted: true,
        state: "brokered" as const,
        reason: "bound",
      })),
      markSidebandConnected: vi.fn(async () => ({
        accepted: true,
        state: "sideband_connected" as const,
        reason: "connected",
      })),
      checkpointTranscript: vi.fn(),
      beginFinalization,
      markUsage: vi.fn(async () => ({
        applied: true,
        idempotent: false,
        usageRequestId: `telefun-webrtc:${ATTEMPT_ID}`,
        status: "incomplete" as const,
        reason: "missing_usage",
      })),
      finalizeAttempt,
    } as unknown as TelefunWebRtcDb;
    const closeCall = vi.fn(async () => true);
    const manager = createWebRtcCallManager({
      db,
      lease: {
        acquire: vi.fn(async () => ({
          handle: {
            leaseId: "lease-lost",
            attemptId: ATTEMPT_ID,
            tokenHash: "a".repeat(64),
            expiresAtMs: Date.now() + 30_000,
            lost: false,
            whenLost,
            renew: vi.fn(async () => true),
            release,
          },
          activeCount: 1,
          reason: "claimed",
        })),
      },
      createAttemptId: () => ATTEMPT_ID,
      callsClient: {
        createCall: vi.fn(async () => ({
          answerSdp: OFFER_SDP,
          callId: "rtc_lease_lost",
        })),
        closeCall,
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission: vi.fn(),
        drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
        close: vi.fn(),
      })),
    });

    await manager.startCall({
      userId: "user-1",
      sessionId: SESSION_ID,
      offerSdp: OFFER_SDP,
      livePromptInstructions: LIVE_PROMPT,
    });
    loseLease();

    await vi.waitFor(() => {
      expect(finalizeAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "network_lost" }),
      );
    });
    expect(closeCall).toHaveBeenCalledWith("rtc_lease_lost");
    expect(release).toHaveBeenCalledWith("network_lost");
  });

  it("blocks a broker start when the distributed user/session/provider limit is exhausted", async () => {
    const consumeRateLimit = vi.fn(async () => ({
      allowed: false,
      remaining: 0,
      resetAt: "2026-08-01T00:01:00.000Z",
      reason: "rate_limited",
    }));
    const createCall = vi.fn();
    const manager = createWebRtcCallManager({
      db: { consumeRateLimit } as unknown as TelefunWebRtcDb,
      callsClient: { createCall },
      createSideband: vi.fn(),
    });

    await expect(
      manager.startCall({
        userId: "user-1",
        sessionId: SESSION_ID,
        offerSdp: OFFER_SDP,
        livePromptInstructions: LIVE_PROMPT,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(createCall).not.toHaveBeenCalled();
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: `user:user-1:session:${SESSION_ID}:provider:openai-webrtc:call-start`,
        userId: "user-1",
        sessionId: SESSION_ID,
        provider: "openai-webrtc",
      }),
    );
  });

  it("does not leave a local binding after a pre-attempt rate-limit rejection", async () => {
    const consumeRateLimit = vi.fn(async () => ({
      allowed: false,
      remaining: 0,
      resetAt: "2026-08-01T00:01:00.000Z",
      reason: "rate_limited",
    }));
    const manager = createWebRtcCallManager({
      db: { consumeRateLimit } as unknown as TelefunWebRtcDb,
      callsClient: { createCall: vi.fn() },
      createSideband: vi.fn(),
    });

    await expect(
      manager.startCall({
        userId: "user-1",
        sessionId: SESSION_ID,
        offerSdp: OFFER_SDP,
        livePromptInstructions: LIVE_PROMPT,
      }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      manager.startCall({
        userId: "user-1",
        sessionId: SESSION_ID,
        offerSdp: OFFER_SDP,
        livePromptInstructions: LIVE_PROMPT,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(consumeRateLimit).toHaveBeenCalledTimes(2);
  });

  it("ships one additive migration and a rollback artifact for Phase 5", () => {
    const root = join(process.cwd(), "../../supabase");
    const migrations = readdirSync(join(root, "migrations"));
    const phase5 = migrations.find((file) =>
      file.includes("phase5_production_hardening"),
    );
    expect(phase5).toBeDefined();
    const migration = readFileSync(join(root, "migrations", phase5!), "utf8");
    const rollback = readFileSync(
      join(root, "rollbacks", `rollback_${phase5}`),
      "utf8",
    );
    const claimLeaseStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_lease",
    );
    const renewLeaseStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.renew_telefun_realtime_lease",
    );
    const claimLeaseBody = migration.slice(claimLeaseStart, renewLeaseStart);
    expect(claimLeaseBody).not.toContain("SET state = 'orphaned'");
    expect(migration).toContain("l.expires_at <= clock_timestamp()");
    for (const contract of [
      "claim_telefun_realtime_lease",
      "renew_telefun_realtime_lease",
      "consume_telefun_realtime_rate_limit",
      "claim_telefun_realtime_orphans",
      "record_telefun_realtime_metric",
      "network_lost",
      "orphaned",
      "telefun-webrtc:provider:",
      "lease_id = v_id",
      "cleanup_incomplete",
      "state = 'active'",
      "sideband_disconnect_count = sideband_disconnect_count + 1",
      "user_id_hash",
      "search_path = ''",
      "service_role",
    ]) {
      expect(migration).toContain(contract);
    }
    expect(rollback).toContain("DROP FUNCTION");
    expect(rollback).toContain("telefun_realtime_leases");
  });
});
