import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  createAdmin,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  E2E_SUPABASE_STORAGE_KEY,
  E2E_SUPABASE_URL,
} from "./helpers/e2eTargets";
import { APP_ORIGIN } from "./helpers/hermeticShell";
import { tnaApiRequest } from "./helpers/tnaApi";

test("real JWT browser chat persists exactly the displayed transcript through Hono and local DB", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_KETIK_LIVE !== "1",
    "Opt in with E2E_KETIK_LIVE=1; requires disposable loopback Supabase.",
  );
  test.setTimeout(60_000); // Auth setup + two chat turns, recovery/reload and a manual review.
  await assertLocalDevOnlyTarget();
  const env = readLoopbackEnv();
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  const guarded = globalThis.fetch;
  let calls = 0;
  let reviewCalls = 0;
  let reviewTranscript: unknown;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.openai.com" && url.pathname === "/v1/responses") {
      calls++;
      if (calls === 1)
        return Response.json(
          { error: { message: "local-private-provider-failure" } },
          { status: 400 },
        );
      return Response.json({
        id: "browser-local",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text:
                  calls === 2
                    ? "Tagihan saya ganda."
                    : "Nomornya 123, mohon dibantu.",
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      reviewCalls++;
      const payload = JSON.parse(await new Request(input, init).text());
      const prompt = payload.contents[0].parts[0].text as string;
      const block = prompt.match(
        /<transcript_data>\n([\s\S]*)\n<\/transcript_data>/,
      );
      expect(block).not.toBeNull();
      reviewTranscript = JSON.parse(block![1]);
      return Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  text: JSON.stringify({
                    scores: {
                      empathy: 80,
                      probing: 70,
                      resolution: 75,
                      typo: 90,
                      compliance: 85,
                      final: 80,
                    },
                    summary: "Agen membantu konsumen.",
                    strengths: ["Sapaan jelas"],
                    weaknesses: ["Probing"],
                    coachingFocus: ["Verifikasi"],
                  }),
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      });
    }
    return guarded(input, init);
  };
  const db = createAdmin(env);
  let userId: string | undefined;
  try {
    const password = randomUUID();
    const email = `ketik-live-${randomUUID()}@local.test`;
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    expect(
      (
        await db.from("profiles").upsert({
          id: userId,
          email,
          full_name: "Trainer live",
          role: "trainer",
          status: "active",
          is_deleted: false,
        })
      ).error,
    ).toBeNull();
    const signed = await createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email, password });
    expect(signed.error).toBeNull();
    const auth = signed.data.session!;
    const app = (await import("../../api/src/app")).default;
    const settings = await tnaApiRequest(
      app,
      "http://localhost/api/v1/ketik/settings",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...DEFAULT_KETIK_SETTINGS,
          selectedModel: "gpt-5.4-mini",
          responsePacingMode: "training_fast",
        }),
      },
    );
    expect(settings.status).toBe(200);
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: E2E_SUPABASE_STORAGE_KEY, value: auth },
    );
    const blocked: string[] = [];
    const mutations: Array<{ path: string; body: Record<string, unknown> }> =
      [];
    // Only transport is bridged: real auth/profile responses, genuine browser JWT,
    // real Hono middleware/services/RPC/RLS, provider HTTP response intercepted locally.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === APP_ORIGIN && !url.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }
      if (
        url.origin === new URL(E2E_SUPABASE_URL).origin &&
        ["/auth/v1/user", "/rest/v1/profiles"].includes(url.pathname)
      ) {
        const response = await guarded(
          new URL(url.pathname + url.search, env.apiUrl),
          { headers: { ...request.headers(), apikey: env.anonKey } },
        );
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
        return;
      }
      if (url.origin === APP_ORIGIN && url.pathname.startsWith("/api/v1/")) {
        if (request.method() === "POST")
          mutations.push({ path: url.pathname, body: request.postDataJSON() });
        const response = await tnaApiRequest(
          app,
          `http://localhost${url.pathname}${url.search}`,
          {
            method: request.method(),
            headers: request.headers(),
            ...(request.postData() ? { body: request.postData()! } : {}),
          },
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
        return;
      }
      if (
        ![
          "fonts.googleapis.com",
          "fonts.gstatic.com",
          "randomuser.me",
        ].includes(url.hostname)
      )
        blocked.push(url.origin + url.pathname);
      await route.abort();
    });
    await page.goto(`${APP_ORIGIN}/ketik`);
    await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Mulai", exact: true })
      .click();
    const room = page.getByRole("region", { name: "Ruang chat" });
    const input = room.getByRole("textbox", { name: "Tulis balasan" });
    await input.fill("Selamat pagi, apa kendalanya?");
    await input.press("Enter");
    await expect(room.getByRole("alert")).toContainText(
      "Balasan konsumen belum tersedia",
    );
    await room.getByRole("button", { name: "Coba kirim lagi" }).click();
    await expect(
      room.getByText("Tagihan saya ganda.", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await input.fill("Boleh sebutkan nomor tagihannya?");
    await input.press("Enter");
    await expect(
      room.getByText("Nomornya 123, mohon dibantu.", { exact: true }),
    ).toBeVisible();
    const sessionId = new URL(page.url()).searchParams.get("sesi")!;
    await page.reload();
    await expect(
      room.getByText("Tagihan saya ganda.", { exact: true }),
    ).toBeVisible();
    await expect(
      room.getByText("Nomornya 123, mohon dibantu.", { exact: true }),
    ).toBeVisible();
    expect(calls).toBe(3);
    expect(reviewCalls).toBe(0);
    await room.getByRole("button", { name: "Akhiri chat" }).click();
    await page
      .getByRole("dialog", { name: "Akhiri chat sekarang?" })
      .getByRole("button", { name: "Akhiri chat", exact: true })
      .click();
    await expect(page).toHaveURL(/tahap=telaah/);
    const history = await db
      .from("ketik_history")
      .select("messages,transcript_provenance,final_score")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();
    expect(history.error).toBeNull();
    expect(history.data?.transcript_provenance).toBe("server_v1");
    expect(history.data?.final_score).toBeNull();
    expect(
      history.data?.messages
        .filter((m: { sender: string }) => m.sender !== "system")
        .map((m: { text: string }) => m.text),
    ).toEqual([
      "Selamat pagi, apa kendalanya?",
      "Tagihan saya ganda.",
      "Boleh sebutkan nomor tagihannya?",
      "Nomornya 123, mohon dibantu.",
    ]);
    const finished = await db
      .from("ketik_sessions")
      .select("state,messages")
      .eq("id", sessionId)
      .single();
    expect(finished.data).toEqual({ state: "ended", messages: null });
    const finish = mutations.find((m) => m.path.endsWith("/finish"));
    expect(finish?.body).toEqual({});
    const turn = mutations.find((m) => m.path.endsWith("/turns"));
    expect(Object.keys(turn!.body).sort()).toEqual([
      "expectedVersion",
      "requestId",
      "text",
    ]);
    expect(calls).toBe(3);
    expect(reviewCalls).toBe(0); // Finish never auto-reviews.
    await page
      .getByRole("button", { name: "Mulai telaah", exact: true })
      .click();
    await expect(page.getByTestId("ketik-final-score")).toHaveText(/\d+/, {
      timeout: 15000,
    });
    expect(reviewCalls).toBe(1);
    expect(reviewTranscript).toEqual(history.data?.messages);
    const reviewed = await db
      .from("ketik_history")
      .select("review_status,final_score,messages")
      .eq("id", sessionId)
      .single();
    expect(reviewed.data?.review_status).toBe("completed");
    expect(reviewed.data?.messages).toEqual(history.data?.messages);
    await expect(page.getByTestId("ketik-final-score")).toHaveText(
      String(reviewed.data?.final_score),
    );
    expect(blocked).toEqual([]);
  } finally {
    globalThis.fetch = guarded;
    if (userId) {
      expect(
        (await db.from("ai_usage_logs").delete().eq("user_id", userId)).error,
      ).toBeNull();
      expect((await db.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  }
});
