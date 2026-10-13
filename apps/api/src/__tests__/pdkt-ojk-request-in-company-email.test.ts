import { describe, expect, it, vi } from "vitest";

// evaluation-service mengimpor klien AI/Supabase lewat shared-utils; prompt
// builder yang diuji tidak memanggil AI.
vi.mock("../services/pdkt/shared-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pdkt/shared-utils")>()),
  callAI: vi.fn(),
}));
import type {
  PdktIdentity,
  PdktRecipientContext,
  PdktScenario,
} from "@trainers/types";
import {
  buildPdktEmailGenerationPolicy,
  buildPdktRetryHint,
  getRecipientDirectionInstruction,
  validatePdktEmailPolicyCompliance,
} from "../services/pdkt-email-policy";
import { resolvePdktRecipientContext } from "../services/pdkt/recipient-targets";
import { buildPdktRecipientConflictHints } from "../services/pdkt/evaluation-context";
import {
  buildPdktEdu,
  buildPdktEvaluationPrompt,
} from "../services/pdkt/evaluation-service";
import { toPdktSimulationScenario } from "../services/pdkt/scenario-projections";

/**
 * Arah balasan "tembusan, tapi minta bantuan OJK" (plan
 * pdkt-ojk-request-in-company-email.md). Pengecualian non-E2E disetujui Fajar
 * 13 Okt 2026: instruksi AI tidak bisa dibuktikan lewat E2E karena klien AI
 * memakai endpoint tetap tanpa stub.
 */

const COMPANY = "pengaduan@finansial.test";
const OJK = "konsumen@ojk.go.id";
const NEW_INTENT = "reply_to_ojk_request_in_company_email";
const MISSING_OJK_REQUEST_VIOLATION =
  "Email belum memuat permintaan bantuan kepada OJK di paragraf tengah";

const identity: PdktIdentity = {
  name: "Budi Santoso",
  email: "budi@test.com",
  city: "Jakarta",
  bodyName: "Budi",
};

const scenario: PdktScenario = {
  id: "lunas-ditagih",
  category: "Pembiayaan",
  title: "Pinjaman lunas masih ditagih",
  description: "Konsumen sudah melunasi pinjaman tetapi masih ditagih.",
  isActive: true,
  primaryRecipientType: "reported_company",
  ojkRequestInBody: true,
};

const hiddenRequestContext: PdktRecipientContext = {
  primaryRecipientType: "reported_company",
  primaryRecipientAddress: COMPANY,
  ccRecipients: [OJK],
  replyIntent: NEW_INTENT,
};

function policyFor(
  recipientContext: PdktRecipientContext,
  mode: "template" | "initial_email" = "initial_email",
) {
  return buildPdktEmailGenerationPolicy(
    {
      identity,
      consumerType: { id: "marah", name: "Marah", description: "Marah." },
      recipientContext,
      resolvedConsumerNameMentionPattern: "none",
      writingStyleMode: "training",
    },
    scenario,
    mode,
  );
}

const companyOpening =
  "Yth. pihak perusahaan, saya ingin mengadukan tagihan yang terus datang.";
const companyClosing =
  "Mohon perusahaan segera menghentikan penagihan dan memperbaiki status pinjaman saya.";

