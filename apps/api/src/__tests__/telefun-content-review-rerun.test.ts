import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseVoiceQualityAssessment,
  TELEFUN_AGENT_NOTE_LIMIT,
  type TelefunTranscriptEntry,
} from "@trainers/types";

/**
 * Kontrak backend yang tidak terjangkau E2E hermetic (yang memock /api):
 * validasi kutipan anotasi isi dan pemulihan Telaah ulang di server.
 * Gemini dan Supabase dimock; tidak ada AI sungguhan.
 */

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  analyzeVoiceQuality: vi.fn(),
  generateCoachingSummary: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: mocks.createAdminClient,
  supabaseAdmin: {},
}));

vi.mock("../lib/telefun-analysis", () => ({
  analyzeVoiceQuality: mocks.analyzeVoiceQuality,
  generateCoachingSummary: mocks.generateCoachingSummary,
}));

import {
  normalizeTelefunContentReview,
  telefunContentReviewResponseSchema,
} from "../lib/telefun-content-review";
import { telefunRerun } from "../routes/telefun/rerun";

const USER_ID = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
const SESSION_ID = "019f45e3-5fac-7cd2-afeb-000000000001";

const TRANSCRIPT: TelefunTranscriptEntry[] = [
  {
    speaker: "consumer",
    text: "Kok klaim asuransi saya ditolak?",
    startMs: 4000,
  },
  {
    speaker: "agent",
    text: "Boleh saya catat nama perusahaannya?",
    startMs: 11000,
  },
  {
    speaker: "consumer",
    text: "Terus saya harus ngapain sekarang?",
    startMs: 24000,
  },
  {
    speaker: "agent",
    text: "Perusahaan wajib menjelaskan  dasar penolakannya secara tertulis.",
    startMs: 36000,
  },
];

