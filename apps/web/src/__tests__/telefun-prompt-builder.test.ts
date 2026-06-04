import { describe, expect, it } from "vitest";
import {
  buildTelefunLiveSystemInstruction,
  getConsumerTypeHint,
  getTimeCueInstruction,
} from "../routes/telefun/services/promptBuilder";
import type { TelefunConsumerType } from "../routes/telefun/telefunSettings";

function makeConsumerType(overrides: Partial<TelefunConsumerType> = {}): TelefunConsumerType {
  return {
    id: overrides.id || "test",
    name: overrides.name || "Netral",
    gender: overrides.gender || "random",
    description: overrides.description || "Konsumen biasa.",
  };
}

describe("buildTelefunLiveSystemInstruction", () => {
  it("includes ROLEPLAY and identity", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "Siti Rahayu", gender: "female", phone: "08123456789", city: "Bandung", voiceName: "Kore", signatureName: "" },
      scenario: { id: "pinjol", title: "Pinjol Ilegal", instruction: "Konsumen diteror oleh pinjol ilegal.", isActive: true },
      consumerType: makeConsumerType({ name: "Marah & Emosional", description: "Marah dan menuntut solusi." }),
      responsePacingMode: "realistic",
      maxCallDuration: 5,
    });
    expect(prompt).toContain("ROLEPLAY");
    expect(prompt).toContain("Siti Rahayu");
    expect(prompt).toContain("Bandung");
    expect(prompt).toContain("Pinjol Ilegal");
  });

  it("includes KONSISTENSI SUARA section", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "Budi", gender: "male", phone: "0811", city: "Jakarta", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("KONSISTENSI SUARA");
    expect(prompt).toContain("JANGAN BERUBAH MENJADI LAWAN JENIS");
    expect(prompt).toContain("JANGAN meniru atau menyesuaikan suara");
  });

  it("includes ATURAN ROLEPLAY section", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("ATURAN ROLEPLAY");
    expect(prompt).toContain("JANGAN PERNAH MENAWARKAN BANTUAN");
    expect(prompt).toContain("Gunakan Bahasa Indonesia lisan yang natural, boleh tidak baku");
  });

  it("includes expanded ATURAN BICARA with 6 rules", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("JANGAN PERNAH BERHENTI MENDADAK");
    expect(prompt).toContain("Abaikan suara bising kecil");
    expect(prompt).toContain("MENYELA KONDISIONAL");
    expect(prompt).toContain("JANGAN MENGAKHIRI PERCAKAPAN HANYA KARENA");
  });

  it("emotion instruction for marah consumer", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType({ name: "Marah & Emosional", description: "Marah." }),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("EMOSI: MARAH/KESAL");
    expect(prompt).toContain("Nada tinggi dan cepat");
  });

  it("emotion instruction for gaptek consumer", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType({ name: "Bingung & Gaptek", description: "Bingung." }),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("EMOSI: BINGUNG/GAPTEK");
    expect(prompt).toContain("Bicara lambat");
    expect(prompt).toContain("eemm");
  });

  it("emotion instruction for sedih consumer", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType({ name: "Pasrah & Sedih", description: "Sedih." }),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("EMOSI: SEDIH/PASRAH");
    expect(prompt).toContain("Bicara pelan, nada rendah");
  });

  it("realistic pacing has 6 rules", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("TEMPO RESPONS (REALISTIS)");
    expect(prompt).toContain("6. Jangan mengajukan banyak pertanyaan sekaligus");
  });

  it("training_fast pacing is concise", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "training_fast",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("TEMPO RESPONS (LATIHAN CEPAT)");
  });

  it("time limit includes closing phrases", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 5,
    });
    expect(prompt).toContain('"Ya sudah terima kasih, saya tutup"');
    expect(prompt).toContain("Pulsa saya habis");
    expect(prompt).toContain("MESKIPUN SKRIP BELUM SELESAI");
  });

  it("script instruction handles dialog+alur format guidance", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", script: "Agent: Halo", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("FORMAT DIALOG");
    expect(prompt).toContain("FORMAT POIN ALUR");
    expect(prompt).toContain("Agent: Halo");
    expect(prompt).toContain("JANGAN menyalin skrip secara verbatim");
  });

  it("realistic mode includes SILENT HANDLING section with non-aggressive rules", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("SILENT HANDLING");
    expect(prompt).toContain("tunggu dengan sabar");
    expect(prompt).toContain("Jangan mengulang panggilan berkali-kali");
    expect(prompt).toContain("Jangan mengakhiri sesi hanya karena agen diam");
    expect(prompt).toContain("(<30 detik)");
    expect(prompt).toContain("(30-45 detik)");
    expect(prompt).not.toContain("(<10 detik)");
    expect(prompt).not.toContain("(10-15 detik)");
  });

  it("training_fast mode does not include SILENT HANDLING section", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "training_fast",
      maxCallDuration: 0,
    });
    expect(prompt).not.toContain("SILENT HANDLING");
  });

  it("no script produces no script section", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: { name: "X", gender: "male", phone: "0", city: "X", voiceName: "Fenrir", signatureName: "" },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).not.toContain("SKRIP PERCAKAPAN");
  });
});

describe("getConsumerTypeHint", () => {
  it("returns marah tone for angry consumers", () => {
    const hint = getConsumerTypeHint(makeConsumerType({ name: "Marah & Emosional" }));
    expect(hint.tone).toContain("kesal");
    expect(hint.examples).toContain("Halo? Masih ada?");
  });

  it("returns bingung tone for gaptek", () => {
    const hint = getConsumerTypeHint(makeConsumerType({ name: "Bingung & Gaptek" }));
    expect(hint.tone).toContain("ragu");
    expect(hint.examples).toContain("ada yang bisa bantu?");
  });

  it("returns lemah tone for sedih", () => {
    const hint = getConsumerTypeHint(makeConsumerType({ name: "Pasrah & Sedih" }));
    expect(hint.tone).toContain("lemah");
  });

  it("returns netral tone for others", () => {
    const hint = getConsumerTypeHint(makeConsumerType({ name: "Netral" }));
    expect(hint.tone).toContain("netral");
  });
});

describe("getTimeCueInstruction", () => {
  it("high urgency for <=20s with marah tone", () => {
    const text = getTimeCueInstruction(makeConsumerType({ name: "Marah & Emosional" }), 15);
    expect(text).toContain("PRIORITAS TINGGI");
    expect(text).toContain("kesal karena masalah belum selesai");
    expect(text).toContain("Jangan sebutkan timer");
  });

  it("lower urgency for >20s with gaptek tone", () => {
    const text = getTimeCueInstruction(makeConsumerType({ name: "Bingung & Gaptek" }), 40);
    expect(text).toContain("Bersiaplah untuk menutup telepon");
    expect(text).toContain("bingung/ragu");
  });

  it("sopan urgency for >20s netral", () => {
    const text = getTimeCueInstruction(makeConsumerType({ name: "Netral" }), 35);
    expect(text).toContain("Nada: netral. Mulai isyarat");
  });
});
