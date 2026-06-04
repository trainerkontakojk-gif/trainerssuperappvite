import { describe, it, expect } from "vitest";
import { sanitizeConsumerText } from "../services/ketik/consumer-response";

describe("sanitizeConsumerText", () => {
  describe("[NO_RESPONSE] stripping", () => {
    it("strips [NO_RESPONSE] suffix from text", () => {
      const result = sanitizeConsumerText("Terima kasih infonya [NO_RESPONSE]");
      expect(result).toBe("Terima kasih infonya");
    });

    it("strips [NO_RESPONSE] prefix from text", () => {
      const result = sanitizeConsumerText("[NO_RESPONSE] saya setuju");
      expect(result).toBe("saya setuju");
    });

    it("strips [NO_RESPONSE] in the middle of text", () => {
      const result = sanitizeConsumerText("oke [NO_RESPONSE] lanjut");
      expect(result).toBe("oke lanjut");
    });

    it("returns empty string when only [NO_RESPONSE]", () => {
      const result = sanitizeConsumerText("[NO_RESPONSE]");
      expect(result).toBe("");
    });

    it("strips case-insensitive [no_response] variations", () => {
      expect(sanitizeConsumerText("baik [no_response]")).toBe("baik");
      expect(sanitizeConsumerText("baik [No_Response]")).toBe("baik");
      expect(sanitizeConsumerText("baik [NO_response]")).toBe("baik");
    });

    it("preserves other tags like [BREAK] and [SEND_IMAGE: 0]", () => {
      const result = sanitizeConsumerText("oke [BREAK] [SEND_IMAGE: 0] [NO_RESPONSE]");
      expect(result).toBe("oke [BREAK] [SEND_IMAGE: 0]");
    });
  });

  describe("existing sanitization behavior", () => {
    it("strips agent prefix", () => {
      const result = sanitizeConsumerText("Agent: Halo ada yang bisa dibantu?\nTerima kasih");
      expect(result).toBe("Terima kasih");
    });

    it("strips consumer prefix", () => {
      const result = sanitizeConsumerText("Konsumen: Halo saya mau lapor");
      expect(result).toBe("Halo saya mau lapor");
    });

    it("strips previous message tags", () => {
      const result = sanitizeConsumerText("Ini pesan baru (pesan chat sebelumnya)");
      expect(result).toBe("Ini pesan baru");
    });
  });
});
