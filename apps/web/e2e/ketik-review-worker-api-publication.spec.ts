import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { runSql } from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  env,
  db,
  trainer,
  app,
  guarded,
  suite,
  releaseProvider,
  workerLog,
  setupKetikReviewWorkerSuite,
  teardownKetikReviewWorkerSuite,
  seedSession,
  request,
  job,
  embedded,
  startWorker,
  stopWorker,
  resetKetikReviewWorkerTest,
  cleanupKetikReviewWorkerTest,
} from "./helpers/ketikReviewWorkerApiHarness";

test.beforeAll(setupKetikReviewWorkerSuite);

test.afterAll(teardownKetikReviewWorkerSuite);

test.beforeEach(resetKetikReviewWorkerTest);

test.afterEach(cleanupKetikReviewWorkerTest);

test("score explanations preserve real evidence and disclose missing or fabricated evidence", async () => {
  suite.providerMode = "success";
  suite.guidancePayload = [
    {
      key: "empathy",
      diagnosis:
        "Sapaan sopan, tetapi belum mengakui kekhawatiran konsumen sehingga empati belum maksimal.",
      howToFix: "Validasi perasaan sebelum menjawab.",
      exampleRewrite: "Saya paham kekhawatirannya, saya bantu cek.",
      evidence: [{ messageId: "wrong-id", quote: "Selamat pagi" }],
    },
    {
      key: "probing",
      diagnosis: "Kronologi belum digali.",
      howToFix: "Tanyakan kronologi.",
      exampleRewrite: "Kapan kendala mulai terjadi?",
      evidence: [{ messageId: "m1", quote: "kutipan yang tidak ada" }],
    },
    {
      key: "typo",
      diagnosis: "",
      howToFix: "Baca ulang.",
      exampleRewrite: "Selamat pagi.",
      evidence: [{ messageId: "m1", quote: "Selamat pagi" }],
    },
  ];
  const id = await seedSession();
  expect((await request("/review", trainer, { sessionId: id })).status).toBe(
    202,
  );
  await startWorker();
  await expect
    .poll(async () => (await job(id)).status, { timeout: 20_000 })
    .toBe("completed");
  const response = await request(`/review/${id}`);
  expect(response.status).toBe(200);
  const detail = (await response.json()).data;
  expect(detail.scores).toEqual({
    final: 80,
    empathy: 80,
    probing: 80,
    resolution: 80,
    typo: 80,
    compliance: 80,
  });
  // Tata Tulis hanya menilai agen; gaya ekspresif konsumen bukan typo agen.
  const reviewPrompt = JSON.stringify(suite.boundaryRequests[0]);
  expect(reviewPrompt).toContain("Nilai Tata Tulis HANYA dari pesan Agen");
  expect(reviewPrompt).toContain("logat daerah");
  expect(reviewPrompt).toContain("bukan kesalahan agen");
  const guidance = detail.review.education.dimensionGuidance;
  expect(
    guidance.find((item: { key: string }) => item.key === "empathy"),
  ).toMatchObject({
    source: "transcript",
    evidence: [{ messageId: "m1", quote: "Selamat pagi" }],
    diagnosis: expect.stringContaining("belum mengakui"),
  });
  for (const key of ["probing", "resolution", "typo", "compliance"]) {
    expect(
      guidance.find((item: { key: string }) => item.key === key),
    ).toMatchObject({
      source: "general",
      evidence: [],
      diagnosis: expect.stringContaining("belum tersedia"),
    });
  }
  const legacy = await seedSession(trainer.userId, true);
  const old = (await request(`/review/${legacy}`).then((r) => r.json())).data;
  expect(
    old.review.education.dimensionGuidance.every(
      (item: { source: string }) => item.source === "general",
    ),
  ).toBe(true);
  await test.info().attach("review-evidence-response", {
    body: JSON.stringify({
      scores: detail.scores,
      education: detail.review.education,
    }),
    contentType: "application/json",
  });
});

