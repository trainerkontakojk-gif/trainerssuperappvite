import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCallAI = vi.hoisted(() => vi.fn());

// evaluation-service mengimpor klien AI/Supabase lewat shared-utils; tes ini
// memakai jawaban AI tiruan.
vi.mock("../services/pdkt/shared-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pdkt/shared-utils")>()),
  callAI: mockCallAI,
}));

import type { EmailMessage } from "@trainers/types";
import {
  readPdktReplyAnnotations,
  readPdktConsumerPoints,
} from "../services/pdkt/reply-annotations";
import { normalizePdktEvaluation } from "../services/monitoring-history-service";
import {
  buildPdktEvaluationPrompt,
  evaluateAgentResponse,
} from "../services/pdkt/evaluation-service";

/**
 * Tanda kalimat di balasan agent (plan pdkt-reply-annotations.md).
 * Pengecualian non-E2E disetujui Fajar 13 Okt 2026: normalisasi output AI tidak
 * bisa dibuktikan E2E tanpa AI sungguhan.
 */

const REPLY = [
  "Yth. Bapak Budi,",
  "Kami akan melakukan pengecekkan terhadap bukti pelunasan. Penagihan akan kami hentikan setelah data selesai di proses.",
  "Hormat kami,\nKontak OJK 157",
].join("\n\n");

function annotation(quote: string, extra: Record<string, unknown> = {}) {
  return { quote, dimension: "typo", note: "Perbaiki ejaan.", ...extra };
}

beforeEach(() => {
  mockCallAI.mockReset();
});

describe("readPdktReplyAnnotations", () => {
  it("menyimpan posisi kutipan yang persis ada di balasan", () => {
    const [result] = readPdktReplyAnnotations(
      [annotation("pengecekkan")],
      REPLY,
    );
    expect(result).toEqual({
      quote: "pengecekkan",
      dimension: "typo",
      note: "Perbaiki ejaan.",
      start: REPLY.indexOf("pengecekkan"),
      end: REPLY.indexOf("pengecekkan") + "pengecekkan".length,
    });
  });

  it("tetap menemukan kutipan yang spasi atau baris barunya berbeda", () => {
    const [result] = readPdktReplyAnnotations(
      [annotation("Hormat kami, Kontak  OJK 157")],
      REPLY,
    );
    expect(result.start).toBe(REPLY.indexOf("Hormat kami,"));
    expect(REPLY.slice(result.start!, result.end!)).toBe(
      "Hormat kami,\nKontak OJK 157",
    );
  });

  it("menyimpan catatan tanpa posisi bila kutipan tidak ada di balasan", () => {
    const [result] = readPdktReplyAnnotations(
      [annotation("nomor tiket pengaduan", { dimension: "clarity" })],
      REPLY,
    );
    expect(result).toMatchObject({
      quote: "nomor tiket pengaduan",
      dimension: "clarity",
      start: null,
      end: null,
    });
  });

  it("tidak menandai kutipan yang bertumpuk dengan tanda sebelumnya", () => {
    const sentence =
      "Penagihan akan kami hentikan setelah data selesai di proses.";
    const results = readPdktReplyAnnotations(
      [
        annotation(sentence, { dimension: "normative" }),
        annotation("di proses"),
      ],
      REPLY,
    );
    expect(results[0].start).toBe(REPLY.indexOf(sentence));
    expect(results[1]).toMatchObject({
      quote: "di proses",
      start: null,
      end: null,
    });
  });

  it("membuang item tidak valid dan membatasi 12 catatan", () => {
    const valid = Array.from({ length: 14 }, (_, i) =>
      annotation(`kutipan ${i}`),
    );
    const results = readPdktReplyAnnotations(
      [
        annotation("pengecekkan", { dimension: "tone" }),
        annotation("pengecekkan", { note: "   " }),
        annotation("   "),
        "bukan objek",
        ...valid,
      ],
      REPLY,
    );
    expect(results).toHaveLength(12);
    expect(results.map((item) => item.quote)).toEqual(
      valid.slice(0, 12).map((item) => item.quote),
    );
    expect(readPdktReplyAnnotations("bukan array", REPLY)).toEqual([]);
    expect(readPdktReplyAnnotations(undefined, REPLY)).toEqual([]);
  });
});

