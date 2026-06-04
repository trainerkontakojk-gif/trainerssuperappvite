import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TELEFUN_SETTINGS,
  parseTelefunSettings,
  ConsumerDifficulty,
  resolveFinalIdentity,
  MALE_VOICES,
  FEMALE_VOICES,
} from "../routes/telefun/telefunSettings";
import { GEMINI_LIVE_VOICES_BY_GENDER } from "../routes/telefun/telefunVoiceRegistry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveFinalIdentity gender-first", () => {
  it("[CHAR] gender male + all empty → gender male, name from male pool, male voice", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // would pick female if random across pool

    const identity = resolveFinalIdentity({
      displayName: "",
      gender: "male",
      phoneNumber: "",
      city: "",
      signatureName: "",
      voiceName: "",
    });

    expect(identity.gender).toBe("male");
    expect(MALE_VOICES.includes(identity.voiceName as any)).toBe(true);
    // name should be from a male profile, e.g. "Agus Setiawan", "Budi Hartono", etc.
    const maleNames = ["Agus Setiawan", "Budi Hartono", "Hendra Wijaya", "Andi Pratama", "Rudi Hermawan", "Dian Permana"];
    expect(maleNames).toContain(identity.name);
  });

  it("[CHAR] gender female + all empty → gender female, name from female pool, female voice", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01); // would pick male if random across pool

    const identity = resolveFinalIdentity({
      displayName: "",
      gender: "female",
      phoneNumber: "",
      city: "",
      signatureName: "",
      voiceName: "",
    });

    expect(identity.gender).toBe("female");
    expect(FEMALE_VOICES.includes(identity.voiceName as any)).toBe(true);
    const femaleNames = ["Siti Rahayu", "Dewi Lestari", "Rina Marlina", "Fitri Handayani", "Mega Ayuningtyas", "Lina Kusuma"];
    expect(femaleNames).toContain(identity.name);
  });

  it("[CHAR] gender male + voiceName Kore (female) → normalizes to male voice", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const identity = resolveFinalIdentity({
      displayName: "Budi",
      gender: "male",
      phoneNumber: "0811",
      city: "Jakarta",
      signatureName: "",
      voiceName: "Kore", // female voice — should be rejected
    });

    expect(identity.gender).toBe("male");
    expect(MALE_VOICES.includes(identity.voiceName as any)).toBe(true);
    expect(identity.voiceName).not.toBe("Kore");
  });

  it("[CHAR] gender male + partial fill (missing phone/city) falls back with male identity", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const identity = resolveFinalIdentity({
      displayName: "Budi",
      gender: "male",
      phoneNumber: "",
      city: "",
      signatureName: "",
      voiceName: "",
    });

    expect(identity.gender).toBe("male");
    expect(identity.name).toBe("Budi");
    expect(identity.phone).not.toBe("");
    expect(identity.city).not.toBe("");
    expect(MALE_VOICES.includes(identity.voiceName as any)).toBe(true);
  });
});

describe("resolveFinalIdentity invalid voice normalization", () => {
  it("[CHAR] normalizes legacy Ursa male voice to a provider-valid male voice", () => {
    const identity = resolveFinalIdentity({
      displayName: "Rudi",
      gender: "male",
      phoneNumber: "0811",
      city: "Jakarta",
      signatureName: "",
      voiceName: "Ursa",
    });

    expect(identity.gender).toBe("male");
    expect(identity.voiceName).not.toBe("Ursa");
    expect(GEMINI_LIVE_VOICES_BY_GENDER.male).toContain(identity.voiceName as any);
  });

  it("[CHAR] normalizes legacy Dipper male voice to a provider-valid male voice", () => {
    const identity = resolveFinalIdentity({
      displayName: "Budi",
      gender: "male",
      phoneNumber: "0812",
      city: "Bandung",
      signatureName: "",
      voiceName: "Dipper",
    });

    expect(identity.voiceName).not.toBe("Dipper");
    expect(GEMINI_LIVE_VOICES_BY_GENDER.male).toContain(identity.voiceName as any);
  });

  it("[CHAR] normalizes legacy female invalid voice (Capella) to a provider-valid female voice", () => {
    const identity = resolveFinalIdentity({
      displayName: "Sari",
      gender: "female",
      phoneNumber: "0813",
      city: "Jakarta",
      signatureName: "",
      voiceName: "Capella",
    });

    expect(identity.voiceName).not.toBe("Capella");
    expect(GEMINI_LIVE_VOICES_BY_GENDER.female).toContain(identity.voiceName as any);
  });
});

describe("resolveFinalIdentity fallback", () => {
  it("uses default pool when all identity fields are empty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const identity = resolveFinalIdentity({
      displayName: "",
      gender: "random",
      phoneNumber: "",
      city: "",
      signatureName: "",
      voiceName: "",
    });

    expect(identity.name).not.toBe("");
    expect(identity.phone).not.toBe("");
    expect(identity.city).not.toBe("");
  });

  it("preserves user-filled name and fills missing phone/city from fallback", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const identity = resolveFinalIdentity({
      displayName: "Nadia",
      gender: "female",
      phoneNumber: "",
      city: "",
      signatureName: "",
      voiceName: "",
    });

    expect(identity.name).toBe("Nadia");
    expect(identity.phone).not.toBe("");
    expect(identity.city).not.toBe("");
    expect(identity.gender).toBe("female");
  });
});

