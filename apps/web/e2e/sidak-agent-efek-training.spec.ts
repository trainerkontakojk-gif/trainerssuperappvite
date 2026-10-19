/**
 * EFEK fase 3 (plans/markdown/efek.md): sidebar detail agent SIDAK menampilkan
 * baris "Ikut pelatihan" dari quickview untuk admin/trainer, dengan tautan ke
 * rincian program EFEK. Hermetic lewat harness detail agent (fail-closed).
 */
import { expect, test } from "@playwright/test";
import {
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  LAYOUT_DIRECTORY_AGENTS,
  LAYOUT_FOLDER_AGENTS,
  LAYOUT_FOLDERS,
  richAgentDetailPayload,
  richQuickviewPayload,
} from "./helpers/sidakAgentDetailLayoutFixture";

const SESSION_ID = "8f3a2b1c-0d4e-4f5a-8b6c-7d8e9f0a1b2c";

async function open(page: import("@playwright/test").Page, quickview: unknown) {
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  await openAgentDetail(page, audit, {
    detailPayload: richAgentDetailPayload,
    quickviewPayload: quickview,
    folders: LAYOUT_FOLDERS,
    folderAgents: LAYOUT_FOLDER_AGENTS,
    directoryAgents: LAYOUT_DIRECTORY_AGENTS,
  });
  await expect(
    page.getByRole("heading", { name: "Rahmawati Kusumaningrum" }),
  ).toBeVisible({ timeout: 20000 });
  return audit;
}

test("trainer melihat pelatihan EFEK agent dengan tautan ke rinciannya", async ({
  page,
}) => {
  const audit = await open(page, {
    ...richQuickviewPayload(),
    efekTraining: [
      {
        sessionId: SESSION_ID,
        programCode: "ketik",
        programName: "KETIK",
        title: "Level Up Week Mei",
        startDate: "2026-05-12",
        endDate: "2026-05-16",
      },
    ],
  });
  const training = page
    .getByRole("complementary", { name: "Profil agen" })
    .getByRole("region", { name: "Ikut pelatihan" });
  const link = training.getByRole("link", { name: /KETIK · Mei 2026/ });
  await expect(link).toBeVisible();
  await expect(training).toContainText("Level Up Week Mei");
  await expect(link).toHaveAttribute(
    "href",
    `/tna/efek/program/ketik?session=${SESSION_ID}`,
  );
  expect(audit.blockedApi).toEqual([]);
  expect(audit.blockedExternal).toEqual([]);
});

test("tanpa data pelatihan, baris EFEK tidak tampil", async ({ page }) => {
  const audit = await open(page, richQuickviewPayload());
  await expect(page.getByText("Skor", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ikut pelatihan" }),
  ).toHaveCount(0);
  expect(audit.blockedApi).toEqual([]);
});
