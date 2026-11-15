// Shared by the telefun-flow-*.spec.ts files.
import { type Page } from "@playwright/test";
import { formatAudit, openHermeticShell, type ApiMock } from "./hermeticShell";
import {
  FULL_HISTORY,
  REVIEWED_ROW,
  recordingMock,
  serveRecording,
  telefunMocks,
  type TelefunRow,
} from "./telefunFixtures";

export function telaahPath(id: string) {
  return `/telefun?sesi=${id}&tahap=telaah`;
}

export async function open(
  page: Page,
  path: string,
  apiMocks: ApiMock[],
  beforeNavigate?: (page: Page) => Promise<void>,
) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks,
    waitForUrl: /\/telefun/,
    beforeNavigate,
  });
  console.log("[audit]", formatAudit(audit));
  return audit;
}

export const ANNOTATIONS_MOCKS: ApiMock[] = [
  {
    method: "GET",
    path: `/api/v1/telefun/annotations/${REVIEWED_ROW.id}`,
    body: {
      success: true,
      data: [
        {
          id: "anno-1",
          session_id: REVIEWED_ROW.id,
          user_id: "user-1",
          timestamp_ms: 36000,
          category: "improvement_area",
          moment: "Jeda saat mencari aturan",
          text: "Ganti eee dengan kalimat jeda.",
          is_manual: true,
          created_at: REVIEWED_ROW.created_at,
        },
      ],
    },
  },
  {
    method: "GET",
    path: `/api/v1/telefun/coaching-summary/${REVIEWED_ROW.id}`,
    body: {
      success: true,
      data: {
        id: "sum-1",
        session_id: REVIEWED_ROW.id,
        user_id: "user-1",
        recommendations: [],
        generated_at: REVIEWED_ROW.created_at,
      },
    },
  },
];

export async function openTelaah(
  page: Page,
  row: TelefunRow,
  extra: ApiMock[] = [],
  history: readonly TelefunRow[] = FULL_HISTORY,
) {
  // Rekaman dilayani sebelum halaman dibuka: permintaan pertama <audio> tidak boleh lolos.
  return open(
    page,
    telaahPath(row.id),
    [...telefunMocks(history), recordingMock(row.id), ...extra],
    (page) => serveRecording(page),
  );
}