test("manual POST returns accepted before AI and only enqueues without a running worker", async () => {
  const sessionId = await seedSession();
  let response: Response | undefined;
  const pending = tnaApiRequest(app, "http://localhost/api/v1/ketik/review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, requestId: randomUUID() }),
  }).then((value) => {
    response = value;
    return value;
  });
  try {
    await expect.poll(() => response?.status, { timeout: 1500 }).toBe(202);
    expect(suite.providerCalls).toBe(0);
    expect(
      (
        await db
          .from("ketik_review_jobs")
          .select("status")
          .eq("session_id", sessionId)
          .single()
      ).data?.status,
    ).toBe("queued");
  } finally {
    releaseProvider();
    await pending;
    await db.from("ketik_history").delete().eq("id", sessionId);
  }
});

test("a real worker claims once, publishes scores/review atomically and never reviews an unrequested session", async () => {
  const id = await seedSession();
  const untouched = await seedSession();
  const requestId = randomUUID();
  const replies = await Promise.all([
    request("/review", trainer, { sessionId: id, requestId }),
    request("/review", trainer, { sessionId: id, requestId }),
  ]);
  expect(replies.map((r) => r.status)).toEqual([202, 202]);
  expect((await job(id)).attempt_count).toBe(0);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("queued");
  await startWorker();
  await expect.poll(() => suite.providerCalls).toBe(1);
  expect((await job(id)).status).toBe("processing");
  expect(
    (
      await request("/review", trainer, {
        sessionId: id,
        requestId: randomUUID(),
        rerun: true,
      })
    ).status,
  ).toBe(202);
  const before = (await request(`/review/status/${id}`).then((r) => r.json()))
    .data;
  expect(before).toMatchObject({ status: "processing", resultReady: false });
  releaseProvider();
  suite.providerMode = "success";
  await expect.poll(async () => (await job(id)).status).toBe("completed");
  const detail = (await request(`/review/${id}`).then((r) => r.json())).data;
  expect(detail.review.aiSummary).toBe("Local review");
  expect(detail.scores.final).toBe(80);
  expect(
    (await request("/review", trainer, { sessionId: id, requestId })).status,
  ).toBe(200);
  expect((await job(id)).attempt_count).toBe(1);
  expect(suite.providerCalls).toBe(1);
  const usage = await db
    .from("ai_usage_logs")
    .select("user_id,module,action,output_tokens")
    .eq("user_id", trainer.userId);
  expect(usage.error).toBeNull();
  // Google bills thinking tokens as output, so they are logged with the answer tokens.
  expect(usage.data).toContainEqual(
    expect.objectContaining({
      user_id: trainer.userId,
      module: "ketik",
      action: "coaching_review",
      output_tokens: 25,
    }),
  );
  // The loopback health server exists only on the standalone host.
  if (!embedded()) {
    const port = Number(workerLog.match(/"healthPort":(\d+)/)?.[1]);
    const health = await guarded(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    const payload = await health.json();
    expect(payload.healthy).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(
      [
        "active",
        "errorClass",
        "healthy",
        "lastSuccessfulPollAt",
        "loopAlive",
        "stopping",
      ].sort(),
    );
  }
  expect(await job(untouched)).toBeNull();
  expect(
    (
      suite.boundaryRequests[0] as {
        contents: Array<{ parts: Array<{ text: string }> }>;
      }
    ).contents[0].parts[0].text,
  ).toContain("Selamat pagi");
});

test("SIGKILL leaves a reclaimable lease; restart fences the previous token", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => suite.providerCalls).toBe(1);
  const old = await job(id);
  await stopWorker("SIGKILL");
  expect(
    (
      await db
        .from("ketik_review_jobs")
        .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("session_id", id)
    ).error,
  ).toBeNull();
  await startWorker();
  await expect.poll(() => suite.providerCalls).toBe(2);
  expect((await job(id)).attempt_count).toBe(2);
  const stale = await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: old.lease_token,
    p_release: true,
  });
  expect(stale.error).toBeNull();
  expect(stale.data).toBe(false);
  expect((await job(id)).status).toBe("processing");
  suite.providerMode = "success";
  releaseProvider();
  await expect.poll(async () => (await job(id)).status).toBe("completed");
});

