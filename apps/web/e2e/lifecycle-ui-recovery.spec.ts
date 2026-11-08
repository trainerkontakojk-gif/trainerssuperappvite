import { expect, test, type Route } from "@playwright/test";
import {
  openHermeticShell,
  expectHermetic,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { telefunMocks } from "./helpers/telefunFixtures";

test.describe.configure({ timeout: 60000 });
test.beforeAll(() => assertLocalDevOnlyTarget());

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });

test("closed login cannot navigate after its delayed response", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, { path: "/?auth=login" });
  await expect(
    page.getByRole("heading", { name: "Masuk", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(async () => {
    const { supabase } = await import(
      /* @vite-ignore */ `${location.origin}/src/lib/supabase.ts`
    );
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user)
      throw new Error("The local auth fixture must have a valid session");
    (window as any).finishOldLogin = null;
    supabase.auth.signInWithPassword = () =>
      new Promise((resolve) => {
        (window as any).finishOldLogin = () =>
          resolve({ error: null, data: { user: session.user, session } });
      });
  });
  await page.locator('input[name="email"]').fill("e2e@example.test");
  await page.locator('input[name="password"]').fill("synthetic-test-value");
  await page.getByRole("button", { name: "Masuk sekarang" }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).finishOldLogin))
    .toBe("function");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Masuk", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as any).finishOldLogin());
  // Wait for the old handler to reach its next boundary, not just one frame.
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/$/);
  expectHermetic(audit);
});

test("closing registration still provisions the account profile without late navigation", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, { path: "/?auth=register" });
  await expect(
    page.getByRole("heading", { name: "Minta Akses Baru" }),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(async () => {
    const { supabase } = await import(
      /* @vite-ignore */ `${location.origin}/src/lib/supabase.ts`
    );
    (window as any).profileWrites = 0;
    supabase.auth.signUp = () =>
      new Promise((resolve) => {
        (window as any).finishSignup = () =>
          resolve({
            error: null,
            data: { user: { id: "local-created-user" }, session: null },
          });
      });
    const from = supabase.from.bind(supabase);
    supabase.from = ((table: string) =>
      table === "profiles"
        ? {
            insert: async () => {
              (window as any).profileWrites++;
              return { error: null };
            },
          }
        : from(table)) as typeof supabase.from;
  });
  await page.locator('input[name="email"]').fill("registration@local.test");
  await page.locator('input[name="password"]').fill("synthetic-test-value");
  await page.getByRole("button", { name: "Ajukan akses", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).finishSignup))
    .toBe("function");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minta Akses Baru" }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as any).finishSignup());
  await expect
    .poll(() => page.evaluate(() => (window as any).profileWrites))
    .toBe(1);
  await expect(page).toHaveURL(/\/$/);
  expectHermetic(audit);
});

test("kegiatan freezes the draft while saving and recovers after failure", async ({
  page,
}) => {
  const pending = gate();
  let writes = 0;
  const audit = await openHermeticShell(page, {
    path: "/dashboard/kegiatan",
    apiMocks: [
      {
        method: "GET",
        path: "/api/v1/kegiatan",
        body: { success: true, data: [] },
      },
    ],
    beforeNavigate: async (p) => {
      await p.route("**/api/v1/kegiatan", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        writes++;
        await pending.wait;
        await json(
          route,
          {
            success: false,
            error: { code: "SERVER_ERROR", message: "temporary failure" },
          },
          500,
        );
      });
    },
  });
  await page.getByRole("button", { name: "Tambah kegiatan" }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah kegiatan" });
  await dialog.getByLabel("Judul").fill("Kegiatan yang harus tetap utuh");
  await dialog.getByRole("spinbutton", { name: "Tahun" }).fill("2026");
  await dialog
    .getByLabel("Link Google Drive")
    .fill("https://drive.google.com/drive/folders/local-test");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S3sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  try {
    await dialog.getByRole("button", { name: "Simpan kegiatan" }).click();
    await expect.poll(() => writes).toBe(1);
    await expect(dialog.getByLabel("Judul")).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Menyimpan…" }),
    ).toBeDisabled();
  } finally {
    pending.release();
  }
  await expect(
    dialog.getByRole("button", { name: "Simpan kegiatan" }),
  ).toBeEnabled();
  await expect(dialog.getByLabel("Judul")).toHaveValue(
    "Kegiatan yang harus tetap utuh",
  );
  expect(writes).toBe(1);
  expectHermetic(audit);
});

const mail = {
  id: "mail-lifecycle",
  user_id: "user-1",
  status: "open",
  created_at: "2026-09-15T08:00:00.000Z",
  last_activity_at: "2026-09-15T08:00:00.000Z",
  sender_name: "Rina",
  sender_email: "rina@local.test",
  subject: "Draf penting",
  snippet: "Transaksi belum selesai.",
  permissions: { can_delete: true },
};
const pdktMocks: ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/ai/usage/summary",
    body: {
      success: true,
      data: {
        totalCalls: 0,
        totalTokens: 0,
        totalCostIdr: 0,
        simulationCostIdr: 0,
        reviewCostIdr: 0,
      },
    },
  },
  {
    method: "GET",
    path: "/api/v1/pdkt/settings",
    body: { success: true, data: null },
  },
  ...["scenarios", "consumer-types", "history"].map((path) => ({
    method: "GET" as const,
    path: `/api/v1/pdkt/${path}`,
    body: { success: true, data: [] },
  })),
  {
    method: "GET",
    path: "/api/v1/pdkt/mailbox",
    body: { success: true, data: [mail] },
  },
  {
    method: "GET",
    path: `/api/v1/pdkt/mailbox/${mail.id}`,
    body: {
      success: true,
      data: {
        ...mail,
        inbound_email: {
          id: "inbound-1",
          from: mail.sender_email,
          to: "ojk@kontak157.go.id",
          subject: mail.subject,
          body: mail.snippet,
          timestamp: mail.created_at,
          isAgent: false,
        },
        emails_thread: [],
      },
    },
  },
];

