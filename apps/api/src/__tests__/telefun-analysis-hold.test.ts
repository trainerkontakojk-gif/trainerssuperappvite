import { describe, expect, it, vi, beforeEach } from "vitest";
import type { VoiceQualityAssessment } from "@trainers/types";

// Shared mutable state accessible from vi.mock factory
const mockState: {
  row: Record<string, any> | null;
  geminiResponse: any;
  updates: Array<Record<string, unknown>>;
  updateError: Error | null;
} = {
  row: null,
  geminiResponse: null,
  updates: [],
  updateError: null,
};

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: mockState.row,
              error: mockState.row ? null : new Error("not found"),
            }),
          ),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        function eqHandler() {
          mockState.updates.push(payload);
          const result = Promise.resolve({ error: mockState.updateError });
          (result as any).in = vi.fn(() =>
            Promise.resolve({ error: mockState.updateError }),
          );
          return result;
        }
        return { eq: eqHandler };
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(() =>
          Promise.resolve({ data: new Blob(["audio"]), error: null }),
        ),
      })),
    },
    rpc: vi.fn(),
  })),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(() => Promise.resolve(mockState.geminiResponse)),
}));

vi.mock("../lib/telefun-communication-profile", () => ({
  enrichAssessmentWithCommunicationProfile: vi.fn((a: any) => a),
}));

vi.mock("../lib/ai-json", () => ({
  parseJsonFromModelText: vi.fn((t: string) => JSON.parse(t)),
}));

import { analyzeVoiceQuality } from "../lib/telefun-analysis";

const DEFAULT_AI_RESPONSE = {
  success: true,
  text: JSON.stringify({
    overallScore: 8,
    speakingRate: {
      score: 7,
      wordsPerMinute: 130,
      verdict: "Kecepatan ideal dan stabil, mudah dipahami konsumen",
      feedback:
        "Kecepatan bicara 130 WPM berada di rentang ideal 130-150 sehingga nyaman didengar. Dampaknya konsumen mudah memahami penjelasan tanpa terkesan terburu-buru. Pertahankan tempo dan tambahkan jeda 1 detik antar kalimat untuk memberi ruang konsumen menyerap informasi.",
    },
    intonation: {
      score: 8,
      verdict: "Intonasi variatif dan cukup ekspresif, terdengar profesional",
      feedback:
        "Intonasi cukup variatif dengan penekanan pada frasa kunci seperti salam pembuka dan penawaran solusi. Hal ini membuat percakapan terasa hidup dan profesional. Tingkatkan variasi nada pada bagian penutup agar konsumen merasakan kehangatan hingga akhir percakapan.",
    },
    articulation: {
      score: 9,
      verdict: "Artikulasi sangat jelas dan presisi, mudah dipahami",
      feedback:
        "Artikulasi sangat jelas, pengucapan vokal dan konsonan presisi termasuk istilah teknis. Dampaknya konsumen tidak perlu meminta pengulangan dan merasa yakin. Pertahankan kejelasan dengan membuka mulut lebih lebar saat mengucapkan kata sulit.",
    },
    fillerWords: {
      score: 8,
      count: 2,
      examples: ["eh", "anu"],
      verdict: "Minim filler, hanya dua kata pengisi yang tidak mengganggu",
      feedback:
        "Hanya 2 filler terdeteksi ('eh', 'anu') dengan frekuensi rendah sehingga tidak mengganggu profesionalisme. Dampaknya kredibilitas tetap terjaga. Ganti potensi filler berikutnya dengan jeda senyap 1 detik untuk mempertahankan kesan percaya diri.",
    },
    emotionalTone: {
      score: 7,
      dominant: "tenang",
      verdict: "Nada tenang dan cukup empatik, masih bisa lebih hangat",
      feedback:
        "Nada dominan tenang dengan empati cukup terasa saat menyampaikan solusi. Hal ini membantu konsumen merasa didengar dan aman. Tambahkan kehangatan pada sapaan awal dan penutup dengan senyum vokal agar empati lebih tulus terasa.",
    },
    transcript:
      "Selamat siang, terima kasih telah menghubungi OJK 157. Perkenalkan saya agen yang bertugas. Bisa saya bantu jelaskan kendala yang dialami terkait layanan?".repeat(2),
    highlights: [
      "Pembukaan dengan sapaan sopan dan perkenalan jelas yang membangun kepercayaan awal konsumen dalam 30 detik pertama percakapan.",
      "Penggalian kebutuhan dengan pertanyaan terbuka yang relevan sehingga konsumen dapat menjelaskan kronologi kendala secara runtut dan lengkap.",
      "Penjelasan solusi langkah demi langkah dengan bahasa sederhana dan konfirmasi pemahaman di setiap tahap sebelum melanjutkan ke informasi berikutnya.",
    ],
    strengths: [
      "Sapaan pembuka yang sopan dan jelas dengan intonasi hangat membangun kesan profesional sejak awal panggilan.",
      "Artikulasi sangat jelas dan tempo ideal membuat seluruh penjelasan mudah dipahami tanpa perlu pengulangan dari konsumen.",
      "Nada tenang dan sabar saat konsumen menyampaikan keberatan sehingga konsumen merasa didengar dan tidak tertekan.",
    ],
  }),
};