describe("readPdktConsumerPoints", () => {
  const inbound = "Saldo terpotong. Kapan kembali?";
  const point = (extra: Record<string, unknown> = {}) => ({
    quote: "Saldo terpotong.",
    summary: "Saldo terpotong",
    status: "answered",
    reason: null,
    replyQuote: "pengecekkan",
    ...extra,
  });

  it("menemukan kutipan di email konsumen dan jawaban di balasan", () => {
    const [result] = readPdktConsumerPoints([point()], inbound, REPLY);
    expect(result).toMatchObject({
      start: 0,
      end: "Saldo terpotong.".length,
      replyEnd: REPLY.indexOf("pengecekkan") + "pengecekkan".length,
    });
    const [partial] = readPdktConsumerPoints(
      [
        point({
          status: "partial",
          reason: "Belum tuntas.",
          replyQuote: "Hormat kami, Kontak OJK 157",
        }),
      ],
      inbound,
      REPLY,
    );
    expect(partial.replyEnd).toBe(REPLY.length);
  });

  it("mempertahankan poin tanpa posisi bila kutipan hilang atau bertumpuk", () => {
    const results = readPdktConsumerPoints(
      [
        point(),
        point(),
        point({ quote: "Tidak ada", replyQuote: "Tidak ada" }),
      ],
      inbound,
      REPLY,
    );
    expect(results[1]).toMatchObject({ start: null, end: null });
    expect(results[2]).toMatchObject({
      start: null,
      end: null,
      replyEnd: null,
    });
  });

  it("membuang item rusak, alasan kosong, dan teks melewati batas", () => {
    expect(
      readPdktConsumerPoints(
        [
          null,
          point({ status: "invalid" }),
          point({ quote: " " }),
          point({ summary: " " }),
          point({ quote: "x".repeat(301) }),
          point({ status: "partial", reason: " " }),
          point({ status: "unanswered", reason: null }),
        ],
        inbound,
        REPLY,
      ),
    ).toEqual([]);
    expect(readPdktConsumerPoints(undefined, inbound, REPLY)).toEqual([]);
  });

  it("membatasi lima poin dan tidak menautkan jawaban untuk unanswered", () => {
    const results = readPdktConsumerPoints(
      Array.from({ length: 7 }, () =>
        point({ status: "unanswered", reason: "Belum dijawab." }),
      ),
      inbound,
      REPLY,
    );
    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({ replyQuote: null, replyEnd: null });
  });
});

describe("kalimat penghubung", () => {
  it("memaksa clarity dan membatasi contoh penghubung", () => {
    const [transition, oversized, empty, plain] = readPdktReplyAnnotations(
      [
        annotation("pengecekkan", {
          kind: "transition",
          dimension: "typo",
          example: "Selanjutnya, terkait tagihan,",
        }),
        annotation("Penagihan", {
          kind: "transition",
          example: "x".repeat(10000),
        }),
        annotation("Hormat", { kind: "transition", example: " " }),
        annotation("kami", { example: "Contoh tanpa kind" }),
      ],
      REPLY,
    );
    expect(transition).toMatchObject({
      kind: "transition",
      dimension: "clarity",
      example: "Selanjutnya, terkait tagihan,",
    });
    expect(oversized).not.toHaveProperty("example");
    expect(empty).not.toHaveProperty("example");
    expect(plain).toMatchObject({ example: "Contoh tanpa kind" });
  });
});