test("leaving a pending PDKT send preserves the latest undebounced draft", async ({
  page,
}) => {
  const pending = gate();
  let writes = 0;
  const audit = await openHermeticShell(page, {
    path: `/pdkt?ruang=1&email=${mail.id}`,
    apiMocks: pdktMocks,
    beforeNavigate: async (p) => {
      await p.route("**/api/v1/pdkt/mailbox/reply", async (route) => {
        writes++;
        await pending.wait;
        await json(
          route,
          {
            success: false,
            error: { code: "SERVER_ERROR", message: "temporary failure" },
          },
          500,
        );
      });
    },
  });
  await page.getByRole("button", { name: "Tulis balasan" }).click();
  await expect(page.getByLabel("Balasan Anda")).toBeVisible();
  // Stretch only the draft debounce; leave animation and network timers real.
  // This deterministically models leaving before the 500ms draft timer fires.
  await page.evaluate(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) =>
      original(
        handler,
        timeout === 500 ? 60000 : timeout,
        ...args,
      )) as typeof window.setTimeout;
  });
  const text = "Ketikan terakhir yang belum sempat disimpan oleh timer.";
  await page.getByLabel("Balasan Anda").fill(text);
  try {
    await page
      .getByRole("button", { name: "Kirim balasan", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan", exact: true })
      .click();
    await expect.poll(() => writes).toBe(1);
    await page.getByRole("button", { name: "Kembali ke email" }).click();
    await expect(page.getByLabel("Balasan Anda")).toHaveCount(0);
    expect(
      await page.evaluate(
        (id) => localStorage.getItem(`pdkt_draft_${id}`),
        mail.id,
      ),
    ).toBe(text);
  } finally {
    pending.release();
  }
  expectHermetic(audit);
});

test("PDKT retry keeps a failed draft, then removes it only after acknowledged success", async ({
  page,
}) => {
  let writes = 0;
  const audit = await openHermeticShell(page, {
    path: `/pdkt?ruang=1&email=${mail.id}`,
    apiMocks: pdktMocks,
    beforeNavigate: async (p) => {
      await p.route("**/api/v1/pdkt/mailbox/reply", async (route) => {
        writes++;
        await json(
          route,
          writes === 1
            ? {
                success: false,
                error: { code: "SERVER_ERROR", message: "temporary failure" },
              }
            : { success: true, data: { historyId: "local-history" } },
          writes === 1 ? 500 : 200,
        );
      });
    },
  });
  await page.getByRole("button", { name: "Tulis balasan" }).click();
  const text = "Draf yang dipertahankan sampai pengiriman dikonfirmasi.";
  await page.getByLabel("Balasan Anda").fill(text);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", { name: "Kirim balasan", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    await expect.poll(() => writes).toBe(attempt + 1);
    await expect(
      page.getByRole("dialog", { name: "Kirim balasan sekarang?" }),
    ).toBeHidden();
    if (attempt === 0) {
      await expect(
        page
          .getByRole("region", { name: "Tulis balasan" })
          .getByRole("button", { name: "Kirim balasan", exact: true }),
      ).toBeEnabled();
      await expect(page.getByLabel("Balasan Anda")).toBeEditable();
      await expect(page.getByLabel("Balasan Anda")).toHaveValue(text);
      expect(
        await page.evaluate(
          (id) => localStorage.getItem(`pdkt_draft_${id}`),
          mail.id,
        ),
      ).toBe(text);
    }
  }
  await expect(page.getByLabel("Balasan Anda")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate((id) => localStorage.getItem(`pdkt_draft_${id}`), mail.id),
    )
    .toBeNull();
  expect(writes).toBe(2);
  expectHermetic(audit);
});

test("Telefun settings keeps the edited draft after a failed save and retries", async ({
  page,
}) => {
  let saves = 0;
  const audit = await openHermeticShell(page, {
    path: "/telefun",
    apiMocks: telefunMocks([]),
    beforeNavigate: async (p) => {
      await p.route("**/api/v1/telefun/settings", async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        saves++;
        await json(
          route,
          saves === 1
            ? {
                success: false,
                error: { code: "SERVER_ERROR", message: "temporary failure" },
              }
            : { success: true, data: null },
          saves === 1 ? 500 : 200,
        );
      });
    },
  });
  await page
    .getByRole("navigation", { name: "Menu Telefun" })
    .getByRole("button", { name: /^Pengaturan/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
  const toggle = dialog.getByRole("switch").first();
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(
    dialog.getByText("Pengaturan belum tersimpan. Coba Simpan lagi."),
  ).toBeVisible();
  await expect(toggle).not.toHaveAttribute("aria-checked", before!);
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(saves).toBe(2);
  expectHermetic(audit);
});
