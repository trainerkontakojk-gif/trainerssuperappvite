import type { Page, Route } from "@playwright/test";
import type { ApiMock } from "./hermeticShell";
import { APP_ORIGIN } from "./hermeticShell";
import { E2E_SUPABASE_URL, E2E_TELEFUN_WS_URL } from "./e2eTargets";

/**
 * Fixture Telefun untuk spec hermetic.
 *
 * `/api/v1/telefun/sessions` dan `/history/:id` mengembalikan BARIS DB
 * (snake_case) yang dipetakan `mapTelefunSessionRow`. Nama camelCase di sini
 * membuat baris ter-render kosong tanpa error, jadi fixture memakai nama
 * kolom yang sebenarnya.
 */

export type TelefunRow = {
  id: string;
  created_at?: string;
  consumer_name?: string;
  consumer_phone?: string;
  consumer_city?: string;
  scenario_title?: string;
  duration_seconds?: number;
  configured_duration?: number;
  recording_path?: string | null;
  agent_recording_path?: string | null;
  score?: number | null;
  feedback?: string | null;
  scoring_status?: "pending" | "processing" | "completed" | "failed";
  scoring_retryable?: boolean;
  simulationSubject?: unknown;
  voice_assessment?: unknown;
  session_metrics?: unknown;
  messages?: unknown;
  /** `GET /sessions?view=list`: no transcript, Telaah reads the full row. */
  detail?: "summary";
};

/** Tanggal relatif ke hari ini, supaya "panggilan bulan ini" tidak basi. */
export function daysAgo(days: number, hour = 3): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const aspect = (score: number, verdict: string, feedback: string) => ({
  score,
  verdict,
  feedback,
});

export function voiceAssessment(
  overrides: Partial<Record<string, number>> = {},
) {
  const s = {
    overall: 7.6,
    rate: 7.2,
    intonation: 8.4,
    articulation: 8.8,
    fillers: 5.2,
    tone: 7.8,
    hold: 9,
    ...overrides,
  };
  return {
    overallScore: s.overall,
    speakingRate: {
      ...aspect(s.rate, "Agak cepat", "Penjelasan aturan terlalu cepat."),
      wordsPerMinute: 158,
    },
    intonation: aspect(s.intonation, "Baik", "Intonasi naik turun wajar."),
    articulation: aspect(s.articulation, "Baik", "Pengucapan jelas."),
    fillerWords: {
      ...aspect(
        s.fillers,
        "Perlu perbaikan",
        "Jeda diisi dengan kata pengisi saat mencari jawaban.",
      ),
      count: 7,
      examples: ["eee", "jadi gini"],
    },
    emotionalTone: {
      ...aspect(s.tone, "Baik", "Nada tenang sepanjang panggilan."),
      dominant: "tenang",
    },
    transcript: "",
    highlights: [],
    strengths: ["Menyapa dengan salam lengkap"],
    holdManagement: {
      status: "within_limit",
      score: s.hold,
      verdict: "Baik",
      feedback: "Hold dipakai sekali dan sesuai batas.",
      holdCount: 1,
      totalDurationMs: 27000,
      longestDurationMs: 27000,
      exceededCount: 0,
    },
  };
}

