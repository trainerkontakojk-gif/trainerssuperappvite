import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCallAI = vi.hoisted(() => vi.fn());

vi.mock("../services/pdkt/shared-utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/pdkt/shared-utils")>();
  return {
    ...actual,
    callAI: mockCallAI,
  };
});

import {
  buildPdktEvaluationPrompt,
  evaluateAgentResponse,
} from "../services/pdkt/evaluation-service";
import type { EmailMessage } from "@trainers/types";

// ── Helpers ────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCallAI.mockReset();
});

function makeEmail(overrides: Partial<EmailMessage> & { id: string }): EmailMessage {
  return {
    from: "consumer@test.com",
    to: "agent@ojk157.test",
    subject: "Test subject",
    body: "Test body content.",
    timestamp: new Date().toISOString(),
    isAgent: false,
    ...overrides,
  };
}

// ── buildPdktEvaluationPrompt (simplified single inbound → single reply) ──

describe("buildPdktEvaluationPrompt", () => {
  it("frames the trainee as an OJK 157 contact center agent, not an insurance agent", () => {
    const { systemInstruction, prompt } = buildPdktEvaluationPrompt({
      inboundEmailBody: "Klaim asuransi saya ditolak tanpa penjelasan.",
      agentReplyBody: "Terima kasih, kami akan bantu arahkan pengaduan Anda.",
      scenarioTitle: "Klaim Asuransi Ditolak",
      scenarioCategory: "Asuransi",
    });

    const combined = `${systemInstruction}\n${prompt}`.toLowerCase();
    expect(combined).toContain("ojk 157");
    expect(combined).toContain("agent kontak");
    expect(combined).toContain("bukan pegawai perusahaan terlapor");
    expect(combined).toContain("jangan menyebut trainee sebagai agent asuransi");
  });

  it("includes the inbound email body in the prompt", () => {
    const { prompt } = buildPdktEvaluationPrompt({
      inboundEmailBody: "Ini keluhan konsumen.",
      agentReplyBody: "Terima kasih.",
    });

    expect(prompt).toContain("EMAIL KONSUMEN");
    expect(prompt).toContain("Ini keluhan konsumen.");
    expect(prompt).toContain("BALASAN AGENT OJK 157");
  });

  it("produces valid JSON contract in output instruction", () => {
    const { prompt } = buildPdktEvaluationPrompt({
      inboundEmailBody: "Test",
      agentReplyBody: "Terima kasih.",
    });

    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"typos"');
    expect(prompt).toContain('"clarityIssues"');
    expect(prompt).toContain('"contentGaps"');
    expect(prompt).toContain('"feedback"');
  });

  it("maintains existing retry contract (transient errors handled separately)", () => {
    const { prompt } = buildPdktEvaluationPrompt({
      inboundEmailBody: "Test",
      agentReplyBody: "Terima kasih.",
    });

    expect(prompt).toMatch(/"score":/);
    expect(prompt).toMatch(/"feedback":/);
  });
});

describe("evaluateAgentResponse single-turn invariant", () => {
  it("evaluates exactly one inbound email and one agent reply", async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      text: JSON.stringify({
        score: 90,
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        feedback: "Baik.",
      }),
    });

    const emails: EmailMessage[] = [
      makeEmail({
        id: "agent-reply",
        body: "BALASAN AGENT",
        timestamp: "2024-06-01T11:00:00Z",
        isAgent: true,
      }),
      makeEmail({
        id: "consumer-inbound",
        body: "Keluhan awal.",
        timestamp: "2024-06-01T10:00:00Z",
        isAgent: false,
      }),
    ];

    const result = await evaluateAgentResponse(
      { selectedModel: "gemini-3.1-flash-lite" } as never,
      emails,
    );

    expect(result.success).toBe(true);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(mockCallAI.mock.calls[0][0].prompt).toContain("Keluhan awal.");
    expect(mockCallAI.mock.calls[0][0].prompt).toContain("BALASAN AGENT");
  });

  it("rejects contexts that do not contain exactly one inbound and one reply", async () => {
    const result = await evaluateAgentResponse(
      { selectedModel: "gemini-3.1-flash-lite" } as never,
      [
        makeEmail({ id: "consumer", isAgent: false }),
        makeEmail({ id: "agent-1", isAgent: true }),
        makeEmail({ id: "agent-2", isAgent: true }),
      ],
    );

    expect(result).toEqual({
      success: false,
      error:
        "Invalid email context for evaluation. Need exactly one consumer email and one agent reply.",
    });
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});