describe("parseTelefunSettings", () => {
  it("returns defaults for empty input", () => {
    const result = parseTelefunSettings({});
    expect(result.selectedModel).toBe("gemini-3.1-flash-live-preview");
    expect(result.voiceName).toBe("Kore");
    expect(result.maxCallDuration).toBe(5);
    expect(result.responsePacingMode).toBe("realistic");
  });

  it("parses realisticModeEnabled as true boolean", () => {
    const result = parseTelefunSettings({ realisticModeEnabled: true });
    expect(result.realisticModeEnabled).toBe(true);
  });

  it("parses realisticModeEnabled as false when missing", () => {
    const result = parseTelefunSettings({});
    expect(result.realisticModeEnabled).toBe(false);
  });

  it("parses realisticModeEnabled as false when non-boolean", () => {
    const result = parseTelefunSettings({ realisticModeEnabled: "yes" } as any);
    expect(result.realisticModeEnabled).toBe(false);
  });

  it("truncates realisticModeDisruptionTypes to max 3", () => {
    const result = parseTelefunSettings({
      realisticModeDisruptionTypes: ["a", "b", "c", "d", "e"],
    });
    expect(result.realisticModeDisruptionTypes).toHaveLength(3);
  });

  it("defaults realisticModeDisruptionTypes to empty array when not array", () => {
    const result = parseTelefunSettings({
      realisticModeDisruptionTypes: "not-an-array",
    } as any);
    expect(result.realisticModeDisruptionTypes).toEqual([]);
  });

  it("preserves valid model id", () => {
    const result = parseTelefunSettings({
      selectedModel: "gemini-3.0-flash-live-preview",
    });
    expect(result.selectedModel).toBe("gemini-3.0-flash-live-preview");
  });

  it("parses maxCallDuration as number", () => {
    const result = parseTelefunSettings({ maxCallDuration: 10 });
    expect(result.maxCallDuration).toBe(10);
  });

  it("falls back to default maxCallDuration when not a number", () => {
    const result = parseTelefunSettings({ maxCallDuration: "abc" } as any);
    expect(result.maxCallDuration).toBe(5);
  });

  it("parses identity settings with new format", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        displayName: "Test",
        gender: "male",
        phoneNumber: "0812",
        city: "Jakarta",
        signatureName: "Agent",
        voiceName: "Fenrir",
      },
    });
    expect(result.identitySettings.displayName).toBe("Test");
    expect(result.identitySettings.gender).toBe("male");
  });

  it("parses identity settings with legacy mode format", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        mode: "fixed",
        fixedName: "LegacyUser",
        fixedGender: "female",
        fixedPhone: "0813",
        fixedCity: "Bandung",
      },
    } as any);
    expect(result.identitySettings.displayName).toBe("LegacyUser");
    expect(result.identitySettings.gender).toBe("female");
    expect(result.identitySettings.phoneNumber).toBe("0813");
    expect(result.identitySettings.city).toBe("Bandung");
  });

  it("handles legacy identity random mode", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        mode: "random",
      },
    } as any);
    expect(result.identitySettings.displayName).toBe("");
    expect(result.identitySettings.gender).toBe("random");
  });
});

describe("parseTelefunSettings coercion", () => {
  it("falls back to random identity gender for invalid persisted gender", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        displayName: "Customer",
        gender: "invalid-gender",
        phoneNumber: "",
        city: "",
        signatureName: "",
        voiceName: "",
      },
    } as any);

    expect(result.identitySettings.gender).toBe("random");
  });

  it("falls back to default transport and pacing mode for invalid persisted values", () => {
    const result = parseTelefunSettings({
      telefunTransport: "legacy-transport",
      responsePacingMode: "slow-motion",
    } as any);

    expect(result.telefunTransport).toBe(DEFAULT_TELEFUN_SETTINGS.telefunTransport);
    expect(result.responsePacingMode).toBe(DEFAULT_TELEFUN_SETTINGS.responsePacingMode);
  });

  it("falls back to default collections when persisted collections are not arrays", () => {
    const result = parseTelefunSettings({
      scenarios: { id: "not-array" },
      consumerTypes: { id: "not-array" },
    } as any);

    expect(result.scenarios).toBe(DEFAULT_TELEFUN_SETTINGS.scenarios);
    expect(result.consumerTypes).toBe(DEFAULT_TELEFUN_SETTINGS.consumerTypes);
  });

  it("normalizes malformed scenario rows instead of casting them blindly", () => {
    const result = parseTelefunSettings({
      scenarios: [
        {
          id: "s-valid",
          title: "Valid",
          instruction: "Instruksi",
          isActive: "yes",
          category: 123,
          script: null,
        },
        {
          id: "",
          title: "",
          instruction: "",
        },
      ],
    } as any);

    expect(result.scenarios).toEqual([
      {
        id: "s-valid",
        title: "Valid",
        instruction: "Instruksi",
        isActive: true,
        category: "Umum",
        script: "",
      },
    ]);
  });

  it("normalizes malformed consumer rows instead of casting them blindly", () => {
    const result = parseTelefunSettings({
      consumerTypes: [
        {
          id: "c-valid",
          name: "Valid",
          description: "Deskripsi",
          difficulty: "not-valid",
          gender: 123,
        },
        {
          id: "",
          name: "",
          description: "",
        },
      ],
    } as any);

    expect(result.consumerTypes).toEqual([
      {
        id: "c-valid",
        name: "Valid",
        description: "Deskripsi",
        difficulty: ConsumerDifficulty.Medium,
        gender: "random",
      },
    ]);
  });
});