export const REVIEWED_ROW: TelefunRow = {
  id: "telefun-reviewed-1",
  created_at: daysAgo(0),
  consumer_name: "Rina Susanti",
  consumer_phone: "0813-0000-2207",
  consumer_city: "Medan",
  scenario_title: "Klaim Asuransi Ditolak",
  duration_seconds: 252,
  configured_duration: 300,
  recording_path: "user-1/telefun-reviewed-1/full.webm",
  agent_recording_path: "user-1/telefun-reviewed-1/agent.webm",
  score: 7.6,
  scoring_status: "completed",
  simulationSubject: {
    type: "participant",
    participantId: "p-1",
    displayName: "Sinta Maharani",
    batchName: "Batch 7",
    team: "Tim B",
  },
  voice_assessment: voiceAssessment(),
  session_metrics: {
    speechSegments: [],
    totalSpeakingMs: 0,
    totalSilenceMs: 0,
    deadAirCount: 0,
    interruptionCount: 0,
    volumeSamples: [],
    volumeConsistency: 0,
    inputTranscriptionChunks: [],
    sessionDurationMs: 252000,
    hold: {
      count: 1,
      totalDurationMs: 27000,
      longestDurationMs: 27000,
      exceededCount: 0,
      intervals: [
        {
          sequence: 1,
          startedAtMs: 121000,
          endedAtMs: 148000,
          durationMs: 27000,
          limitMs: 60000,
          exceededByMs: 0,
        },
      ],
    },
  },
  messages: [
    {
      speaker: "consumer",
      text: "Halo, saya mau tanya, kok klaim asuransi saya ditolak?",
      startMs: 4000,
    },
    {
      speaker: "agent",
      text: "Selamat siang Ibu, dengan Kontak OJK 157. Boleh saya catat nama perusahaannya?",
      startMs: 11000,
    },
    {
      speaker: "consumer",
      text: "Asuransi Sejahtera Mulia.",
      startMs: 24000,
    },
    {
      speaker: "agent",
      text: "Eee, baik Bu, jadi gini, saya cek dulu ya aturannya.",
      startMs: 36000,
    },
    {
      speaker: "agent",
      text: "Ibu, perusahaan wajib menjelaskan dasar penolakannya secara tertulis.",
      startMs: 78000,
    },
    {
      speaker: "consumer",
      text: "Terus saya harus ngapain sekarang?",
      startMs: 150000,
    },
  ],
};

/** Anotasi isi dari AI; kutipan disalin dari `REVIEWED_ROW.messages`. */
export const CONTENT_REVIEW = {
  caseCore:
    "Klaim asuransi konsumen ditolak; ia ingin tahu alasannya dan langkah berikutnya.",
  consumerPoints: [
    {
      startMs: 4000,
      quote: "kok klaim asuransi saya ditolak",
      summary: "Alasan klaim ditolak",
      status: "partial",
      reason:
        "Agen menyebut kewajiban penjelasan tertulis, tetapi belum menjelaskan alasannya.",
      answerStartMs: 78000,
      answerQuote:
        "perusahaan wajib menjelaskan dasar penolakannya secara tertulis",
    },
    {
      startMs: 150000,
      quote: "Terus saya harus ngapain sekarang?",
      summary: "Langkah berikutnya",
      status: "unanswered",
      reason: "Panggilan berakhir sebelum agen memberi langkah.",
      answerStartMs: null,
      answerQuote: null,
    },
  ],
  agentNotes: [
    {
      startMs: 11000,
      quote: "Boleh saya catat nama perusahaannya?",
      verdict: "good",
      note: "Menggali data perusahaan sebelum menjawab.",
      example: null,
    },
    {
      startMs: 36000,
      quote: "saya cek dulu ya aturannya",
      verdict: "fix",
      note: "Konsumen tidak tahu berapa lama harus menunggu.",
      example: "Mohon izin, saya cek aturannya sekitar satu menit ya, Bu.",
    },
  ],
};

/** Penilaian suara yang sudah memuat anotasi isi. */
export function annotatedAssessment(
  overrides: Partial<Record<string, number>> = {},
) {
  return { ...voiceAssessment(overrides), contentReview: CONTENT_REVIEW };
}

export const ANNOTATED_ROW: TelefunRow = {
  ...REVIEWED_ROW,
  voice_assessment: annotatedAssessment(),
};

/** Telaah lebih lama: dasar rata-rata dan fokus. */
export const OLDER_REVIEWED_ROW: TelefunRow = {
  ...REVIEWED_ROW,
  id: "telefun-reviewed-0",
  created_at: daysAgo(2),
  scenario_title: "Pengecekan SLIK",
  consumer_name: "Dewi Lestari",
  score: 7.2,
  simulationSubject: {
    type: "self",
    participantId: null,
    displayName: "Trainer E2E",
    batchName: null,
    team: null,
  },
  voice_assessment: voiceAssessment({ overall: 7.2, fillers: 6.4, rate: 6 }),
};

export const FAILED_ROW: TelefunRow = {
  id: "telefun-failed-1",
  created_at: daysAgo(1, 5),
  consumer_name: "Budi Hartono",
  consumer_city: "Bekasi",
  scenario_title: "Pinjol Ilegal",
  duration_seconds: 300,
  recording_path: "user-1/telefun-failed-1/full.webm",
  agent_recording_path: "user-1/telefun-failed-1/agent.webm",
  score: null,
  scoring_status: "failed",
  scoring_retryable: false,
  messages: [
    {
      speaker: "agent",
      text: "Selamat pagi, ada yang bisa dibantu?",
      startMs: 1000,
    },
  ],
};