test("provider failure exhausts three attempts and exposes only a safe terminal error", async () => {
  suite.providerMode = "fail";
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect
    .poll(async () => (await job(id)).status, { timeout: 20_000 })
    .toBe("failed");
  expect((await job(id)).attempt_count).toBe(3);
  expect(suite.providerCalls).toBe(6);
  const status = (await request(`/review/status/${id}`).then((r) => r.json()))
    .data;
  expect(status).toMatchObject({
    status: "failed",
    resultReady: false,
    previousKept: false,
  });
  expect(JSON.stringify(status)).not.toContain(
    "private-worker-provider-sentinel",
  );
});

test("failure during rerun publication rolls back review, typos, scores and completion; explicit retry can replace them", async () => {
  suite.providerMode = "success";
  const id = await seedSession(trainer.userId, true);
  const old = (await request(`/review/${id}`).then((r) => r.json())).data;
  const fn = `ketik_publish_fail_${id.replaceAll("-", "")}`;
  runSql(
    env,
    `CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id}' AND NEW.final_score=80 THEN RAISE EXCEPTION 'private-publication-sentinel'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${fn} BEFORE UPDATE ON public.ketik_history FOR EACH ROW EXECUTE FUNCTION public.${fn}();`,
  );
  try {
    await request("/review", trainer, { sessionId: id, rerun: true });
    await startWorker();
    await expect
      .poll(async () => (await job(id)).status, { timeout: 20_000 })
      .toBe("failed");
    const kept = (await request(`/review/${id}`).then((r) => r.json())).data;
    expect(kept.review.id).toBe(old.review.id);
    expect(kept.review.aiSummary).toBe("Previous review");
    expect(kept.scores.final).toBe(60);
    expect(kept.typos).toEqual(old.typos);
    const status = (await request(`/review/status/${id}`).then((r) => r.json()))
      .data;
    expect(status).toMatchObject({
      status: "failed",
      resultReady: true,
      previousKept: true,
    });
    // The status already carries the kept result, so opening Telaah needs no
    // second read of the same review.
    expect(status.detail).toEqual(kept);
    expect(
      (
        await db
          .from("ketik_history")
          .select("review_status")
          .eq("id", id)
          .single()
      ).data?.review_status,
    ).toBe("completed");
  } finally {
    runSql(
      env,
      `DROP TRIGGER IF EXISTS ${fn} ON public.ketik_history; DROP FUNCTION IF EXISTS public.${fn}();`,
    );
  }
  await request("/review", trainer, { sessionId: id, rerun: true });
  await expect.poll(async () => (await job(id)).status).toBe("completed");
  expect(
    (await request(`/review/${id}`).then((r) => r.json())).data.scores.final,
  ).toBe(80);
});

test("SIGTERM stops admission and fences an unfinished provider before restart", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => suite.providerCalls).toBe(1);
  await stopWorker();
  expect((await job(id)).status).toBe("queued");
  expect((await job(id)).lease_token).toBeNull();
  expect(
    (await db.from("ketik_session_reviews").select("id").eq("session_id", id))
      .data,
  ).toEqual([]);
  suite.providerMode = "success";
  releaseProvider();
  await startWorker();
  await expect
    .poll(async () => (await job(id)).status, { timeout: 10_000 })
    .toBe("completed");
});

