import { describe, expect, it } from "vitest";
import type { PdktIdentity, PdktScenario } from "@trainers/types";
import {
  findPdktPlaceholders,
  resolvePdktCompanyName,
  resolvePdktTemplateBody,
} from "../services/pdkt-template-resolver";

const identity: PdktIdentity = {
  name: "Budi Santoso",
  email: "budi@test.com",
  city: "Jakarta",
  bodyName: "Budi",
};

const asuransiScenario: PdktScenario = {
  id: "asuransi",
  category: "Asuransi",
  title: "Klaim Asuransi Ditolak",
  description: "Konsumen mengeluh klaim ditolak.",
  isActive: true,
  isLicensed: true,
};

const pinjolScenario: PdktScenario = {
  id: "pinjol",
  category: "Pinjol",
  title: "Pinjol Ilegal",
  description: "Konsumen diteror pinjol ilegal.",
  isActive: true,
  isLicensed: false,
};

describe("pdkt template resolver", () => {
  it("replaces consumer and licensed company placeholders in manual templates", () => {
    const result = resolvePdktTemplateBody({
      subject: "Klaim saya",
      body: "Saya {{consumer_name}} mengadu soal [Nama Perusahaan Asuransi].",
      scenario: asuransiScenario,
      identity,
      mentionPattern: "late",
      pickIndex: 0,
    });

    expect(result.body).not.toContain("{{consumer_name}}");
    expect(result.body).not.toContain("[Nama Perusahaan Asuransi]");
    expect(result.body).toContain("Prudential Indonesia");
    expect(result.body).toContain("Budi Santoso");
    expect(result.leftoverPlaceholders).toEqual([]);
  });

  it("uses fictive safe company names for unlicensed scenarios", () => {
    const company = resolvePdktCompanyName(pinjolScenario, 1);

    expect(company.kind).toBe("unlicensed");
    expect(company.name).not.toMatch(/\b(Bank|Asuransi|Sekuritas)\b/i);
    expect(company.name.length).toBeGreaterThan(3);
  });

  it("reports leftover identity and company placeholders after sanitize", () => {
    expect(findPdktPlaceholders("Halo [Nama Nasabah], ini [Nama Lembaga]."))
      .toEqual(["[Nama Nasabah]", "[Nama Lembaga]"]);
  });

  it("handles variations of company placeholders", () => {
    const variations = [
      "[Nama Perusahaan]",
      "[Nama LJK]",
      "[Nama Bank]",
      "[Nama Asuransi]",
      "[Nama Entitas]",
      "[Nama Lembaga]",
      "{{company_name}}",
      "{{company}}",
      "{{institution_name}}",
      "{{ljk_name}}",
    ];

    for (const v of variations) {
      const result = resolvePdktTemplateBody({
        subject: "Test",
        body: `Hubungi ${v} segera.`,
        scenario: asuransiScenario,
        identity,
        mentionPattern: "none",
        pickIndex: 0,
      });

      expect(result.body).not.toContain(v);
      expect(result.leftoverPlaceholders).toEqual([]);
      expect(result.body).toContain("Prudential Indonesia");
    }
  });

  it("normalizes consumer aliases and subjects as well as bodies", () => {
    const result = resolvePdktTemplateBody({
      subject: "Halo [Nama Nasabah]",
      body: "Saya [Nama Pengirim] bertanya ke [Nama Perusahaan].",
      scenario: asuransiScenario,
      identity,
      mentionPattern: "none",
      pickIndex: 0,
    });

    expect(result.subject).toBe("Halo Budi Santoso");
    expect(result.body).toContain("Budi Santoso");
    expect(result.body).toContain("Prudential Indonesia");
    expect(result.leftoverPlaceholders).toEqual([]);
  });
});