export const PENDING_ROW: TelefunRow = {
  id: "telefun-pending-1",
  created_at: daysAgo(1),
  consumer_name: "Ahmad Fauzi",
  consumer_city: "Surabaya",
  scenario_title: "Tagihan Kartu Kredit",
  duration_seconds: 240,
  recording_path: "user-1/telefun-pending-1/full.webm",
  agent_recording_path: "user-1/telefun-pending-1/agent.webm",
  score: null,
  scoring_status: "pending",
  messages: [
    {
      speaker: "agent",
      text: "Selamat siang, dengan Kontak OJK.",
      startMs: 1500,
    },
  ],
};

/** Sesi tanpa rekaman: suara tidak bisa dinilai. */
export const NO_RECORDING_ROW: TelefunRow = {
  id: "telefun-norec-1",
  created_at: daysAgo(1, 7),
  consumer_name: "Sari Wulandari",
  consumer_city: "Bandung",
  scenario_title: "Restrukturisasi Kredit",
  duration_seconds: 180,
  recording_path: null,
  agent_recording_path: null,
  score: null,
  messages: [],
};

export const FULL_HISTORY: readonly TelefunRow[] = [
  REVIEWED_ROW,
  NO_RECORDING_ROW,
  FAILED_ROW,
  PENDING_ROW,
  OLDER_REVIEWED_ROW,
];

export function telefunMocks(
  history: readonly TelefunRow[],
  settings: unknown = {},
  /** Jumlah panggilan bulan ini dari server (`GET /sessions/month-count`). */
  monthCount: number = history.length,
): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/telefun/settings",
      body: { success: true, data: settings },
    },
    {
      method: "GET",
      path: "/api/v1/telefun/sessions/month-count",
      body: { success: true, data: { count: monthCount } },
    },
    {
      method: "GET",
      path: "/api/v1/telefun/sessions",
      body: { success: true, data: history },
    },
  ];
}

/** Alamat rekaman "bertanda tangan" yang dilayani route lokal di bawah. */
export const RECORDING_URL = `${APP_ORIGIN}/e2e-telefun-recording.wav`;

export function recordingMock(id: string): ApiMock {
  return {
    method: "GET",
    path: `/api/v1/telefun/recording/${id}`,
    body: { success: true, data: { url: RECORDING_URL } },
  };
}

/** WAV PCM 8-bit mono berisi senyap, cukup panjang untuk diputar dan digeser. */
function silentWav(seconds: number, sampleRate = 4000): Buffer {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples, 0x80);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples, 40);
  return buffer;
}

/**
 * Jawab permintaan rekaman seperti storage sungguhan: dukung `Range`, karena
 * pemutar Chromium tidak bisa menggeser rekaman tanpa respons 206.
 */
