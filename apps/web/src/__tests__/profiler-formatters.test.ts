import { describe, expect, it } from "vitest";
import { formatTanggal, hitungMasaDinas, hitungUsia, timTheme } from "../routes/profiler/utils/profilerFormatters";

describe("profiler formatters", () => {
  it("formats valid dates in Indonesian long format", () => {
    expect(formatTanggal("2020-01-15")).toMatch(/15/);
    expect(formatTanggal("2020-01-15")).toMatch(/2020/);
  });

  it("keeps invalid or empty dates defensive", () => {
    expect(formatTanggal("")).toBe("-");
    expect(hitungMasaDinas("")).toBe("-");
  });

  it("returns numeric age for a valid birth date", () => {
    expect(hitungUsia("2000-01-01")).toBeGreaterThan(20);
  });

  it("returns stable team theme fields", () => {
    expect(timTheme("call")).toHaveProperty("badge");
    expect(timTheme("unknown")).toHaveProperty("badge");
  });
});