describe("normalizeTelefunContentReview", () => {
  it("menyimpan kutipan yang ada dan memetakan baris ke startMs", () => {
    const review = normalizeTelefunContentReview(
      {
        caseCore: "  Klaim ditolak.  ",
        consumerPoints: [
          {
            line: 1,
            quote: "klaim asuransi saya ditolak",
            summary: "Alasan penolakan",
            status: "partial",
            reason: null,
            answerLine: 4,
            // Spasi ganda di transkrip tetap cocok.
            answerQuote: "wajib menjelaskan dasar penolakannya",
          },
        ],
        agentNotes: [],
      },
      TRANSCRIPT,
    );
    expect(review.caseCore).toBe("Klaim ditolak.");
    expect(review.consumerPoints).toEqual([
      {
        startMs: 4000,
        quote: "klaim asuransi saya ditolak",
        summary: "Alasan penolakan",
        status: "partial",
        reason: null,
        answerStartMs: 36000,
        // Disimpan persis seperti di transkrip, termasuk spasi gandanya.
        answerQuote: "wajib menjelaskan  dasar penolakannya",
      },
    ]);
  });

  it("membuang kutipan karangan dan menolak kutipan agen di baris konsumen", () => {
    const review = normalizeTelefunContentReview(
      {
        consumerPoints: [
          {
            line: 1,
            quote: "saya mau refund",
            summary: "x",
            status: "answered",
          },
          // Kalimat agen tidak boleh menjadi pertanyaan konsumen.
          {
            line: 2,
            quote: "Boleh saya catat nama perusahaannya?",
            summary: "x",
            status: "answered",
          },
        ],
        agentNotes: [
          { line: 1, quote: "Kok klaim asuransi", verdict: "good", note: "x" },
        ],
      },
      TRANSCRIPT,
    );
    expect(review.consumerPoints).toEqual([]);
    expect(review.agentNotes).toEqual([]);
  });

  it("memperbaiki nomor baris yang salah dengan mencari di baris pembicara yang sama", () => {
    const review = normalizeTelefunContentReview(
      {
        consumerPoints: [
          {
            line: 1,
            quote: "harus ngapain sekarang",
            summary: "Langkah berikutnya",
            status: "unanswered",
          },
        ],
      },
      TRANSCRIPT,
    );
    expect(review.consumerPoints[0]?.startMs).toBe(24000);
  });

  it("jawaban tanpa kutipan valid menjadi null, poinnya tetap ada", () => {
    const [point] = normalizeTelefunContentReview(
      {
        consumerPoints: [
          {
            line: 3,
            quote: "harus ngapain sekarang",
            summary: "Langkah berikutnya",
            status: "unanswered",
            answerLine: 4,
            answerQuote: "silakan ajukan banding",
          },
        ],
      },
      TRANSCRIPT,
    ).consumerPoints;
    expect(point?.answerStartMs).toBeNull();
    expect(point?.answerQuote).toBeNull();
  });

  it("contoh kalimat hanya untuk verdict fix; status dan verdict asing dibuang", () => {
    const review = normalizeTelefunContentReview(
      {
        consumerPoints: [
          { line: 1, quote: "Kok klaim", summary: "x", status: "maybe" },
        ],
        agentNotes: [
          {
            line: 2,
            quote: "nama perusahaannya",
            verdict: "good",
            note: "Menggali data.",
            example: "harus dibuang",
          },
          {
            line: 4,
            quote: "secara tertulis",
            verdict: "fix",
            note: "Kurang empati.",
            example: "Mohon maaf, Bu.",
          },
          { line: 4, quote: "secara tertulis", verdict: "meh", note: "x" },
        ],
      },
      TRANSCRIPT,
    );
    expect(review.consumerPoints).toEqual([]);
    expect(review.agentNotes.map((note) => note.example)).toEqual([
      null,
      "Mohon maaf, Bu.",
    ]);
  });

  it("membatasi 5 poin konsumen dan catatan agen sesuai kontrak", () => {
    const point = {
      line: 1,
      quote: "Kok klaim",
      summary: "x",
      status: "answered",
    };
    const note = { line: 2, quote: "Boleh saya", verdict: "good", note: "x" };
    const review = normalizeTelefunContentReview(
      {
        consumerPoints: Array(9).fill(point),
        agentNotes: Array(TELEFUN_AGENT_NOTE_LIMIT + 4).fill(note),
      },
      TRANSCRIPT,
    );
    expect(review.consumerPoints).toHaveLength(5);
    expect(review.agentNotes).toHaveLength(TELEFUN_AGENT_NOTE_LIMIT);
  });

  it("kutipan cocok walau huruf besar dan tanda baca berbeda; disimpan persis seperti di transkrip", () => {
    const review = normalizeTelefunContentReview(
      {
        consumerPoints: [
          {
            line: 1,
            quote: "kok, klaim asuransi saya ditolak",
            summary: "Alasan penolakan",
            status: "unanswered",
          },
        ],
        agentNotes: [
          {
            line: 4,
            quote:
              "perusahaan wajib menjelaskan dasar penolakannya secara tertulis",
            verdict: "fix",
            note: "Belum memberi langkah.",
            example: "Ibu bisa meminta surat penolakan.",
          },
        ],
      },
      TRANSCRIPT,
    );
    expect(review.consumerPoints[0]?.quote).toBe(
      "Kok klaim asuransi saya ditolak",
    );
    expect(review.agentNotes[0]?.quote).toBe(
      "Perusahaan wajib menjelaskan  dasar penolakannya secara tertulis",
    );
  });

  it("kutipan yang hanya tanda baca dibuang", () => {
    const review = normalizeTelefunContentReview(
      {
        consumerPoints: [
          { line: 1, quote: "?!", summary: "x", status: "answered" },
        ],
      },
      TRANSCRIPT,
    );
    expect(review.consumerPoints).toEqual([]);
  });

  it("skema respons AI mewajibkan field anotasi bila transkrip ada", () => {
    const schema = telefunContentReviewResponseSchema({
      type: "object",
      properties: { overallScore: { type: "number" } },
      required: ["overallScore"],
    });
    expect(schema.required).toEqual([
      "overallScore",
      "caseCore",
      "consumerPoints",
      "agentNotes",
    ]);
    expect(Object.keys(schema.properties)).toEqual([
      "overallScore",
      "caseCore",
      "consumerPoints",
      "agentNotes",
    ]);
  });

  it("respons rusak tetap menghasilkan ketiga field kosong", () => {
    expect(normalizeTelefunContentReview("bukan objek", TRANSCRIPT)).toEqual({
      caseCore: null,
      consumerPoints: [],
      agentNotes: [],
    });
  });
});

