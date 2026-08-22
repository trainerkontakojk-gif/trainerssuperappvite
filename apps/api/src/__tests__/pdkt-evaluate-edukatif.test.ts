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
  buildPdktEdu,
  evaluateAgentResponse,
} from "../services/pdkt/evaluation-service";
import type { EmailMessage } from "@trainers/types";

beforeEach(() => {
  mockCallAI.mockReset();
});

function makeEmail(
  overrides: Partial<EmailMessage> & { id: string },
): EmailMessage {
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

const RECIPIENT_CONTEXT = {
  primaryRecipientType: "reported_company" as const,
  primaryRecipientAddress: "cs@ptbank.test",
  ccRecipients: ["kontak157@ojk.go.id"],
  replyIntent: "reply_to_company_with_ojk_cc" as const,
};

// Opening mentions OJK while primary recipient is the reported company
// → deterministic conflict hint detected by the backend.
const CONFLICT_REPLY_BODY = `Kepada Yth. OJK, terima kasih atas laporan Anda.\n\nKami sampaikan pengaduan Anda kepada perusahaan terkait.`;

const BREAKDOWN_NO_CONFLICT = {
  recipientDirectionScore: 40,
  normativeResponseScore: 70,
  clarityScore: 80,
  typoScore: 90,
  templateComplianceScore: 85,
};

async function evaluateWith(
  aiPayload: Record<string, unknown>,
  replyBody = "Terima kasih, kami bantu proses.",
): Promise<Record<string, unknown>> {
  mockCallAI.mockResolvedValueOnce({
    success: true,
    text: JSON.stringify(aiPayload),
  });
  const emails: EmailMessage[] = [
    makeEmail({ id: "inbound", body: "Keluhan awal.", isAgent: false }),
    makeEmail({ id: "reply", body: replyBody, isAgent: true }),
  ];
  const config = { selectedModel: "gemini-3.1-flash-lite", recipientContext: RECIPIENT_CONTEXT } as never;
  const result = await evaluateAgentResponse(config, emails);
  expect(result.success).toBe(true);
  return result as Record<string, unknown>;
}

describe("PDKT evaluasi edukatif (edu layer)", () => {
  it("keeps recipient failsafe as a cap and adds deterministic recipientDirection tip", async () => {
    const result = await evaluateWith(
      {
        score: 90,
        scoreBreakdown: {
          recipientDirectionScore: 90,
          normativeResponseScore: 100,
          clarityScore: 100,
          typoScore: 100,
          templateComplianceScore: 100,
        },
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        feedback: "Baik.",
      },
      CONFLICT_REPLY_BODY,
    );

    // Failsafe is a cap, not an overwrite.
    const breakdown = result.scoreBreakdown as any;
    expect(breakdown.recipientDirectionScore).toBe(60); // min(90, 60)
    expect(result.score).toBe(75); // min(96→avg, 75)

    // Deterministic education tip explaining correct salutation + example.
    const edu = result.edu as any;
    expect(edu).toBeDefined();
    expect(edu.dimensionTips.recipientDirection).toContain("Yth");
    expect(edu.dimensionTips.recipientDirection).toContain("PT");
  });

  it("never raises recipientDirection when already below the cap", async () => {
    const result = await evaluateWith(
      {
        score: 73,
        scoreBreakdown: BREAKDOWN_NO_CONFLICT,
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        feedback: "Kurang.",
      },
      CONFLICT_REPLY_BODY,
    );

    const breakdown = result.scoreBreakdown as any;
    expect(breakdown.recipientDirectionScore).toBe(40);
    expect(result.score).toBe(73); // avg 73 < cap 75 → untouched
  });

  it("assigns deterministic priorityRank to AI actionItems (no AI priority)", async () => {
    const result = await evaluateWith({
      score: 80,
      scoreBreakdown: BREAKDOWN_NO_CONFLICT,
      typos: [],
      clarityIssues: [],
      contentGaps: [],
      feedback: "Cukup.",
      edu: {
        actionItems: [
          { dimension: "typo", text: "Periksa ejaan sebelum kirim.", example: "mohon -> Mohon" },
          { dimension: "recipientDirection", text: "Jaga sapaan ke perusahaan." },
          { dimension: "clarity", text: "Struktur ulang paragraf." },
        ],
        suggestedRewrite: {
          subject: "Tanggapan atas pengaduan Anda",
          body: "Yth. PT Bank Contoh, terima kasih...",
          highlights: ["Yth. PT Bank Contoh"],
        },
      },
    });

    const edu = result.edu as any;
    expect(Array.isArray(edu.actionItems)).toBe(true);

    // Ranked by lowest dimension score first: recipientDirection (40) → normative (70) → clarity (80) → typo (90)
    const ranks = edu.actionItems.map((a: any) => a.priorityRank);
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    expect(new Set(ranks)).toEqual(new Set([1, 2, 3, 4]));
    expect(edu.actionItems[0].dimension).toBe("recipientDirection");
    // Every dimension below 75 has an action item (fallback fills gaps).
    const dims = edu.actionItems.map((a: any) => a.dimension);
    expect(dims).toContain("normative");

    // suggestedRewrite passthrough validated
    expect(edu.suggestedRewrite.body).toContain("PT Bank Contoh");
  });

  it("falls back to rule-based actionItems when AI omits edu entirely", async () => {
    const result = await evaluateWith({
      score: 73,
      scoreBreakdown: BREAKDOWN_NO_CONFLICT,
      typos: [],
      clarityIssues: [],
      contentGaps: [],
      feedback: "Kurang.",
    });

    const edu = result.edu as any;
    expect(edu).toBeDefined();
    // Dimensions below 75 get rule-based items; below 60 critical.
    const dims = edu.actionItems.map((a: any) => a.dimension);
    expect(dims).toContain("recipientDirection"); // 40 → critical
    expect(dims).toContain("normative"); // 70 → sedang
    const ranks = edu.actionItems.map((a: any) => a.priorityRank);
    expect(ranks[0]).toBe(1);
    expect(edu.actionItems[0].dimension).toBe("recipientDirection");
  });

  it("buildPdktEdu returns null-ish empty tips when all dimensions >= 75 without conflict", () => {
    const edu = buildPdktEdu(
      undefined,
      {
        recipientDirectionScore: 80,
        normativeResponseScore: 85,
        clarityScore: 90,
        typoScore: 95,
        templateComplianceScore: 75,
      },
      false,
    );
    expect(edu?.actionItems ?? []).toHaveLength(0);
    expect(edu?.suggestedRewrite ?? null).toBeNull();
  });
});