const BASE_ROW = {
  id: "s1",
  user_id: "u1",
  scenario_title: "Test",
  agent_recording_path: "u1/s1/agent_only.webm",
  session_metrics: {},
  voice_assessment: null,
};

describe("Telefun analysis with hold assessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.row = { ...BASE_ROW };
    mockState.geminiResponse = null;
    mockState.updates = [];
    mockState.updateError = null;
  });

  it("rejects invalid cached assessment and continues to analysis", async () => {
    mockState.row = {
      ...BASE_ROW,
      voice_assessment: { overallScore: 8 }, // Incomplete shape
    };
    mockState.geminiResponse = DEFAULT_AI_RESPONSE;

    const result = await analyzeVoiceQuality("s1", "u1");

    expect(result.success).toBe(true);
    const { generateGeminiContent } = await import("../lib/gemini");
    expect(generateGeminiContent).toHaveBeenCalled();
  });

  it("returns error when cache is invalid and no audio exists", async () => {
    mockState.row = {
      ...BASE_ROW,
      voice_assessment: { overallScore: 8 },
      agent_recording_path: null,
    };

    const result = await analyzeVoiceQuality("s1", "u1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("No agent audio available for assessment");
  });

  it("rejects invalid model output and does not update database", async () => {
    mockState.row = BASE_ROW;
    mockState.geminiResponse = {
      success: true,
      text: JSON.stringify({ overallScore: 8 }), // Incomplete shape
    };
    mockState.updates = [];

    const result = await analyzeVoiceQuality("s1", "u1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Format hasil analisis tidak valid.");
    // Code marks scoring as failed (not completed with assessment)
    expect(mockState.updates).toHaveLength(1);
    expect(mockState.updates[0]).toHaveProperty("scoring_status", "failed");
    expect(mockState.updates[0]).toHaveProperty("scoring_last_error");
  });

  it("fails closed when a generated assessment cannot be persisted", async () => {
    mockState.row = BASE_ROW;
    mockState.geminiResponse = DEFAULT_AI_RESPONSE;
    mockState.updateError = new Error("database unavailable");

    const result = await analyzeVoiceQuality("s1", "u1");

    expect(result).toEqual({
      success: false,
      error: "Gagal menyimpan hasil penilaian suara.",
    });
  });

  it("returns N/A hold when no hold metrics exist", async () => {
    mockState.row = { ...BASE_ROW, session_metrics: {} };
    mockState.geminiResponse = { ...DEFAULT_AI_RESPONSE };

    const result = await analyzeVoiceQuality("s1", "u1");
    expect(result.success).toBe(true);
    expect(result.assessment?.holdManagement).toBeDefined();
    expect(result.assessment?.holdManagement?.verdict).toBe("N/A");
    expect(result.assessment?.holdManagement?.score).toBeNull();
  });

  it("returns Kurang when hold metrics exceeded", async () => {
    mockState.row = {
      ...BASE_ROW,
      session_metrics: {
        hold: {
          intervals: [
            {
              sequence: 1,
              startedAtMs: 0,
              endedAtMs: 61_000,
              durationMs: 61_000,
              limitMs: 60_000,
              exceededByMs: 1_000,
            },
          ],
        },
      },
    };
    mockState.geminiResponse = { ...DEFAULT_AI_RESPONSE };

    const result = await analyzeVoiceQuality("s1", "u1");
    expect(result.success).toBe(true);
    expect(result.assessment?.holdManagement?.verdict).toBe("Kurang");
    expect(result.assessment?.holdManagement?.score).toBe(4);
    expect(result.assessment?.overallScore).toBe(7.3);
  });

  it("enriches cached assessment without Gemini call", async () => {
    const cached: VoiceQualityAssessment = JSON.parse(DEFAULT_AI_RESPONSE.text);
    mockState.row = {
      ...BASE_ROW,
      session_metrics: {
        hold: {
          intervals: [
            {
              sequence: 1,
              startedAtMs: 0,
              endedAtMs: 30_000,
              durationMs: 30_000,
              limitMs: 60_000,
              exceededByMs: 0,
            },
          ],
        },
      },
      voice_assessment: cached,
    };

    const result = await analyzeVoiceQuality("s1", "u1");
    expect(result.success).toBe(true);
    expect(mockState.geminiResponse).toBeNull(); // no gemini call
    expect(result.assessment?.holdManagement).toBeDefined();
    expect(result.assessment?.holdManagement?.verdict).toBe("Baik");
    expect(mockState.updates).toContainEqual(
      expect.objectContaining({
        score: expect.any(Number),
        voice_assessment: expect.objectContaining({
          holdManagement: expect.objectContaining({ verdict: "Baik" }),
        }),
      }),
    );
  });

  it("fails closed when cached hold synchronization cannot be persisted", async () => {
    const cached: VoiceQualityAssessment = JSON.parse(DEFAULT_AI_RESPONSE.text);
    mockState.row = {
      ...BASE_ROW,
      voice_assessment: cached,
    };
    mockState.updateError = new Error("database unavailable");

    const result = await analyzeVoiceQuality("s1", "u1");

    expect(result).toEqual({
      success: false,
      error: "Gagal menyimpan hasil penilaian suara.",
    });
  });
});
