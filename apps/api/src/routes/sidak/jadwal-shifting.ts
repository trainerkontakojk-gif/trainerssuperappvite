import { Hono } from "hono";
import type { Context } from "hono";
import { User } from "@supabase/supabase-js";
import type { ApiResponse, JadwalShiftingResponse } from "@trainers/types";
import { requireCapability } from "../../middleware/role";
import {
  fetchWfmSchedule,
  fetchWfmScheduleMonth,
  redactUpstreamHost,
  WfmScheduleError,
  WfmScheduleInputError,
} from "../../services/sidak/wfm-schedule";

type Variables = { user: User; profile: any };

const sidakJadwalShifting = new Hono<{ Variables: Variables }>();

type JadwalContext = Context<{ Variables: Variables }>;

function errorBody(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } };
}

/**
 * Kalimat yang dikirim ke browser per kode kegagalan.
 *
 * Teks detail dari upstream **tidak** diteruskan — dan tidak juga dicatat di log
 * server. WFM adalah sistem pihak ketiga yang bebas menulis apa saja di pesan
 * gagalnya — termasuk memantulkan username, password, atau potongan request.
 * Yang boleh keluar dari proses ini cuma nilai yang kita tentukan sendiri: kode,
 * penanda konfigurasi, dan host yang sudah direduksi. `code` itulah yang dipakai UI
 * untuk memilih perilakunya.
 */
const PUBLIC_MESSAGES: Record<string, string> = {
  WFM_NOT_CONFIGURED:
    "Integrasi jadwal belum dikonfigurasi di server. Hubungi administrator Trainers SuperApp.",
  WFM_UNAVAILABLE:
    "Sumber jadwal WFM sedang tidak dapat dihubungi. Silakan coba lagi.",
  WFM_UNAUTHORIZED:
    "Server tidak diizinkan membaca jadwal dari sumber WFM. Hubungi administrator Trainers SuperApp.",
  WFM_INVALID_RESPONSE:
    "Sumber jadwal WFM membalas data yang tidak dapat dibaca.",
};

/**
 * Pemetaan kegagalan pembacaan WFM → status HTTP + pesan publik.
 *
 * Dipakai BAIK jalur harian maupun jalur bulanan, supaya kedua endpoint
 * memperlakukan kegagalan dengan cara yang persis sama: input buruk jadi 400,
 * konfigurasi belum siap jadi 503, upstream bermasalah jadi 502 — dan tidak
 * ada satu pun yang bisa berubah menjadi `rows: []`.
 *
 * Log server hanya memuat nilai yang kita tentukan sendiri: kode, penanda
 * konfigurasi, dan host yang sudah direduksi. Rincian upstream (yang bisa
 * memantulkan API key) sengaja tidak dicatat sama sekali — memotongnya jadi
 * beberapa karakter tetap membocorkan.
 */
function respondUpstreamError(c: JadwalContext, error: unknown) {
  // Input buruk: 400. Kelasnya terpisah, bukan ditebak dari teks pesan.
  // Pesannya aman dikirim apa adanya karena hanya berisi parameter yang
  // dikirim pengguna sendiri.
  if (error instanceof WfmScheduleInputError) {
    return c.json(errorBody("VALIDATION_ERROR", error.message), 400);
  }

  if (error instanceof WfmScheduleError) {
    // Tidak ada URL lengkap, query string, API key, isi baris jadwal, atau
    // teks upstream apa pun.
    console.warn(
      `[sidak/jadwal-shifting] upstream gagal: code=${error.code} config=${error.configuration} host=${redactUpstreamHost(
        process.env.WFM_SCHEDULE_SUPABASE_URL ?? "",
      )}`,
    );
    return c.json(
      errorBody(
        error.code,
        PUBLIC_MESSAGES[error.code] ??
          "Jadwal shifting sedang tidak dapat ditampilkan. Silakan coba lagi.",
      ),
      // 503 = konfigurasi runtime belum siap; 502 = WFM tidak bisa dipakai.
      // Keduanya sengaja tidak 200 supaya UI tidak pernah menampilkan
      // "tidak ada jadwal" untuk kondisi yang sebenarnya adalah kegagalan.
      error.configuration ? 503 : 502,
    );
  }

  // Galat tak terduga tidak boleh bocor mentah ke browser.
  console.error(
    "[sidak/jadwal-shifting] galat tak terduga saat membaca jadwal",
  );
  return c.json(
    errorBody(
      "WFM_UNAVAILABLE",
      "Jadwal shifting sedang tidak dapat ditampilkan. Silakan coba lagi.",
    ),
    502,
  );
}

/**
 * GET /jadwal-shifting
 *
 * Satu hari jadwal WFM untuk role `admin` dan `trainer` saja.
 *
 * Otorisasi naik di `requireCapability`, jadi Hono menghentikan request SEBELUM
 * handler ini berjalan — adapter upstream tidak pernah dipanggil untuk role
 * lain. Itu yang membuat "ditolak" dan "tidak menyentuh WFM" adalah hal yang
 * sama, bukan dua hal yang harus dipercaya.
 */
sidakJadwalShifting.get(
  "/jadwal-shifting",
  requireCapability("sidak.schedule.read"),
  async (c) => {
    const requestedDate = c.req.query("date");

    try {
      const data = await fetchWfmSchedule(requestedDate);
      return c.json<ApiResponse<JadwalShiftingResponse>>(
        { success: true, data },
        200,
      );
    } catch (error) {
      return respondUpstreamError(c, error);
    }
  },
);

/**
 * GET /jadwal-shifting/month
 *
 * Satu bulan jadwal (maksimal 31 hari per permintaan) untuk kalender, role
 * `admin` dan `trainer` saja. Batas role, bentuk input, dan pemetaan kegagalan
 * persis sama dengan jalur harian; yang berbeda hanya rentang yang dibaca.
 */
sidakJadwalShifting.get(
  "/jadwal-shifting/month",
  requireCapability("sidak.schedule.read"),
  async (c) => {
    const requestedMonth = c.req.query("month");

    try {
      const data = await fetchWfmScheduleMonth(requestedMonth);
      return c.json<ApiResponse<typeof data>>({ success: true, data }, 200);
    } catch (error) {
      return respondUpstreamError(c, error);
    }
  },
);

export { sidakJadwalShifting };
