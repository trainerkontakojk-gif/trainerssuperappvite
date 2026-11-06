/**
 * E2E layanan awal di detail agen (`/sidak/agents/:id`).
 *
 * Profil agen selalu dibuka di layanan audit TERBARU agen itu pada tahun yang
 * dipilih — bukan layanan yang terbawa dari cakupan bersama SIDAK (URL/sesi)
 * milik halaman atau agen sebelumnya. Dua regresi yang dijaga:
 *   1. Agen mutasi (call Jan–Mar, chat Apr–Jun) dibuka di chat.
 *   2. Layanan terbawa yang tidak punya audit (chat untuk agen SLIK) tidak
 *      berakhir di "Belum ada audit".
 *
 * Hermetic: `/api` di-mock lewat harness detail agen; payload detail mengikuti
 * `service_type` request seperti API asli (ringkasan per periode difilter,
 * temuan tidak).
 */

import { expect, test, type Page } from "@playwright/test";
import {
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  LAYOUT_FOLDERS,
  richAgentDetailPayload,
  richQuickviewPayload,
} from "./helpers/sidakAgentDetailLayoutFixture";

const AGENT_NAME = "Rahmawati Kusumaningrum";

type Row = Record<string, unknown>;

/**
 * Payload detail dengan riwayat layanan per bulan. `serviceForMonth` memetakan
 * bulan → layanan; payload difilter sesuai `service_type` request.
 */
function servicePayload(serviceForMonth: (month: number) => string) {
  return (search: URLSearchParams) => {
    const base = richAgentDetailPayload() as Record<string, unknown>;
    const requested = search.get("service_type");
    const summaries = (base.periodSummaries as Row[])
      .map((s): Row => ({
        ...s,
        serviceType: serviceForMonth(s.month as number),
      }))
      .filter((s) => !requested || s.serviceType === requested)
      // API mengurutkan ringkasan dari periode terbaru.
      .sort((a, b) => (b.month as number) - (a.month as number));
    const monthByPeriod = new Map(
      (base.periodSummaries as Row[]).map((s) => [s.id, s.month as number]),
    );
    const temuan = (base.temuan as Row[]).map((t) => ({
      ...t,
      service_type: serviceForMonth(monthByPeriod.get(t.period_id) ?? 1),
    }));
    const weight = (base.weights as Record<string, Row>).call;
    return {
      ...base,
      indicators: (base.indicators as Row[]).map((i) => ({
        ...i,
        service_type: requested ?? "call",
      })),
      periodSummaries: summaries,
      temuan,
      weights: {
        call: weight,
        chat: { ...weight, service_type: "chat" },
        slik: { ...weight, service_type: "slik" },
      },
      initialService: requested ?? "call",
    };
  };
}

async function open(
  page: Page,
  serviceForMonth: (month: number) => string,
  query: string,
) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  await openAgentDetail(page, audit, {
    detailPayload: servicePayload(serviceForMonth),
    quickviewPayload: richQuickviewPayload(),
    folders: LAYOUT_FOLDERS,
    query,
  });
  // Timeout dinaikkan untuk cold-start Vite, bukan melonggarkan asersi.
  await expect(page.getByRole("heading", { name: AGENT_NAME })).toBeVisible({
    timeout: 20000,
  });
  return audit;
}

function serviceSelect(page: Page) {
  return page.getByRole("combobox", { name: "Pilihan layanan audit" });
}

function summary(page: Page) {
  return page.getByRole("tabpanel", { name: "Ringkasan" });
}

test.describe("Detail agen — layanan awal", () => {
  test.slow();

  test("agen mutasi call → chat dibuka di layanan terbaru walau cakupan membawa call", async ({
    page,
  }) => {
    const audit = await open(
      page,
      (month) => (month <= 3 ? "call" : "chat"),
      "?layanan=call&tahun=2026&dari=1&sampai=6",
    );

    await expect(serviceSelect(page)).toHaveText(/Chat/);
    await expect(page).toHaveURL(/layanan=chat/);
    // Rail bulan hanya berisi bulan chat; Juni (terbaru) terpilih.
    await expect(
      summary(page).getByRole("button", { name: /^Pilih bulan Jun 2026/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      summary(page).getByRole("button", { name: /^Pilih bulan Jan 2026/ }),
    ).toHaveCount(0);
    await expect
      .poll(() => audit.detailQueries?.at(-1) ?? "")
      .toContain("service_type=chat");

    // Pilihan manual tetap dihormati setelah halaman terbuka.
    await serviceSelect(page).click();
    await page.getByRole("option", { name: "Call" }).click();
    await expect(page).toHaveURL(/layanan=call/);
    await expect(
      summary(page).getByRole("button", { name: /^Pilih bulan Mar 2026/ }),
    ).toHaveAttribute("aria-pressed", "true");

    expect(audit.blockedApi).toEqual([]);
    expect(audit.blockedExternal).toEqual([]);
  });

  test("layanan terbawa tanpa audit (chat) pindah ke layanan agen (SLIK)", async ({
    page,
  }) => {
    const audit = await open(
      page,
      () => "slik",
      "?layanan=chat&tahun=2026&dari=1&sampai=6",
    );

    await expect(serviceSelect(page)).toHaveText(/SLIK/);
    await expect(page).toHaveURL(/layanan=slik/);
    await expect(page.getByText(/Belum ada audit/)).toHaveCount(0);
    await expect(
      summary(page).getByRole("button", { name: /^Pilih bulan Jun 2026/ }),
    ).toHaveAttribute("aria-pressed", "true");

    expect(audit.blockedApi).toEqual([]);
    expect(audit.blockedExternal).toEqual([]);
  });
});
