import { describe, expect, it } from "vitest";
import type { PdktIdentity, PdktScenario, PdktSessionConfig } from "@trainers/types";
import {
  buildPdktEmailGenerationPolicy,
  buildPdktSystemInstruction,
  renderPdktIdentityByMentionPattern,
  validatePdktEmailPolicyCompliance,
  cleanNameOccurrences,
} from "../services/pdkt-email-policy";

const identity: PdktIdentity = {
  name: "Budi Santoso",
  email: "budi@test.com",
  city: "Jakarta",
  bodyName: "Budi",
};

const scenario: PdktScenario = {
  id: "asuransi",
  category: "Asuransi",
  title: "Klaim Asuransi Ditolak",
  description: "Konsumen mengeluh klaim ditolak.",
  isActive: true,
  isLicensed: true,
};

describe("pdkt-email-policy", () => {
  describe("cleanNameOccurrences", () => {
    it("removes introductory name mentions and replaces with saya", () => {
      expect(cleanNameOccurrences("Perkenalkan nama saya Budi Santoso.", "Budi Santoso", "Budi"))
        .toBe("saya.");
      expect(cleanNameOccurrences("saya yang bernama Budi.", "Budi Santoso", "Budi"))
        .toBe("saya.");
    });

    it("removes direct mentions of name and bodyName", () => {
      expect(cleanNameOccurrences("Halo Budi Santoso", "Budi Santoso", "Budi"))
        .toBe("Halo ");
      expect(cleanNameOccurrences("Tolong hubungi Budi segera", "Budi Santoso", "Budi"))
        .toBe("Tolong hubungi segera");
    });
  });

  describe("renderPdktIdentityByMentionPattern", () => {
    it("handles upfront pattern correctly by prepending name if no placeholder is present", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "upfront",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern("Saya mau mengadu.", "Klaim ditolak", policy);

      expect(result.subject).toBe("Klaim ditolak");
      expect(result.body).toContain("Halo, saya Budi Santoso.");
      expect(result.body).toContain("Saya mau mengadu.");
    });

    it("handles upfront pattern by replacing placeholders if present", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "upfront",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern(
        "Halo, {{consumer_name}} di sini.",
        "Klaim [Nama Nasabah]",
        policy,
      );

      expect(result.subject).toBe("Klaim Budi Santoso");
      expect(result.body).toBe("Halo, Budi Santoso di sini.");
    });

    it("handles none pattern by cleaning all names and placeholders", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern(
        "Perkenalkan saya Budi Santoso. Saya {{consumer_name}} ingin melaporkan KPR [Nama Nasabah].",
        "Laporan Budi Santoso",
        policy,
      );

      expect(result.subject).not.toContain("Budi");
      expect(result.body).not.toContain("Budi");
      expect(result.body).not.toContain("{{consumer_name}}");
      expect(result.body).not.toContain("[Nama Nasabah]");
    });

    it("handles middle pattern by ensuring name is not in first paragraph and placed in middle", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "middle",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern(
        "Paragraph 1 isi aduan.\n\nParagraph 2 detail kronologi.\n\nParagraph 3 penutup aduan.",
        "Aduan KPR",
        policy,
      );

      const paragraphs = result.body.split("\n\n");
      expect(paragraphs[0]).not.toContain("Budi");
      expect(paragraphs.some(p => p.includes("Budi"))).toBe(true);
    });

    it("handles late pattern by ensuring name is only in the last paragraph/salam", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "late",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern(
        "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.",
        "Aduan",
        policy,
      );

      const paragraphs = result.body.split("\n\n");
      expect(paragraphs[0]).not.toContain("Budi");
      expect(paragraphs[1]).not.toContain("Budi");
      expect(paragraphs[paragraphs.length - 1]).toContain("Budi");
    });
  });

  describe("validatePdktEmailPolicyCompliance", () => {
    const config: any = {
      scenarios: [scenario],
      consumerType: {} as any,
      identity,
      enableImageGeneration: false,
      resolvedConsumerNameMentionPattern: "none",
      writingStyleMode: "training",
    };

    it("returns violation if none pattern contains name", () => {
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const email = { subject: "Subjek", body: "Nama saya Budi Santoso." };
      const violations = validatePdktEmailPolicyCompliance(email, policy);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain("Nama konsumen muncul di body email");
    });

    it("returns violation if email contains meta AI language", () => {
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const email = { subject: "Subjek", body: "Sebagai AI saya tidak bisa bohong." };
      const violations = validatePdktEmailPolicyCompliance(email, policy);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain("Mengandung bahasa meta/AI");
    });

    it("returns zero violations for compliant email", () => {
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const email = { subject: "Laporan Klaim", body: "Saya ingin mengajukan komplain atas penolakan klaim asuransi kesehatan saya." };
      const violations = validatePdktEmailPolicyCompliance(email, policy);

      expect(violations.length).toBe(0);
    });
  });

  describe("buildPdktSystemInstruction", () => {
    it("includes realistic writing instructions when style is realistic", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: { id: "marah", name: "Marah", description: "Sangat marah" },
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "realistic",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const instruction = buildPdktSystemInstruction(policy);

      expect(instruction).toContain("GAYA PENULISAN REALISTIS");
      expect(instruction).toContain("typo");
    });

    it("does not include realistic writing instructions when style is training", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: { id: "marah", name: "Marah", description: "Sangat marah" },
        identity,
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const instruction = buildPdktSystemInstruction(policy);

      expect(instruction).not.toContain("GAYA PENULISAN REALISTIS");
    });
  });
});
