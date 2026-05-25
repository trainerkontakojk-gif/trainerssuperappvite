import { describe, expect, it } from "vitest";
import { buildTelefunLiveSystemInstruction } from "../routes/telefun/services/promptBuilder";

describe("buildTelefunLiveSystemInstruction", () => {
  it("includes identity, scenario, persona, script rules, pacing, and time limit", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "Siti Rahayu",
        gender: "female",
        phone: "08123456789",
        city: "Bandung",
        voiceName: "Kore",
        signatureName: "",
      },
      scenario: {
        id: "pinjol",
        title: "Pinjol Ilegal",
        instruction: "Konsumen diteror oleh pinjol ilegal.",
        script: "Awal: Konsumen panik.\nJika agen bertanya: sebutkan teror kontak darurat.",
        isActive: true,
      },
      consumerType: {
        id: "marah",
        name: "Marah & Emosional",
        gender: "random",
        description: "Konsumen marah dan menuntut solusi cepat.",
      },
      responsePacingMode: "realistic",
      maxCallDuration: 5,
    });

    expect(prompt).toContain("ROLEPLAY");
    expect(prompt).toContain("Siti Rahayu");
    expect(prompt).toContain("Bandung");
    expect(prompt).toContain("Pinjol Ilegal");
    expect(prompt).toContain("Konsumen marah");
    expect(prompt).toContain("SKRIP PERCAKAPAN");
    expect(prompt).toContain("BATAS WAKTU");
    expect(prompt).toContain("JANGAN MEMPERKENALKAN DIRI SEBAGAI AI");
  });
});
