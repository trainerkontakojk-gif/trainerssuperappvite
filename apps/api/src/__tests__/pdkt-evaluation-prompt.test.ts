import { describe, expect, it } from "vitest";
import { buildPdktEvaluationPrompt } from "../services/pdkt/evaluation-service";

describe("buildPdktEvaluationPrompt", () => {
  it("frames the trainee as an OJK 157 contact center agent, not an insurance agent", () => {
    const { systemInstruction, prompt } = buildPdktEvaluationPrompt({
      consumerComplaint: "Klaim asuransi saya ditolak tanpa penjelasan.",
      agentReply: "Terima kasih, kami akan bantu arahkan pengaduan Anda.",
      scenarioTitle: "Klaim Asuransi Ditolak",
      scenarioCategory: "Asuransi",
    });

    const combined = `${systemInstruction}\n${prompt}`.toLowerCase();
    expect(combined).toContain("ojk 157");
    expect(combined).toContain("agent kontak");
    expect(combined).toContain("bukan pegawai perusahaan terlapor");
    expect(combined).toContain("jangan menyebut trainee sebagai agent asuransi");
    expect(combined).toContain("jawaban agent ojk 157");
  });
});
