import { describe, expect, it } from "vitest";
import {
  buildTelefunLiveSystemInstruction,
  getConsumerTypeHint,
  getTimeCueInstruction,
} from "../routes/telefun/services/promptBuilder";
import type { TelefunConsumerType } from "../routes/telefun/telefunSettings";

function makeConsumerType(
  overrides: Partial<TelefunConsumerType> = {},
): TelefunConsumerType {
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
        isActive: true,
      },
      consumerType: makeConsumerType({
        name: "Marah & Emosional",
        description: "Marah dan menuntut solusi.",
      }),
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
      identity: {
        name: "Budi",
        gender: "male",
        phone: "0811",
        city: "Jakarta",
        voiceName: "Fenrir",
        signatureName: "",
      },
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
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("ATURAN ROLEPLAY");
    expect(prompt).toContain("JANGAN PERNAH MENAWARKAN BANTUAN");
    expect(prompt).toContain(
      "Gunakan Bahasa Indonesia lisan yang natural, boleh tidak baku",
    );
  });

  it("includes expanded ATURAN BICARA with 6 rules", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
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
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType({
        name: "Marah & Emosional",
        description: "Marah.",
      }),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("EMOSI: MARAH/KESAL");
    expect(prompt).toContain("Nada tinggi dan cepat");
  });

  it("emotion instruction for gaptek consumer", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType({
        name: "Bingung & Gaptek",
        description: "Bingung.",
      }),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("EMOSI: BINGUNG/GAPTEK");
    expect(prompt).toContain("Bicara lambat");
    expect(prompt).toContain("eemm");
  });

  it("emotion instruction for sedih consumer", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType({
        name: "Pasrah & Sedih",
        description: "Sedih.",
      }),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("EMOSI: SEDIH/PASRAH");
    expect(prompt).toContain("Bicara pelan, nada rendah");
  });

  it("realistic pacing has 6 rules", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("TEMPO RESPONS (REALISTIS)");
    expect(prompt).toContain(
      "6. Jangan mengajukan banyak pertanyaan sekaligus",
    );
  });

  it("training_fast pacing is concise", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "training_fast",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("TEMPO RESPONS (LATIHAN CEPAT)");
  });

  it("time limit is not included in prompt - app timer is source of truth", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 5,
    });
    expect(prompt).not.toContain("BATAS WAKTU");
    expect(prompt).not.toContain("MESKIPUN SKRIP BELUM SELESAI");
    expect(prompt).toContain(
      "JANGAN menutup telepon berdasarkan perkiraan waktu sendiri",
    );
  });

  it("script instruction handles dialog+alur format guidance", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: {
        id: "a",
        title: "A",
        instruction: "X",
        script: "Agent: Halo",
        isActive: true,
      },
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
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
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
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "training_fast",
      maxCallDuration: 0,
    });
    expect(prompt).not.toContain("SILENT HANDLING");
  });

  it("includes ATURAN KEPATUHAN PROSEDURAL with compliance rules", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "Budi",
        gender: "male",
        phone: "0812",
        city: "Jakarta",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).toContain("ATURAN KEPATUHAN PROSEDURAL");
    expect(prompt).toContain("boleh saya hold?");
    expect(prompt).toContain("Iya silakan");
    expect(prompt).toContain("mencatat informasi");
    expect(prompt).toContain("BUKAN berarti masalah Anda selesai");
    expect(prompt).toContain("Konsumen NORMAL akan mengikuti");
    expect(prompt).toContain("SETELAH HOLD");
    expect(prompt).toContain("Halo? Masih ada?");
    expect(prompt).toContain("Terima kasih telah menunggu");
    expect(prompt).toContain("Iya masih ada");
  });

  it("no script produces no script section", () => {
    const prompt = buildTelefunLiveSystemInstruction({
      identity: {
        name: "X",
        gender: "male",
        phone: "0",
        city: "X",
        voiceName: "Fenrir",
        signatureName: "",
      },
      scenario: { id: "a", title: "A", instruction: "X", isActive: true },
      consumerType: makeConsumerType(),
      responsePacingMode: "realistic",
      maxCallDuration: 0,
    });
    expect(prompt).not.toContain("SKRIP PERCAKAPAN");
  });
});

describe("duration and time cue prompt", () => {
  it("does not tell Gemini to self-estimate and close before the app timer", () => {
    const text = buildTelefunLiveSystemInstruction({
      identity: {
        name: "Budi",
        gender: "male",
        phone: "0812",
        city: "Jakarta",
        voiceName: "Charon",
        signatureName: "",
      },
      scenario: {
        id: "s1",
        title: "Tagihan",
        instruction: "Keluhkan tagihan.",
        script: "",
        isActive: true,
      },
      consumerType: makeConsumerType({ name: "Netral" }),
      responsePacingMode: "realistic",
      maxCallDuration: 5,
    });

    expect(text).not.toContain("BATAS WAKTU");
    expect(text).not.toContain("merasa percakapan sudah mendekati");
    expect(text).toContain(
      "JANGAN menutup telepon berdasarkan perkiraan waktu sendiri",
    );
  });
});

describe("getConsumerTypeHint", () => {
  it("returns marah tone for angry consumers", () => {
    const hint = getConsumerTypeHint(
      makeConsumerType({ name: "Marah & Emosional" }),
    );
    expect(hint.tone).toContain("kesal");
    expect(hint.examples).toContain("Halo? Masih ada?");
  });

  it("returns bingung tone for gaptek", () => {
    const hint = getConsumerTypeHint(
      makeConsumerType({ name: "Bingung & Gaptek" }),
    );
    expect(hint.tone).toContain("ragu");
    expect(hint.examples).toContain("ada yang bisa bantu?");
  });

  it("returns lemah tone for sedih", () => {
    const hint = getConsumerTypeHint(
      makeConsumerType({ name: "Pasrah & Sedih" }),
    );
    expect(hint.tone).toContain("lemah");
  });

  it("returns netral tone for others", () => {
    const hint = getConsumerTypeHint(makeConsumerType({ name: "Netral" }));
    expect(hint.tone).toContain("netral");
  });
});

describe("getTimeCueInstruction", () => {
  it("high urgency for <=20s with marah tone", () => {
    const text = getTimeCueInstruction(
      makeConsumerType({ name: "Marah & Emosional" }),
      15,
    );
    expect(text).toContain("PRIORITAS TINGGI");
    expect(text).toContain("menutup telepon sekarang secara natural");
    expect(text).toContain("Jangan sebutkan timer");
  });

  it("mid urgency for 45s seconds with gaptek tone", () => {
    const text = getTimeCueInstruction(
      makeConsumerType({ name: "Bingung & Gaptek" }),
      45,
    );
    expect(text).toContain("PERSIAPAN PENUTUP");
    expect(text).toContain("Arahkan percakapan menuju penutup");
  });

  it("low urgency for >60s netral", () => {
    const text = getTimeCueInstruction(
      makeConsumerType({ name: "Netral" }),
      90,
    );
    expect(text).toContain("ARAH PENUTUP");
    expect(text).toContain("Mulai ringkas masalah dan bersiap menuju penutup");
  });
});
