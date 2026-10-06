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
export const SOLO_TEAM_ID = "44444444-4444-4444-4444-444444444444";

/** Tanggal lahir yang jatuh hari ini (tahun 1995) agar baris ulang tahun muncul. */
const today = new Date();
const BIRTHDAY_TODAY = `1995-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

export const BATCH_PAGI_PESERTA = [
  {
    id: "55555555-5555-5555-5555-555555555551",
    batch_name: "Batch Pagi",
    nomor_urut: 1,
    nama: "Rina Kartika",
    tim: "Tim Call",
    jabatan: "agent",
    tgl_lahir: BIRTHDAY_TODAY,
  },
  {
    id: "55555555-5555-5555-5555-555555555552",
    batch_name: "Batch Pagi",
    nomor_urut: 2,
    nama: "Dimas Prasetyo",
    tim: "Tim Call",
    jabatan: "agent",
    tgl_lahir: null,
  },
];

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
        {
          id: SOLO_TEAM_ID,
          name: "Tim Email",
          year_id: YEAR_ID,
          parent_id: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/counts",
    body: { success: true, data: { "Batch Pagi": 2, "Tim Email": 0 } },
  },
  {
    method: "GET",
    path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
    body: { success: true, data: BATCH_PAGI_PESERTA },
  },
  {
    method: "GET",
    path: /^\/api\/v1\/profiler\/peserta\/batch\/Tim(%20|\+)Email$/,
    body: { success: true, data: [] },
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
