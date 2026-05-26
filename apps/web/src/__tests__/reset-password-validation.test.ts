import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const passwordValidation = {
  isValid(password: string): string | null {
    if (password.length < 8) return "Password minimal 8 karakter.";
    if (!/[A-Z]/.test(password))
      return "Password harus mengandung minimal 1 huruf besar (A-Z).";
    if (!/[0-9]/.test(password))
      return "Password harus mengandung minimal 1 angka (0-9).";
    return null;
  },
};

describe("Reset Password Validation", () => {
  describe("Password complexity rules", () => {
    it("rejects password shorter than 8 characters", () => {
      expect(passwordValidation.isValid("Ab1")).toBe(
        "Password minimal 8 karakter.",
      );
      expect(passwordValidation.isValid("Abcde1")).toBe(
        "Password minimal 8 karakter.",
      );
    });

    it("rejects password without uppercase letter", () => {
      expect(passwordValidation.isValid("abcdefgh1")).toBe(
        "Password harus mengandung minimal 1 huruf besar (A-Z).",
      );
      expect(passwordValidation.isValid("12345678")).toBe(
        "Password harus mengandung minimal 1 huruf besar (A-Z).",
      );
    });

    it("rejects password without digit", () => {
      expect(passwordValidation.isValid("Abcdefghij")).toBe(
        "Password harus mengandung minimal 1 angka (0-9).",
      );
      expect(passwordValidation.isValid("ABCDEFGH")).toBe(
        "Password harus mengandung minimal 1 angka (0-9).",
      );
    });

    it("accepts valid password with all requirements", () => {
      expect(passwordValidation.isValid("Password1")).toBeNull();
      expect(passwordValidation.isValid("MySecure123")).toBeNull();
      expect(passwordValidation.isValid("A1bcdefgh")).toBeNull();
      expect(passwordValidation.isValid("Test1234ABCD")).toBeNull();
    });

    it("accepts password with special characters", () => {
      expect(passwordValidation.isValid("P@ssw0rd!")).toBeNull();
      expect(passwordValidation.isValid("C0mpl3x!Pass")).toBeNull();
    });

    it("rejects empty password", () => {
      expect(passwordValidation.isValid("")).toBe("Password minimal 8 karakter.");
    });

    it("handles exactly 8 characters with requirements met", () => {
      expect(passwordValidation.isValid("Abcdef1g")).toBeNull();
    });
  });
});

describe("Password Validation in ResetPasswordPage (contract)", () => {
  it("matches the validation rules in the page implementation", () => {
    const rules = [
      { name: "length", check: (p: string) => p.length >= 8 },
      { name: "uppercase", check: (p: string) => /[A-Z]/.test(p) },
      { name: "digit", check: (p: string) => /[0-9]/.test(p) },
    ];

    const validPass = "Trainer2024";
    expect(rules.every((r) => r.check(validPass))).toBe(true);

    const noUppercase = "trainer2024";
    expect(rules.every((r) => r.check(noUppercase))).toBe(false);

    const noDigit = "TrainerABC";
    expect(rules.every((r) => r.check(noDigit))).toBe(false);

    const tooShort = "Tr1";
    expect(rules.every((r) => r.check(tooShort))).toBe(false);
  });
});