describe("arah balasan: tembusan yang meminta bantuan OJK", () => {
  it("memakai intent baru tanpa mengubah header Kepada perusahaan, Tembusan OJK", () => {
    expect(
      resolvePdktRecipientContext({
        recipients: [COMPANY, OJK],
        primaryRecipientType: "reported_company",
        ojkRequestInBody: true,
      }),
    ).toEqual(hiddenRequestContext);

    expect(
      resolvePdktRecipientContext({
        recipients: [COMPANY, OJK],
        primaryRecipientType: "reported_company",
      }).replyIntent,
    ).toBe("reply_to_company_with_ojk_cc");
  });

  it("mengabaikan flag bila email efektif langsung ke OJK", () => {
    expect(
      resolvePdktRecipientContext({
        recipients: [OJK],
        primaryRecipientType: "ojk",
        ojkRequestInBody: true,
      }).replyIntent,
    ).toBe("reply_to_ojk");
    // Perusahaan tanpa alamat jatuh ke OJK sebagai penerima utama.
    expect(
      resolvePdktRecipientContext({
        recipients: [OJK],
        primaryRecipientType: "reported_company",
        ojkRequestInBody: true,
      }),
    ).toMatchObject({
      primaryRecipientType: "ojk",
      replyIntent: "reply_to_ojk",
    });
  });

  it("meminta AI menyelipkan permintaan bantuan ke OJK di paragraf tengah", () => {
    const instruction = getRecipientDirectionInstruction(hiddenRequestContext);

    expect(instruction).toContain("PENERIMA UTAMA: perusahaan terlapor");
    expect(instruction).toContain("paragraf tengah");
    expect(instruction).toMatch(/meminta bantuan.*OJK/);
    expect(instruction).not.toContain(
      "OJK hanya boleh disebut sebagai tembusan",
    );

    const ccOnly = getRecipientDirectionInstruction({
      ...hiddenRequestContext,
      replyIntent: "reply_to_company_with_ojk_cc",
    });
    expect(ccOnly).not.toContain("paragraf tengah");
  });

  it("menolak email AI yang tidak memuat permintaan bantuan OJK di tengah", () => {
    const withoutRequest = {
      subject: "Tagihan setelah lunas",
      body: [
        companyOpening,
        "Saya sudah melunasi pinjaman sejak 2 September dan menyimpan bukti transfernya.",
        companyClosing,
      ].join("\n\n"),
    };
    const withRequest = {
      subject: "Tagihan setelah lunas",
      body: [
        companyOpening,
        "Saya sudah melunasi pinjaman sejak 2 September. Saya juga memohon bantuan OJK untuk menengahi masalah ini karena perusahaan tidak menanggapi.",
        companyClosing,
      ].join("\n\n"),
    };

    for (const mode of ["initial_email", "template"] as const) {
      const policy = policyFor(hiddenRequestContext, mode);
      expect(
        validatePdktEmailPolicyCompliance(withoutRequest, policy),
      ).toContain(MISSING_OJK_REQUEST_VIOLATION);
      expect(validatePdktEmailPolicyCompliance(withRequest, policy)).toEqual(
        [],
      );
    }

    // Alamat tembusan konsumen@ojk.go.id + permintaan ke perusahaan bukan
    // permintaan bantuan OJK.
    const ccAddressOnly = {
      subject: "Tagihan setelah lunas",
      body: [
        companyOpening,
        "Email ini saya tembuskan ke konsumen@ojk.go.id. Mohon perusahaan membantu menghentikan tagihan.",
        companyClosing,
      ].join("\n\n"),
    };
    expect(
      validatePdktEmailPolicyCompliance(ccAddressOnly, policyFor(hiddenRequestContext)),
    ).toContain(MISSING_OJK_REQUEST_VIOLATION);

    // Tembusan biasa tidak mewajibkan permintaan ke OJK.
    const ccOnlyPolicy = policyFor({
      ...hiddenRequestContext,
      replyIntent: "reply_to_company_with_ojk_cc",
    });
    expect(
      validatePdktEmailPolicyCompliance(withoutRequest, ccOnlyPolicy),
    ).toEqual([]);
  });

  it("tetap menolak permintaan OJK di salam pembuka, dan retry hint mengikuti intent", () => {
    const policy = policyFor(hiddenRequestContext);
    const openingToOjk = {
      subject: "Tagihan setelah lunas",
      body: [
        "Yth. Bapak/Ibu petugas OJK, saya ingin mengadukan tagihan yang terus datang.",
        "Saya juga memohon bantuan OJK untuk menengahi masalah ini.",
        companyClosing,
      ].join("\n\n"),
    };
    const violations = validatePdktEmailPolicyCompliance(openingToOjk, policy);

    expect(violations).toContain(
      "Narasi email masih menjadikan OJK sebagai penerima utama, padahal penerima utama adalah perusahaan terlapor",
    );
    expect(violations).not.toContain(MISSING_OJK_REQUEST_VIOLATION);

    const hint = buildPdktRetryHint([MISSING_OJK_REQUEST_VIOLATION], policy);
    expect(hint).toContain("paragraf tengah");
    expect(hint).not.toContain("OJK hanya boleh menjadi tembusan");
  });

  it("menilai OJK sebagai lawan bicara utama dan jawaban normatif saja sebagai salah arah", () => {
    const { prompt } = buildPdktEvaluationPrompt({
      inboundEmailBody: "Saya mengadu ke perusahaan dan memohon bantuan OJK.",
      agentReplyBody: "Terima kasih atas tembusan pengaduan Bapak.",
      recipientContext: hiddenRequestContext,
      conflictHints: [],
    });

    expect(prompt).toContain(NEW_INTENT);
    expect(prompt).toMatch(
      /reply_to_ojk_request_in_company_email[^\n]*lawan bicara utama[^\n]*OJK/,
    );
    expect(prompt).toMatch(
      /hanya[^\n]*(terima kasih|normatif)[^\n]*salah arah/,
    );
    expect(prompt).toContain("replyIntent");
  });

  it("menandai pembuka/penutup yang bergeser ke perusahaan, bukan sapaan OJK", () => {
    const toCompany = buildPdktRecipientConflictHints({
      agentReplyBody: `Yth. PT Finansial Maju, mohon perusahaan menindaklanjuti.\n\n${"isi ".repeat(120)}\n\nDemikian kami sampaikan kepada perusahaan terlapor.`,
      recipientContext: hiddenRequestContext,
    });
    expect(toCompany.conflictHints).toEqual([
      "pembuka membuat lawan bicara utama bergeser ke perusahaan",
      "penutup membuat lawan bicara utama bergeser ke perusahaan",
    ]);

    const asOjk = buildPdktRecipientConflictHints({
      agentReplyBody: `Terima kasih telah menghubungi OJK.\n\n${"isi ".repeat(120)}\n\nSalam, Kontak OJK 157`,
      recipientContext: hiddenRequestContext,
    });
    expect(asOjk.conflictHints).toEqual([]);
  });

  it("saran otomatis saat arah salah mengarahkan ke OJK, bukan ke perusahaan", () => {
    const breakdown = {
      recipientDirectionScore: 40,
      normativeResponseScore: 50,
      clarityScore: 80,
      typoScore: 90,
      templateComplianceScore: 80,
    };
    const hidden = buildPdktEdu(undefined, breakdown, true, hiddenRequestContext);
    expect(hidden.dimensionTips?.recipientDirection).toContain("OJK 157");
    expect(hidden.dimensionTips?.recipientDirection).not.toContain(
      "Yth. PT [Nama Perusahaan Terlapor]",
    );

    const ccOnly = buildPdktEdu(undefined, breakdown, true, {
      ...hiddenRequestContext,
      replyIntent: "reply_to_company_with_ojk_cc",
    });
    expect(ccOnly.dimensionTips?.recipientDirection).toContain(
      "Yth. PT [Nama Perusahaan Terlapor]",
    );
  });

  it("tidak menampilkan flag arah balasan di tampilan simulasi", () => {
    expect(toPdktSimulationScenario(scenario)).not.toHaveProperty(
      "ojkRequestInBody",
    );
    expect(scenario.ojkRequestInBody).toBe(true);
  });
});
