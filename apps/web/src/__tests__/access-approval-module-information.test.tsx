import { describe, it, expect } from "vitest";

import { getAccessModulePresentation } from "../routes/dashboard/components/AccessModuleBadge";

// Render kartu/label modul di halaman Persetujuan Akses dibuktikan oleh
// e2e/management-pages.spec.ts; file ini hanya menyisakan pemetaan label murni.
describe("getAccessModulePresentation", () => {
  it('maps "ktp" to label "KTP"', () => {
    expect(getAccessModulePresentation("ktp").label).toBe("KTP");
  });

  it('maps "SIDAK" (uppercase) to label "SIDAK"', () => {
    expect(getAccessModulePresentation("SIDAK").label).toBe("SIDAK");
  });

  it('maps " all " (with whitespace) to label "KTP + SIDAK"', () => {
    expect(getAccessModulePresentation(" all ").label).toBe("KTP + SIDAK");
  });

  it("maps undefined to label 'Modul tidak diketahui'", () => {
    expect(getAccessModulePresentation(undefined).label).toBe(
      "Modul tidak diketahui",
    );
  });

  it("maps null to label 'Modul tidak diketahui'", () => {
    expect(getAccessModulePresentation(null).label).toBe(
      "Modul tidak diketahui",
    );
  });

  it("maps unknown value to label 'Modul tidak diketahui'", () => {
    expect(getAccessModulePresentation("future-module").label).toBe(
      "Modul tidak diketahui",
    );
  });
});
