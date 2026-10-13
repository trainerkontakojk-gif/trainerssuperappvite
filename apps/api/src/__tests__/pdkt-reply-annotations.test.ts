import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCallAI = vi.hoisted(() => vi.fn());

// evaluation-service mengimpor klien AI/Supabase lewat shared-utils; tes ini
// memakai jawaban AI tiruan.
vi.mock("../services/pdkt/shared-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pdkt/shared-utils")>()),
  callAI: mockCallAI,
}));

import type { EmailMessage } from "@trainers/types";
import { readPdktReplyAnnotations } from "../services/pdkt/reply-annotations";
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

  it("membuang item tidak valid dan membatasi 8 catatan", () => {
    const valid = Array.from({ length: 10 }, (_, i) =>
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
    expect(results).toHaveLength(8);
    expect(results.map((item) => item.quote)).toEqual(
      valid.slice(0, 8).map((item) => item.quote),
    );
    expect(readPdktReplyAnnotations("bukan array", REPLY)).toEqual([]);
    expect(readPdktReplyAnnotations(undefined, REPLY)).toEqual([]);
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
  });

  it("membuang annotations rusak tanpa menghilangkan penilaian", () => {
    const result = normalizePdktEvaluation({
      ...stored,
      annotations: [{ quote: "x", dimension: "tone", note: "y", start: 0, end: 1 }],
    });
    expect(result?.score).toBe(70);
    expect(result?.annotations).toBeUndefined();
  });
});
