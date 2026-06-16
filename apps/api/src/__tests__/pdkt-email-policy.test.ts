import { describe, expect, it } from "vitest";
import type { PdktIdentity, PdktScenario } from "@trainers/types";
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
      expect(result.body).toMatch(/atas nama Budi|administratif.*Budi|pengaduan.*Budi/i);
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
      expect(result.body).toBe("Halo, Budi di sini.");
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
      expect(paragraphs).toHaveLength(3);
      expect(paragraphs[0]).not.toContain("Budi");
      expect(paragraphs[1]).toContain("Budi");
      expect(paragraphs.filter((p) => p.includes("Budi"))).toHaveLength(1);
    });

    it("uses bodyName instead of name in the body and avoids name leakage", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity: {
          name: "Black Cat",
          email: "kucing.hitam@gmail.com",
          city: "Bandung",
          bodyName: "Susanto",
        },
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

      expect(result.body).toContain("Susanto");
      expect(result.body).not.toContain("Black Cat");
    });

    it("handles natural middle clue placement without generic intro phrases", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity: {
          name: "Black Cat",
          email: "kucing.hitam@gmail.com",
          city: "Bandung",
          bodyName: "Susanto",
        },
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

      expect(result.body.toLowerCase()).not.toContain("perkenalkan");
      expect(result.body).not.toContain("Oya, saya Susanto mau menambahkan sedikit detail lagi.");
      expect(result.body).toMatch(/atas nama Susanto|nama yang tertera.*Susanto|nama Susanto|penyebutan nama.*Susanto/i);
    });

    it("removes direct name signoff from the closing paragraph for middle pattern", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity: {
          name: "Black Cat",
          email: "kucing.hitam@gmail.com",
          city: "Bandung",
          bodyName: "Susanto",
        },
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "middle",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern(
        [
          "Paragraph 1 isi aduan.",
          "Paragraph 2 detail kronologi dengan nama yang tertera di berkas administrasinya adalah Susanto.",
          "Salam,\nSusanto",
        ].join("\n\n"),
        "Aduan KPR",
        policy,
      );

      const paragraphs = result.body.split("\n\n");
      expect(paragraphs[1]).toContain("Susanto");
      expect(paragraphs[paragraphs.length - 1]).not.toContain("Susanto");
    });

    it("adds a clear separator after the inserted middle-name clue", () => {
      const config: any = {
        scenarios: [scenario],
        consumerType: {} as any,
        identity: {
          name: "Black Cat",
          email: "kucing.hitam@gmail.com",
          city: "Bandung",
          bodyName: "Susanto",
        },
        enableImageGeneration: false,
        resolvedConsumerNameMentionPattern: "middle",
        writingStyleMode: "training",
      };
      const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
      const result = renderPdktIdentityByMentionPattern(
        [
          "Paragraph 1 isi aduan.",
          "Waktu saya minta penjelasan ulang. Teman saya bilang ada orang yang mengaku dari perusahaan itu menelepon dia.",
          "Paragraph 3 penutup aduan.",
        ].join("\n\n"),
        "Aduan KPR",
        policy,
      );

      expect(result.body).toMatch(/Susanto\.\s+Teman saya bilang/i);
      expect(result.body).not.toMatch(/Susanto\s+Teman saya bilang/i);
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

    it("returns violation when middle pattern introduces the consumer by name in the closing paragraph", () => {
      const middleConfig: any = {
        ...config,
        resolvedConsumerNameMentionPattern: "middle",
      };
      const policy = buildPdktEmailGenerationPolicy(
        middleConfig,
        scenario,
        "template",
      );
      const email = {
        subject: "Subjek",
        body: [
          "Saya ingin mengadukan klaim asuransi saya yang sudah lama tidak jelas.",
          "Saya sudah berkali-kali menghubungi pihak perusahaan tetapi belum ada penjelasan tertulis.",
          "Oh iya, saya hampir lupa, nama saya Budi dan saya dari Jakarta.",
        ].join("\n\n"),
      };

      const violations = validatePdktEmailPolicyCompliance(email, policy);

      expect(violations).toContain(
        'Menggunakan perkenalan diri dengan nama pada pattern "middle"',
      );
      expect(violations).toContain(
        "Nama konsumen hanya muncul di paragraf penutup pada pattern 'middle'",
      );
    });

    it("returns violation when middle pattern still mentions the name in the closing paragraph after a valid middle mention", () => {
      const middleConfig: any = {
        ...config,
        resolvedConsumerNameMentionPattern: "middle",
      };
      const policy = buildPdktEmailGenerationPolicy(
        middleConfig,
        scenario,
        "template",
      );
      const email = {
        subject: "Subjek",
        body: [
          "Saya ingin mengadukan klaim asuransi saya yang sudah lama tidak jelas.",
          "Waktu saya minta penjelasan ulang, petugas menyebut nama Budi di sistem mereka.",
          "Salam,\nBudi",
        ].join("\n\n"),
      };

      const violations = validatePdktEmailPolicyCompliance(email, policy);

      expect(violations).toContain(
        "Nama konsumen muncul lagi di paragraf penutup pada pattern 'middle'",
      );
    });

    it("returns violation when late pattern uses self-introduction with name in the closing paragraph", () => {
      const lateConfig: any = {
        ...config,
        resolvedConsumerNameMentionPattern: "late",
      };
      const policy = buildPdktEmailGenerationPolicy(
        lateConfig,
        scenario,
        "template",
      );
      const email = {
        subject: "Subjek",
        body: [
          "Saya sudah berupaya mencari penjelasan atas penolakan klaim ini.",
          "Semua bukti sudah saya kumpulkan dan saya berharap ada tindak lanjut yang jelas.",
          "Terima kasih, nama saya Budi Santoso dan saya menunggu kabar baiknya.",
        ].join("\n\n"),
      };

      const violations = validatePdktEmailPolicyCompliance(email, policy);

      expect(violations).toContain(
        'Menggunakan perkenalan diri dengan nama pada pattern "late"',
      );
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
