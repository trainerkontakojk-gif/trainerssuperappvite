import { describe, expect, it } from "vitest";
import { resolveKetikSessionIdentity } from "../routes/ketik/ketikIdentity";

describe("resolveKetikSessionIdentity", () => {
  it("fills empty identity fields with contextual fallback values", () => {
    // Using 0 as pickIndex for deterministic results
    const identity = resolveKetikSessionIdentity(
      { displayName: "", signatureName: "Agen", phoneNumber: "", city: "" },
      0,
    );

    expect(identity.name).toBe("Budi Santoso");
    expect(identity.city).toBe("Jakarta Selatan");
    expect(identity.phone).toMatch(/^0812\d{8}$/);
    expect(identity.signatureName).toBe("Agen");
  });

  it("preserves fields explicitly entered by the user", () => {
    const identity = resolveKetikSessionIdentity(
      {
        displayName: "Nadia",
        signatureName: "",
        phoneNumber: "08129999",
        city: "Bandung",
      },
      1,
    );

    expect(identity.name).toBe("Nadia");
    expect(identity.city).toBe("Bandung");
    expect(identity.phone).toBe("08129999");
  });
});
