import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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

test("PDKT reply attributes Riwayat and Monitoring to the picker replier, not the email creator", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
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
  const db = createAdmin(env);
  const ns = randomUUID();
  const participantName = `Pembalas ${ns.slice(0, 8)}`;
  const batch = `Batch ${ns}`;
  const scenario = {
    id: ns,
    category: "Transaksi",
    title: `Tagihan ${ns}`,
    description: "Tagihan ganda.",
    isActive: true,
  };
  const inbound = {
    id: ns,
    from: "rina@local.test",
    to: "ojk@kontak157.go.id",
    subject: scenario.title,
    body: "Saldo terpotong dua kali. Mohon bantuan.",
    timestamp: new Date().toISOString(),
    isAgent: false,
  };
  let userId: string | undefined;
  let participantId: string | undefined;
  let mailboxId: string | undefined;
  let historyId: string | undefined;
  try {
    const email = `pdkt-replier-${ns}@local.test`;
    const password = randomUUID();
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
          full_name: "Pembuat email",
          role: "trainer",
          status: "active",
          is_deleted: false,
        })
      ).error,
    ).toBeNull();
    expect(
      (await db.from("profiler_folders").insert({ name: batch })).error,
    ).toBeNull();
    const participant = await db
      .from("profiler_peserta")
      .insert({
        nama: participantName,
        batch_name: batch,
        tim: "Tim Email",
        jabatan: "Agent",
      })
      .select("id")
      .single();
    expect(participant.error).toBeNull();
    participantId = participant.data!.id;
    const signed = await createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email, password });
    expect(signed.error).toBeNull();
    const auth = signed.data.session!;
    // Dynamic import only after loopback pin: no production app/schedulers.
    const app = (await import("../../api/src/app")).default;
    expect((await import("../../api/src/lib/env")).env.VITE_SUPABASE_URL).toBe(
      env.apiUrl,
    );
    const api = (path: string, body?: unknown) =>
      tnaApiRequest(app, `http://localhost/api/v1${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    // Real creation path, self subject; no fabricated history or scoring rows.
    const creation = await api("/pdkt/mailbox/batch", {
      client_request_id: ns,
      sender_name: "Rina",
      sender_email: inbound.from,
      subject: inbound.subject,
      snippet: inbound.body,
      scenario_snapshot: scenario,
      config_snapshot: {
        scenarios: [scenario],
        consumerType: { id: "calm", name: "Tenang", description: "Tenang" },
        identity: {
          name: "Rina",
          bodyName: "Rina",
          email: inbound.from,
          city: "Bandung",
        },
        enableImageGeneration: false,
        selectedModel: "gemini-3.8-flash",
      },
      inbound_email: inbound,
      simulationSubject: { type: "self" },
    });
    expect(creation.status).toBe(200);
    const mailbox = await db
      .from("pdkt_mailbox_items")
      .select("id,simulation_subject_type,simulation_subject_name")
      .eq("client_request_id", ns)
      .single();
    expect(mailbox.error).toBeNull();
    mailboxId = mailbox.data!.id;
    expect(mailbox.data!.simulation_subject_type).toBe("self");

    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: E2E_SUPABASE_STORAGE_KEY, value: auth },
    );
    const blocked: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === APP_ORIGIN && !url.pathname.startsWith("/api/"))
        return route.continue();
      if (
        url.origin === new URL(E2E_SUPABASE_URL).origin &&
        ["/auth/v1/user", "/rest/v1/profiles"].includes(url.pathname)
      ) {
        const response = await fetch(
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
        blocked.push(url.origin + url.pathname);
      return route.abort();
    });
    await page.goto(`${APP_ORIGIN}/pdkt`);
    const start = () =>
      page.getByRole("button", { name: /^Mulai simulasi/ }).first();
    await start().click();
    let picker = page.getByRole("dialog", {
      name: "Mulai Simulasi",
      exact: true,
    });
    await picker.getByRole("radio", { name: /Diri sendiri/ }).check();
    await picker.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Simulasi PDKT", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    // The same email, but now choose a different replier in the real picker.
    await start().click();
    picker = page.getByRole("dialog", { name: "Mulai Simulasi", exact: true });
    await picker.getByRole("radio", { name: /Peserta resmi/ }).check();
    await picker
      .getByLabel("Cari peserta (min. 2 huruf)")
      .fill(participantName);
    await picker
      .getByRole("button", { name: new RegExp(participantName) })
      .click();
    await picker.getByRole("button", { name: "Mulai", exact: true }).click();
    await page
      .getByRole("button", { name: new RegExp(inbound.subject) })
      .click();
    await page
      .getByRole("button", { name: "Tulis balasan", exact: true })
      .click();
    const compose = page.getByRole("region", { name: "Tulis balasan" });
    await compose
      .getByLabel("Balasan Anda")
      .fill(
        "Terima kasih Ibu Rina. Mohon maaf atas kendalanya. Kami akan memeriksa transaksi ganda Ibu.",
      );
    // Ensure timeTaken is a positive second even on a fast local machine.
    await page.waitForTimeout(1100);
    await compose
      .getByRole("button", { name: "Kirim balasan", exact: true })
      .click();
    const replyResponse = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/v1/pdkt/mailbox/reply") &&
        res.request().method() === "POST",
    );
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan", exact: true })
      .click();
    const sent = await replyResponse;
    expect(sent.status()).toBe(200);
    historyId = (await sent.json()).data.historyId;
    // Core RED assertion goes through the same Riwayat and Monitoring readers.
    const riwayat = await api("/pdkt/history");
    expect(riwayat.status).toBe(200);
    const rows = (await riwayat.json()).data;
    const history = rows.find((row: { id: string }) => row.id === historyId);
    const monitoring = await api("/ai/monitoring/history?module=pdkt");
    expect(monitoring.status).toBe(200);
    const monitored = (await monitoring.json()).data.rows.find(
      (row: { id: string }) => row.id === historyId,
    );
    await testInfo.attach("reply-attribution.json", {
      contentType: "application/json",
      body: JSON.stringify({
        mailboxId,
        historyId,
        riwayatSubject: history?.simulationSubject,
        monitoringParticipant: monitored?.participant,
      }),
    });
    expect(history?.simulationSubject).toMatchObject({
      type: "participant",
      participantId,
      displayName: participantName,
      batchName: batch,
      team: "Tim Email",
    });
    expect(monitored).toMatchObject({
      participant: { name: participantName, batch },
      actor: { name: "Pembuat email", role: "trainer" },
    });
    expect(sent.request().postDataJSON().simulationSubject).toEqual({
      type: "participant",
      participantId,
    });
    const creator = await db
      .from("pdkt_mailbox_items")
      .select(
        "simulation_subject_type,simulation_subject_name,created_by_user_id",
      )
      .eq("id", mailboxId)
      .single();
    expect(creator.error).toBeNull();
    expect(creator.data).toEqual({
      simulation_subject_type: "self",
      simulation_subject_name: null,
      created_by_user_id: userId,
    });
    // SIDAK must discover exactly this participant-attributed session.
    const sidak = await api(`/sidak/agents/${participantId}/simulations`);
    expect(sidak.status).toBe(200);
    expect(JSON.stringify((await sidak.json()).data)).toContain(historyId);
    await page.goto(`${APP_ORIGIN}/pdkt/history`);
    await expect(
      page.getByRole("cell").getByText(participantName, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.goto(`${APP_ORIGIN}/monitoring`);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: scenario.title })
        .getByText(participantName, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    expect(blocked).toEqual([]);
  } finally {
    await page.close();
    // Evaluation runs asynchronously even if an assertion fails. Await its terminal
    // state before deleting the disposable fixture so no background work escapes.
    if (historyId) {
      await expect
        .poll(
          async () =>
            (
              await db
                .from("pdkt_history")
                .select("evaluation_status")
                .eq("id", historyId!)
                .single()
            ).data?.evaluation_status,
          { timeout: 45000 },
        )
        .toBe("failed");
    }
    if (mailboxId)
      expect(
        (await db.from("pdkt_mailbox_items").delete().eq("id", mailboxId))
          .error,
      ).toBeNull();
    if (historyId)
      expect(
        (await db.from("pdkt_history").delete().eq("id", historyId)).error,
      ).toBeNull();
    if (participantId)
      expect(
        (await db.from("profiler_peserta").delete().eq("id", participantId))
          .error,
      ).toBeNull();
    expect(
      (await db.from("profiler_folders").delete().eq("name", batch)).error,
    ).toBeNull();
    if (userId)
      expect((await db.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