for (const scenario of [
  "valid",
  "not_asked",
  "unconfirmed",
  "confirmed",
  "city_only",
  "consumer_id",
  "missing_id",
  "mixed",
  "legacy",
] as const) {
  test(`identity verification review: ${scenario}`, async () => {
    suite.providerMode = "success";
    const id = await seedSession();
    const messages = [
      {
        id: "a1",
        sender: "agent",
        text: "Mohon NIK, email, dan kota Anda.",
        timestamp: new Date().toISOString(),
      },
      {
        id: "c1",
        sender: "consumer",
        text: "327301010190000, latihan@gnail.com, Jakarta",
        timestamp: new Date().toISOString(),
      },
      {
        id: "a2",
        sender: "agent",
        text: "Mohon konfirmasi NIK 16 digit, apakah emailnya gmail.com, dan kota administrasi Jakarta yang mana?",
        timestamp: new Date().toISOString(),
      },
      {
        id: "c2",
        sender: "consumer",
        text: "Saya tidak bersedia menjawab.",
        timestamp: new Date().toISOString(),
      },
      {
        id: "a3",
        sender: "agent",
        text: "Baik, saya bantu cek keluhannya.",
        timestamp: new Date().toISOString(),
      },
    ];
    const valid = scenario === "valid";
    // Sessions finished before NIK/email existed: no verification rule applies,
    // even for a bare "Jakarta" domicile.
    const legacy = scenario === "legacy";
    const notAsked = scenario === "not_asked";
    const cityOnly = scenario === "city_only";
    const transcript = notAsked ? [messages[4]] : messages;
    expect(
      (
        await db
          .from("ketik_history")
          .update({
            consumer_city: valid ? "Bandung" : "Jakarta",
            consumer_nik: legacy
              ? null
              : valid || cityOnly
                ? "3273010101900000"
                : "327301010190000",
            consumer_email: legacy
              ? null
              : valid || cityOnly
                ? "latihan@gmail.com"
                : "latihan@gnail.com",
            messages: transcript,
          })
          .eq("id", id)
      ).error,
    ).toBeNull();
    suite.verificationPayload = {
      fields: ["nik", "email", "city"].map((field) => ({
        field,
        value: "AI must not overwrite server data",
        reason: "fabricated",
        status: notAsked
          ? "not_asked"
          : scenario === "unconfirmed" ||
              (scenario === "mixed" && field === "email")
            ? "unconfirmed"
            : "confirmed",
        agentMessageId:
          scenario === "consumer_id"
            ? "c1"
            : scenario === "missing_id"
              ? "invented"
              : "a2",
      })),
    };
    expect((await request("/review", trainer, { sessionId: id })).status).toBe(
      202,
    );
    await startWorker();
    await expect
      .poll(async () => (await job(id)).status, { timeout: 20_000 })
      .toBe("completed");
    const detail = (await (await request(`/review/${id}`)).json()).data;
    const prompt = JSON.stringify(suite.boundaryRequests[0]);
    if (valid || legacy) {
      expect(prompt).not.toContain("verificationContext");
      expect(detail.review.education.verification ?? null).toBeNull();
      expect(detail.scores.probing).toBe(80);
    } else {
      expect(prompt).toContain("verificationContext");
      expect(prompt).toContain("latihan@gnail.com");
      const verification = detail.review.education.verification;
      const confirmed = scenario === "confirmed" || cityOnly;
      expect(verification.status).toBe(
        confirmed ? "confirmed" : notAsked ? "not_asked" : "unconfirmed",
      );
      expect(
        verification.fields.map((field: { field: string }) => field.field),
      ).toEqual(cityOnly ? ["city"] : ["nik", "email", "city"]);
      expect(verification.fields[0]).toMatchObject(
        cityOnly
          ? {
              value: "Jakarta",
              reason: "Jakarta tanpa kota administrasinya",
            }
          : {
              value: "327301010190000",
              reason: "15 digit, harus 16",
            },
      );
      expect(JSON.stringify(verification)).not.toContain("fabricated");
      if (scenario === "consumer_id" || scenario === "missing_id") {
        expect(
          verification.fields.every(
            (field: { agentMessageId: string | null }) =>
              field.agentMessageId === null,
          ),
        ).toBe(true);
      }
      expect(verification.missedBeforeMessageId).toBe(
        confirmed ? null : notAsked ? "a3" : "a2",
      );
      expect(detail.scores.probing).toBe(confirmed ? 80 : 60);
      expect(detail.scores.final).toBe(confirmed ? 80 : 76);
      const notes = detail.review.education.agentNotes.filter(
        (note: { dimension: string; verdict: string }) =>
          note.dimension === "probing" && note.verdict === "fix",
      );
      expect(notes).toHaveLength(confirmed ? 0 : 1);
      if (!confirmed) expect(notes[0].example).toContain("konfirmasi");
    }
    await test.info().attach(`verification-${scenario}`, {
      body: JSON.stringify({
        prompt: suite.boundaryRequests[0],
        result: detail,
      }),
      contentType: "application/json",
    });
  });
}
