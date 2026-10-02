import type { ApiMock } from "./hermeticShell";

/**
 * `/api` yang dipakai permukaan Profiler.
 *
 * Bentuk respons mengikuti handler aslinya (`apps/api/src/routes/profiler.ts` dan
 * `apps/api/src/app.ts`), yang selalu membalas `{ success: true, data }`.
 *
 * Dipakai bersama oleh `profiler.spec.ts` dan spec navigasi sidebar supaya tidak
 * ada dua salinan fixture yang bisa saling menyimpang.
 */

export const YEAR_ID = "11111111-1111-1111-1111-111111111111";
export const TEAM_ID = "22222222-2222-2222-2222-222222222222";
export const BATCH_ID = "33333333-3333-3333-3333-333333333333";

export const PROFILER_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/profiler/years",
    body: {
      success: true,
      data: [
        {
          id: YEAR_ID,
          year: 2026,
          label: "2026",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/folders",
    body: {
      success: true,
      data: [
        {
          id: TEAM_ID,
          name: "Tim Call",
          year_id: YEAR_ID,
          parent_id: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: BATCH_ID,
          name: "Batch Pagi",
          year_id: YEAR_ID,
          parent_id: TEAM_ID,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/counts",
    body: { success: true, data: {} },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/peserta/upcoming-birthdays",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
];