type Row = Record<string, unknown>;

/** Supabase palsu satu baris: select/update dengan filter `eq`, dan RPC completion. */
function fakeDatabase(initial: Row) {
  const row: Row = { ...initial };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== "complete_telefun_scoring") return { data: null, error: null };
    const owned =
      row.scoring_status === "processing" &&
      row.scoring_claim_token_hash === args.p_claim_token_hash;
    if (owned) {
      Object.assign(row, {
        scoring_status: "completed",
        score: args.p_score,
        voice_assessment: args.p_voice_assessment,
        scoring_claim_token_hash: null,
      });
    }
    return { data: owned, error: null };
  });
  const from = vi.fn(() => {
    let patch: Row | null = null;
    const filters: Array<() => boolean> = [];
    const matches = () => filters.every((matches) => matches());
    const builder = {
      select: () => builder,
      update: (values: Row) => {
        patch = values;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push(() => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push(() => values.includes(row[column]));
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push(() => row[column] === value);
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator !== "is" || value !== null)
          throw new Error("Unsupported mock filter");
        filters.push(() => row[column] != null);
        return builder;
      },
      maybeSingle: async () => ({
        data: matches() ? { ...row } : null,
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) => {
        if (patch && matches()) {
          Object.assign(row, patch);
          return resolve({ data: [{ id: row.id }], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return builder;
  });
  return { row, client: { from, rpc } };
}

const OLD_ASSESSMENT = { overallScore: 7.6, marker: "lama" };

function completedRow(overrides: Row = {}): Row {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    status: "completed",
    recording_status: "ready",
    recording_error: null,
    recording_path: `${USER_ID}/${SESSION_ID}/full_call.webm`,
    agent_recording_path: `${USER_ID}/${SESSION_ID}/agent_only.webm`,
    scoring_status: "completed",
    telefun_model_id: "gemini-3.1-flash-live-preview",
    telefun_transport: "gemini-live",
    score: 7.6,
    voice_assessment: OLD_ASSESSMENT,
    scoring_claim_token_hash: null,
    ...overrides,
  };
}

function freshAssessment() {
  const aspect = { score: 8.3, verdict: "Baik sekali", feedback: "Baik." };
  const assessment = parseVoiceQualityAssessment({
    overallScore: 8.3,
    speakingRate: { ...aspect, wordsPerMinute: 140 },
    intonation: aspect,
    articulation: aspect,
    fillerWords: { ...aspect, count: 0, examples: [] },
    emotionalTone: { ...aspect, dominant: "tenang" },
    transcript: "Selamat siang.",
    highlights: [],
    strengths: [],
    contentReview: {
      caseCore: "Klaim ditolak.",
      consumerPoints: [],
      agentNotes: [],
    },
  });
  if (!assessment) throw new Error("fixture assessment invalid");
  return assessment;
}

function buildApp() {
  const app = new Hono<any>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("profile", { role: "trainer" });
    await next();
  });
  app.route("/", telefunRerun);
  return app;
}

const rerun = () =>
  buildApp().request(`/score/${SESSION_ID}/rerun`, { method: "POST" });

describe("POST /score/:id/rerun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateCoachingSummary.mockResolvedValue({ success: true });
  });

  it("berhasil: analisis tanpa cache, completion memakai token klaim yang sama", async () => {
    const db = fakeDatabase(completedRow());
    mocks.createAdminClient.mockReturnValue(db.client);
    let claimedToken: unknown = null;
    mocks.analyzeVoiceQuality.mockImplementation(async () => {
      // Selama AI berjalan baris dipegang klaim rerun.
      expect(db.row.scoring_status).toBe("processing");
      claimedToken = db.row.scoring_claim_token_hash;
      return { success: true, assessment: freshAssessment() };
    });

    const response = await rerun();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.analyzeVoiceQuality).toHaveBeenCalledWith(
      SESSION_ID,
      USER_ID,
      undefined,
      { fresh: true, claimTokenHash: claimedToken },
    );
    expect(typeof claimedToken).toBe("string");
    expect(db.client.rpc).toHaveBeenCalledWith(
      "complete_telefun_scoring",
      expect.objectContaining({ p_claim_token_hash: claimedToken }),
    );
    expect(db.row.scoring_status).toBe("completed");
    expect(db.row.score).toBe(8.3);
    expect(body.data.score).toBe(8.3);
    expect(body.data.assessment.contentReview.caseCore).toBe("Klaim ditolak.");
  });

  it("tidak menunggu ringkasan coaching sebelum menjawab", async () => {
    const db = fakeDatabase(completedRow());
    mocks.createAdminClient.mockReturnValue(db.client);
    mocks.analyzeVoiceQuality.mockResolvedValue({
      success: true,
      assessment: freshAssessment(),
    });
    // Panggilan Gemini kedua yang tidak pernah selesai.
    mocks.generateCoachingSummary.mockReturnValue(new Promise(() => {}));

    const response = await rerun();

    expect(response.status).toBe(200);
    expect(mocks.generateCoachingSummary).toHaveBeenCalledWith(
      SESSION_ID,
      USER_ID,
    );
  });

  it("AI gagal: baris kembali completed dengan hasil lama, 502 previousKept", async () => {
    const db = fakeDatabase(completedRow());
    mocks.createAdminClient.mockReturnValue(db.client);
    mocks.analyzeVoiceQuality.mockResolvedValue({
      success: false,
      error: "Gemini assessment failed",
    });

    const response = await rerun();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("RERUN_FAILED");
    expect(body.error.details).toEqual({ previousKept: true });
    expect(body.error.message).not.toContain("Gemini");
    expect(db.row.scoring_status).toBe("completed");
    expect(db.row.scoring_claim_token_hash).toBeNull();
    expect(db.row.voice_assessment).toBe(OLD_ASSESSMENT);
    expect(db.row.score).toBe(7.6);
    expect(db.client.rpc).not.toHaveBeenCalled();
  });

  it("AI melempar galat: hasil lama tetap dipulihkan", async () => {
    const db = fakeDatabase(completedRow());
    mocks.createAdminClient.mockReturnValue(db.client);
    mocks.analyzeVoiceQuality.mockRejectedValue(new Error("timeout"));

    const response = await rerun();

    expect(response.status).toBe(502);
    expect((await response.json()).error.details).toEqual({
      previousKept: true,
    });
    expect(db.row.scoring_status).toBe("completed");
  });

  it.each(["pending", "processing", "failed"])(
    "sesi %s ditolak 409 tanpa memanggil AI",
    async (status) => {
      const db = fakeDatabase(completedRow({ scoring_status: status }));
      mocks.createAdminClient.mockReturnValue(db.client);

      const response = await rerun();

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("SCORING_IN_PROGRESS");
      expect(mocks.analyzeVoiceQuality).not.toHaveBeenCalled();
      expect(db.row.scoring_status).toBe(status);
    },
  );

  it("bukan pemilik sesi: 403 tanpa klaim dan tanpa AI", async () => {
    const db = fakeDatabase(completedRow({ user_id: "pemilik-lain" }));
    mocks.createAdminClient.mockReturnValue(db.client);

    const response = await rerun();

    expect(response.status).toBe(403);
    expect(mocks.analyzeVoiceQuality).not.toHaveBeenCalled();
    expect(db.row.scoring_status).toBe("completed");
  });

  it("sesi tidak ada: 404", async () => {
    const db = fakeDatabase(completedRow({ id: "lain" }));
    db.row.id = "lain";
    mocks.createAdminClient.mockReturnValue(db.client);

    const response = await rerun();

    expect(response.status).toBe(404);
    expect(mocks.analyzeVoiceQuality).not.toHaveBeenCalled();
  });
});
