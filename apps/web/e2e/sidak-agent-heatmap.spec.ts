/**
 * E2E tab Heatmap di detail agent (`/sidak/agents/:id`).
 *
 * Backend `/api` di-mock lewat allowlist fail-closed milik harness detail agent,
 * jadi spec ini membuktikan perilaku UI: tab tampil, request membawa `agent_id`
 * + filter konteks, kalender dan insight ter-render. Kebenaran hitungan
 * per-tiket/agent_id/RLS dibuktikan di `sidak-temuan-dates-api.spec.ts`
 * terhadap DB lokal disposable.
 */

import { expect, test } from "@playwright/test";
import {
  AGENT_ID,
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";

function audit(): AgentAudit {
  return { mockedApi: [], blockedApi: [], blockedExternal: [] };
}

async function openHeatmapTab(
  page: import("@playwright/test").Page,
  opts: {
    role?: string;
    sidakAccess?: "none" | "approved";
    counts?: Record<string, number>;
  } = {},
) {
  const a = audit();
  await openAgentDetail(page, a, {
    role: opts.role ?? "trainer",
    sidakAccess: opts.sidakAccess ?? "none",
    heatmapCounts: opts.counts ?? { "2026-01-05": 4, "2026-01-12": 2 },
  });

  // Halaman memakai animasi masuk; tunggu heading dulu sebelum berinteraksi.
  // Timeout dinaikkan karena test pertama membayar cold-start Vite, bukan
  // karena assertion dilonggarkan.
  await expect(
    page.getByRole("heading", { name: "Agen Uji Tanggal" }),
  ).toBeVisible({ timeout: 15000 });

  const tab = page.getByRole("tab", { name: "Heatmap" });
  await tab.focus();
  await tab.press("Enter");
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return a;
}

test.describe("Heatmap di detail agent", () => {
  // SPA terberat di feature ini; budget dinaikkan, assertion tidak dilonggarkan.
  test.slow();

  test("tab Heatmap memuat kalender agent dan mengirim agent_id", async ({
    page,
  }) => {
    const a = await openHeatmapTab(page, { counts: { "2026-01-05": 4 } });

    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "05/01/2026: 4 temuan" }),
    ).toBeVisible();
    await expect(page.getByTestId("heatmap-insights")).toBeVisible();

    expect(a.mockedApi).toContain("heatmap");
    const query = a.heatmapQueries?.at(-1) ?? "";
    expect(query).toContain(`agent_id=${AGENT_ID}`);
    expect(query).toContain("mode=agent");
  });

  test("leader dengan modul SIDAK disetujui bisa membuka tab Heatmap", async ({
    page,
  }) => {
    await openHeatmapTab(page, { role: "leader", sidakAccess: "approved" });
    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();
  });

  test("toggle satuan mengirim count_by=tiket", async ({ page }) => {
    const a = await openHeatmapTab(page, {});
    await page.getByRole("button", { name: "Tiket", exact: true }).click();
    await expect
      .poll(() => a.heatmapQueries?.at(-1) ?? "")
      .toContain("count_by=tiket");
  });
});
