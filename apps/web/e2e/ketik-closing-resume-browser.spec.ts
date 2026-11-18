import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createAdmin } from "./helpers/sidakRealBackend";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  E2E_SUPABASE_STORAGE_KEY,
  E2E_SUPABASE_URL,
} from "./helpers/e2eTargets";
import { APP_ORIGIN } from "./helpers/hermeticShell";
import { tnaApiRequest } from "./helpers/tnaApi";

test("real JWT reload recovers a processing, failed and held goodbye", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_KETIK_LIVE !== "1",
    "Requires an explicitly selected disposable loopback Supabase.",
  );
  test.setTimeout(90000); // Real auth, two reloads and two polling cycles; assertions stay bounded.
  await assertLocalDevOnlyTarget();
  // The harness pins loopback env before dynamically loading the real Hono app.
  const harness = await import("./helpers/ketikSessionApiHarness");
  await harness.setupKetikSessionSuite();
  const { env, trainer, suite, api, app, guardedFetch } = harness;
  const db = createAdmin(env);
  let release = () => {};
  let closing: Promise<Response> | undefined;
  try {
    // Use a genuine Supabase session in the browser, not mockAuth's fake token.
    const password = randomUUID();
    expect(
      (await db.auth.admin.updateUserById(trainer.userId, { password })).error,
    ).toBeNull();
    const signed = await createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email: trainer.email, password });
    expect(signed.error).toBeNull();
    const auth = signed.data.session!;
    trainer.token = auth.access_token;
    const session = await harness.start();
    expect(
      (
        await api(trainer, `/sessions/${session.id}/messages`, "POST", {
          requestId: randomUUID(),
          expectedAgentVersion: 0,
          text: "Ada yang bisa dibantu?",
        })
      ).status,
    ).toBe(200);
    suite.providerText = "Tagihan saya ganda.";
    expect((await harness.respondAndReveal(session.id, 1)).status).toBe(200);
    expect(
      (
        await db
          .from("ketik_sessions")
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq("id", session.id)
      ).error,
    ).toBeNull();

    await page.addInitScript(
      ({ key, auth }) => localStorage.setItem(key, JSON.stringify(auth)),
      { key: E2E_SUPABASE_STORAGE_KEY, auth },
    );
    const blocked: string[] = [];
    const browserResponses: unknown[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === APP_ORIGIN && !url.pathname.startsWith("/api/"))
        return route.continue();
      if (
        url.origin === new URL(E2E_SUPABASE_URL).origin &&
        ["/auth/v1/user", "/rest/v1/profiles"].includes(url.pathname)
      ) {
        const response = await guardedFetch(
          new URL(url.pathname + url.search, env.apiUrl),
          { headers: { ...request.headers(), apikey: env.anonKey } },
        );
        return route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      }
      if (url.origin === APP_ORIGIN && url.pathname.startsWith("/api/v1/")) {
        if (request.method() === "POST" && url.pathname.endsWith("/respond"))
          browserResponses.push(request.postDataJSON());
        const response = await tnaApiRequest(
          app,
          `http://localhost${url.pathname}${url.search}`,
          {
            method: request.method(),
            headers: request.headers(),
            ...(request.postData() ? { body: request.postData()! } : {}),
          },
        );
        return route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      }
      if (
        ![
          "fonts.googleapis.com",
          "fonts.gstatic.com",
          "randomuser.me",
        ].includes(url.hostname)
      )
        blocked.push(url.hostname);
      return route.abort(); // No external asset/provider traffic from the browser.
    });

    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    suite.providerGate = async () => {
      entered();
      await gate;
    };
    suite.failProvider = true;
    const requestId = randomUUID();
    closing = api(trainer, `/sessions/${session.id}/respond`, "POST", {
      requestId,
    });
    await started;
    const calls = suite.providerCalls;
    await page.goto(`${APP_ORIGIN}/ketik?sesi=${session.id}&tahap=chat`);
    const room = page.getByRole("region", { name: "Ruang chat" });
    const typing = room.getByRole("status", {
      name: "Konsumen sedang mengetik",
    });
    await expect(typing).toBeVisible({ timeout: 20000 });
    await page.reload();
    await expect(room).toBeVisible({ timeout: 20000 }); // Real auth/session reads after reload.
    await expect(typing).toBeVisible();
    expect(browserResponses).toEqual([]);
    expect(suite.providerCalls).toBe(calls);

    release();
    expect((await closing).status).toBe(502);
    suite.providerGate = null;
    await expect(room.getByRole("alert")).toContainText(
      "Balasan konsumen belum tersedia",
      { timeout: 10000 },
    );
    const failedCalls = suite.providerCalls;
    await page.reload();
    await expect(room).toBeVisible({ timeout: 20000 });
    await expect(room.getByRole("alert")).toContainText(
      "Balasan konsumen belum tersedia",
    );
    await page.clock.install();
    await page.clock.runFor(3000); // Traverses expiry scheduling and a recovery polling interval.
    expect(browserResponses).toEqual([]);
    expect(suite.providerCalls).toBe(failedCalls);

    suite.failProvider = false;
    suite.providerText =
      "Saya ada urusan dulu, nanti saya hubungi lagi ya kak.";
    const held = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/respond"),
    );
    await room.getByRole("button", { name: "Coba minta balasan lagi" }).click();
    expect((await (await held).json()).data.pendingResponse).toMatchObject({
      requestId,
      status: "held",
      closing: true,
    });
    const goodbye = room.getByText(suite.providerText, { exact: true });
    await expect(goodbye).toHaveCount(0);
    await page.reload();
    await expect(room).toBeVisible({ timeout: 20000 });
    await expect(goodbye).toHaveCount(0);
    await page.clock.runFor(3500);
    await expect(goodbye).toBeVisible({ timeout: 10000 });
    await expect(
      room.getByText(/Konsumen telah mengakhiri chat/),
    ).toBeVisible();
    await expect(room.getByRole("alert")).toHaveCount(0);
    expect(browserResponses).toEqual([{ requestId }]);
    expect(suite.providerCalls).toBe(failedCalls + 1);
    await page.screenshot({
      path: test.info().outputPath("closing-resume-retry.png"),
    });
    expect(blocked).toEqual([]);
  } finally {
    suite.providerGate = null;
    suite.failProvider = false;
    release();
    if (closing) await closing;
    await harness.teardownKetikSessionSuite();
  }
});