describe("annotations di penilaian PDKT", () => {
  const emails: EmailMessage[] = [
    {
      id: "inbound",
      from: "budi@test.com",
      to: "konsumen@ojk.go.id",
      subject: "Tagihan",
      body: "Saya masih ditagih.",
      timestamp: "2026-10-13T00:00:00Z",
      isAgent: false,
    },
    {
      id: "reply",
      from: "agent@ojk.go.id",
      to: "budi@test.com",
      subject: "Re: Tagihan",
      body: REPLY,
      timestamp: "2026-10-13T01:00:00Z",
      isAgent: true,
    },
  ];

  it("meminta kutipan persis dari balasan agent di prompt", () => {
    const { prompt } = buildPdktEvaluationPrompt({
      inboundEmailBody: "Saya masih ditagih.",
      agentReplyBody: REPLY,
    });
    expect(prompt).toContain('"annotations"');
    expect(prompt).toMatch(/quote[^\n]*persis[^\n]*agentReplyBody/);
    const largeBody = "x".repeat(20_000);
    const large = buildPdktEvaluationPrompt({
      inboundEmailBody: largeBody,
      agentReplyBody: largeBody,
      expectedAnswer: "y".repeat(12_000),
    });
    const data = JSON.parse(
      large.prompt
        .split("<evaluation_context_data>\n")[1]
        .split("\n</evaluation_context_data>")[0],
    );
    expect(data.inboundEmailBody).toBe(largeBody);
    expect(data.agentReplyBody).toBe(largeBody);
  });

  it("menyimpan annotations berposisi tanpa membocorkan kunci jawaban", async () => {
    const reference = "minta bukti pelunasan";
    mockCallAI.mockResolvedValueOnce({
      success: true,
      text: JSON.stringify({
        scoreBreakdown: {
          recipientDirectionScore: 80,
          normativeResponseScore: 70,
          clarityScore: 80,
          typoScore: 60,
          templateComplianceScore: 80,
        },
        typos: ["pengecekkan → pengecekan"],
        clarityIssues: [],
        contentGaps: [],
        feedback: "Cukup baik.",
        expectedAnswerAlignment: {
          category: "Hampir sesuai",
          reason: "Kurang detail.",
        },
        annotations: [
          annotation("pengecekkan"),
          annotation("Penagihan akan kami hentikan", {
            dimension: "normative",
            note: `Seharusnya ${reference} dulu.`,
          }),
          annotation("tidak ada di balasan", { dimension: "unknown" }),
        ],
      }),
    });

    const result = await evaluateAgentResponse(
      {
        selectedModel: "gemini-3.1-flash-lite",
        scenarios: [
          {
            id: "s1",
            category: "Pembiayaan",
            title: "Lunas masih ditagih",
            description: "Konsumen masih ditagih.",
            isActive: true,
            expectedAnswer: reference,
          },
        ],
      } as never,
      emails,
    );

    expect(result.success).toBe(true);
    expect(result.annotations).toHaveLength(2);
    expect(result.annotations?.[0]).toMatchObject({
      quote: "pengecekkan",
      start: REPLY.indexOf("pengecekkan"),
    });
    expect(result.annotations?.[1].start).toBe(
      REPLY.indexOf("Penagihan akan kami hentikan"),
    );
    expect(JSON.stringify(result)).not.toContain(reference);
  });

  it.each(["transition", "partial"])(
    "meredaksi field baru tanpa merusak enum %s",
    async (reference) => {
      mockCallAI.mockResolvedValueOnce({
        success: true,
        text: JSON.stringify({
          score: 80,
          typos: [],
          clarityIssues: [],
          contentGaps: [],
          feedback: "Baik.",
          expectedAnswerAlignment: { category: "Sesuai", reason: "Relevan." },
          annotations: [
            annotation("pengecekkan", {
              kind: "transition",
              example: `Pengantar ${reference}`,
            }),
          ],
          consumerPoints: [
            {
              quote: "Saya masih ditagih.",
              summary: `Poin ${reference}`,
              status: "partial",
              reason: `Alasan ${reference}`,
              replyQuote: "pengecekkan",
            },
          ],
        }),
      });
      const result = await evaluateAgentResponse(
        {
          selectedModel: "gemini-3.1-flash-lite",
          scenarios: [{ expectedAnswer: reference }],
        } as never,
        emails,
      );
      expect(result.success).toBe(true);
      expect(result.consumerPoints?.[0]).toMatchObject({
        status: "partial",
        start: 0,
        end: "Saya masih ditagih.".length,
      });
      expect(result.annotations?.[0].kind).toBe("transition");
      for (const text of [
        result.consumerPoints?.[0].summary,
        result.consumerPoints?.[0].reason,
        result.annotations?.[0].example,
      ]) {
        expect(text).not.toContain(reference);
        expect(text).toContain("inti jawaban yang diharapkan");
      }
      expect(mockCallAI).toHaveBeenCalledTimes(1);
    },
  );

  it("consumerPoints bukan array tetap sukses tanpa retry", async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      text: JSON.stringify({
        score: 90,
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        feedback: "Baik.",
        annotations: [],
        consumerPoints: {},
      }),
    });
    const result = await evaluateAgentResponse(
      { selectedModel: "gemini-3.1-flash-lite" } as never,
      emails,
    );
    expect(result.success).toBe(true);
    expect(result.consumerPoints).toEqual([]);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  // Tanpa `annotations` balasan tidak bisa ditandai: penilaian gagal (lalu
  // bisa dicoba lagi), bukan tersimpan seolah lengkap tanpa tanda.
  it("menolak jawaban AI tanpa annotations dan menyimpan annotations kosong", async () => {
    const aiOutput = {
      score: 90,
      typos: [],
      clarityIssues: [],
      contentGaps: [],
      feedback: "Baik.",
    };
    mockCallAI.mockResolvedValue({
      success: true,
      text: JSON.stringify(aiOutput),
    });
    const missing = await evaluateAgentResponse(
      { selectedModel: "gemini-3.1-flash-lite" } as never,
      emails,
    );
    expect(missing.success).toBe(false);

    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: true,
      text: JSON.stringify({ ...aiOutput, annotations: [] }),
    });
    const empty = await evaluateAgentResponse(
      { selectedModel: "gemini-3.1-flash-lite" } as never,
      emails,
    );
    expect(empty.success).toBe(true);
    expect(empty.annotations).toEqual([]);
    expect(empty.consumerPoints).toEqual([]);
  });
});

