import { describe, expect, it } from "vitest";
import type { TelefunTranscriptEntry } from "@trainers/types";
import { normalizeTelefunContentReview } from "../lib/telefun-content-review";

/**
 * Kutipan anotasi isi hanya cocok pada kata utuh. Pencocokan ini berjalan di
 * backend sebelum disimpan, jadi E2E hermetic (yang memock /api) tidak
 * menjangkaunya.
 */

const transcript: TelefunTranscriptEntry[] = [
  {
    speaker: "consumer",
    text: "Saya mau bicara dengan bapaku dulu.",
    startMs: 1_000,
  },
  { speaker: "agent", text: "Baik, silakan Bu.", startMs: 4_000 },
  {
    speaker: "consumer",
    text: "Aku sudah bayar, kenapa masih ditagih?",
    startMs: 8_000,
  },
  {
    speaker: "agent",
    text: "Mohon maaf, saya cek dulu tagihannya.",
    startMs: 12_000,
  },
];

/** Satu poin konsumen tanpa nomor baris, supaya kutipan dicari di semua baris. */
function consumerPoint(quote: string) {
  const review = normalizeTelefunContentReview(
    {
      caseCore: "Konsumen merasa sudah membayar.",
      consumerPoints: [
        { line: null, quote, summary: "Tagihan ganda", status: "partial" },
      ],
      agentNotes: [],
    },
    transcript,
  );
  return review.consumerPoints[0] ?? null;
}

describe("telefun content review quote matching", () => {
  it("skips a mid-word match on an earlier line and anchors on the whole word", () => {
    expect(consumerPoint("aku")).toMatchObject({
      startMs: 8_000,
      quote: "Aku",
    });
  });

  it("drops a quote whose only occurrence is inside another word", () => {
    expect(consumerPoint("pak")).toBeNull();
  });

  it("drops a multi-word quote cut mid-word at either end", () => {
    expect(consumerPoint("ku sudah bay")).toBeNull();
  });

  it("matches at line edges, ignoring case and punctuation, and keeps the original text", () => {
    expect(consumerPoint("aku sudah bayar kenapa")).toMatchObject({
      startMs: 8_000,
      quote: "Aku sudah bayar, kenapa",
    });
    expect(consumerPoint("masih ditagih")).toMatchObject({
      startMs: 8_000,
      quote: "masih ditagih",
    });
  });

  it("finds a later whole-word occurrence on the same line after a mid-word one", () => {
    const review = normalizeTelefunContentReview(
      {
        caseCore: null,
        consumerPoints: [],
        agentNotes: [
          { line: 4, quote: "cek", verdict: "good", note: "Agen memeriksa." },
        ],
      },
      // Huruf kapital membedakan kata utuh "CEK" dari "cek" di dalam "Dicek".
      [{ speaker: "agent", text: "Dicek? Ya, saya CEK dulu.", startMs: 2_000 }],
    );
    expect(review.agentNotes[0]).toMatchObject({
      startMs: 2_000,
      quote: "CEK",
    });
  });
});