function fulfillAudio(route: Route, body: Buffer) {
  const range = /bytes=(\d+)-(\d*)/.exec(
    route.request().headers()["range"] ?? "",
  );
  if (!range) {
    return route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes" },
      body,
    });
  }
  const start = Number(range[1]);
  const end = range[2] ? Number(range[2]) : body.length - 1;
  return route.fulfill({
    status: 206,
    contentType: "audio/wav",
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${body.length}`,
    },
    body: body.subarray(start, end + 1),
  });
}

/** Rekaman suara agen saja (`?type=agent_only`). */
export const AGENT_RECORDING_URL = `${APP_ORIGIN}/e2e-telefun-agent.wav`;

/** Didaftarkan sebelum `recordingMock` supaya permintaan `agent_only` cocok di sini. */
export function agentRecordingMock(id: string): ApiMock {
  return {
    method: "GET",
    path: new RegExp(`^/api/v1/telefun/recording/${id}\\?type=agent_only$`),
    body: { success: true, data: { url: AGENT_RECORDING_URL } },
  };
}

/** Rentang bunyi dalam detik, `[mulai, selesai)`. */
export type SoundSpan = readonly [number, number];

/** WAV 8-bit mono: senyap, kecuali nada 400 Hz di tiap rentang `spans`. */
export function speechWav(
  seconds: number,
  spans: readonly SoundSpan[],
  sampleRate = 4000,
): Buffer {
  const buffer = silentWav(seconds, sampleRate);
  for (const [from, to] of spans) {
    for (let i = from * sampleRate; i < to * sampleRate; i += 1) {
      const phase = Math.floor((i * 400 * 2) / sampleRate) % 2;
      buffer[44 + i] = phase ? 0xc0 : 0x40;
    }
  }
  return buffer;
}

/** Layani rekaman gabungan dan rekaman agen dengan bunyi pada rentang tertentu. */
export async function serveSpeechRecordings(
  page: Page,
  spans: { full: readonly SoundSpan[]; agent: readonly SoundSpan[] },
  seconds = 252,
) {
  const full = speechWav(seconds, spans.full);
  const agent = speechWav(seconds, spans.agent);
  await page.route(RECORDING_URL, (route: Route) => fulfillAudio(route, full));
  await page.route(AGENT_RECORDING_URL, (route: Route) =>
    fulfillAudio(route, agent),
  );
}

/**
 * Layani rekaman WAV dari route khusus. Didaftarkan SETELAH
 * `openHermeticShell`, sehingga route ini didahulukan untuk URL rekaman saja.
 */
export async function serveRecording(page: Page, seconds = 252) {
  const body = silentWav(seconds);
  await page.route(RECORDING_URL, (route: Route) => fulfillAudio(route, body));
}

/**
 * Server suara Telefun tiruan di `VITE_TELEFUN_WS_URL` E2E. Panggil SEBELUM halaman dimuat: `routeWebSocket` hanya berlaku untuk dokumen baru. Menjawab jabat
 * tangan Gemini Live secukupnya: autentikasi, konfigurasi, setup, dan akhir
 * sesi. Tidak ada audio model; agen berada di status "Giliran Anda".
 */
export async function mockTelefunVoiceServer(
  page: Page,
  sessionId: string,
  /** Diisi setiap pesan JSON dari aplikasi, untuk memeriksa isi instruksi. */
  messages: Record<string, unknown>[] = [],
  options: {
    failAttempt?: number;
    failAfterPickup?: boolean;
  } = {},
) {
  const received: string[] = [];
  let attempt = 0;
  await page.routeWebSocket(`${E2E_TELEFUN_WS_URL}/ws`, (ws) => {
    const currentAttempt = ++attempt;
    let failed = false;
    const fail = () => {
      failed = true;
      // The active client reports terminal errors through WebSocket close,
      // not a JSON `error` frame (which it deliberately ignores).
      ws.close({ code: 1011, reason: "E2E voice failure" });
    };
    ws.onMessage((message) => {
      if (typeof message !== "string") return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(message);
      } catch {
        return;
      }
      const type = typeof parsed.type === "string" ? parsed.type : "setup";
      received.push(type);
      messages.push(parsed);
      if (
        currentAttempt === options.failAttempt &&
        !failed &&
        (options.failAfterPickup
          ? "realtimeInput" in parsed
          : parsed.type === "authenticate")
      ) {
        fail();
        return;
      }
      if (parsed.type === "authenticate") {
        const requestedId =
          typeof parsed.sessionId === "string" ? parsed.sessionId : sessionId;
        ws.send(JSON.stringify({ type: "auth_ok", sessionId: requestedId }));
      } else if (parsed.type === "telefun_session_configure") {
        ws.send(JSON.stringify({ type: "telefun_session_configured" }));
      } else if ("setup" in parsed) {
        ws.send(JSON.stringify({ setupComplete: {} }));
      } else if (parsed.type === "session_end_request") {
        ws.send(
          JSON.stringify({
            type: "session_end_complete",
            outcome: "completed",
          }),
        );
      }
    });
  });
  return received;
}

/** Portrait fixtures are fulfilled locally; no randomuser.me egress. */
export async function mockTelefunAvatar(page: Page, fail = false) {
  await page.route("https://randomuser.me/api/portraits/**", (route) =>
    fail
      ? route.abort("failed")
      : route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
  );
}

/**
 * Unggah rekaman ke Supabase Storage tiruan. Didaftarkan setelah harness
 * supaya hanya jalur storage ini yang dijawab; jalur Supabase lain tetap
 * diblokir oleh harness.
 */
export async function mockRecordingUpload(page: Page) {
  const uploads: string[] = [];
  await page.route(
    `${E2E_SUPABASE_URL}/storage/v1/object/telefun-recordings/**`,
    (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        "/storage/v1/object/telefun-recordings/",
        "",
      );
      uploads.push(path);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Key: `telefun-recordings/${path}`, Id: path }),
      });
    },
  );
  return uploads;
}