describe("annotations di review trainer (Monitoring)", () => {
  const stored = {
    score: 70,
    feedback: "Cukup baik.",
    typos: ["pengecekkan → pengecekan"],
    clarityIssues: [],
    contentGaps: [],
    scoreBreakdown: {
      recipientDirectionScore: 80,
      normativeResponseScore: 70,
      clarityScore: 80,
      typoScore: 60,
      templateComplianceScore: 80,
    },
    annotations: [
      {
        quote: "pengecekkan",
        dimension: "typo",
        note: "Perbaiki ejaan.",
        start: 10,
        end: 21,
      },
      {
        quote: "nomor tiket",
        dimension: "clarity",
        note: "Tambahkan nomor tiket.",
        start: null,
        end: null,
      },
    ],
  };

  it("tetap membaca penilaian tersimpan yang memuat annotations", () => {
    const result = normalizePdktEvaluation(stored);
    expect(result).not.toBeNull();
    expect(result?.score).toBe(70);
    expect(result?.annotations).toEqual(stored.annotations);
    const consumerPoints = [
      {
        quote: "Saldo",
        summary: "Saldo terpotong",
        status: "answered",
        reason: null,
        start: 0,
        end: 5,
        replyQuote: "pengecekkan",
        replyEnd: 21,
      },
    ];
    expect(
      normalizePdktEvaluation({ ...stored, consumerPoints })?.consumerPoints,
    ).toEqual(consumerPoints);
    expect(
      normalizePdktEvaluation({ ...stored, consumerPoints: [{}] })?.score,
    ).toBe(70);
    expect(
      normalizePdktEvaluation({ ...stored, consumerPoints: [{}] })
        ?.consumerPoints,
    ).toBeUndefined();
  });

  it("membedakan telaah tanpa temuan dari telaah lama tanpa annotations", () => {
    const { annotations: _annotations, ...legacy } = stored;
    expect(
      normalizePdktEvaluation({ ...stored, annotations: [] })?.annotations,
    ).toEqual([]);
    expect(normalizePdktEvaluation(legacy)).not.toHaveProperty("annotations");
  });

  it("membuang annotations rusak tanpa menghilangkan penilaian", () => {
    const result = normalizePdktEvaluation({
      ...stored,
      annotations: [
        { quote: "x", dimension: "tone", note: "y", start: 0, end: 1 },
      ],
    });
    expect(result?.score).toBe(70);
    expect(result?.annotations).toBeUndefined();
  });
});
