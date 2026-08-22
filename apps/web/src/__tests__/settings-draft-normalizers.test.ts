import { describe, expect, it } from "vitest";
import {
  normalizeKetikConsumerDraft,
  normalizeKetikQuickTemplateDraft,
  normalizeKetikScenarioDraft,
} from "../routes/ketik/components/settings/ketikDraftNormalizers";
import {
  normalizePdktConsumerDraft,
  normalizePdktScenarioDraft,
} from "../routes/pdkt/components/settings/pdktDraftNormalizers";
import {
  normalizeTelefunConsumerDraft,
  normalizeTelefunScenarioDraft,
} from "../routes/telefun/components/settings/telefunDraftNormalizers";
import { ConsumerDifficulty } from "../routes/telefun/telefunSettings";

describe("settings draft normalizers", () => {
  it("normalizes KETIK scenario defaults without changing explicit inactive state", () => {
    expect(
      normalizeKetikScenarioDraft({
        category: "",
        title: "Komplain",
        description: "Nasabah komplain",
        script: undefined,
        isActive: false,
        images: undefined,
        imageAlts: undefined,
      }),
    ).toEqual({
      category: "Umum",
      title: "Komplain",
      description: "Nasabah komplain",
      script: "",
      isActive: false,
      images: [],
      imageAlts: [],
    });
  });

  it("normalizes KETIK consumer and quick template defaults", () => {
    expect(
      normalizeKetikConsumerDraft({
        name: "Pemula",
        description: "Butuh arahan",
        difficulty: undefined,
        isCustom: false,
      }),
    ).toEqual({
      name: "Pemula",
      description: "Butuh arahan",
      difficulty: "Sedang",
      isCustom: true,
    });

    expect(
      normalizeKetikQuickTemplateDraft({
        keyword: " Follow Up ",
        content: " Terima kasih ",
      }),
    ).toEqual({
      keyword: "follow-up",
      content: "Terima kasih",
    });
  });

  it("normalizes PDKT scenario and consumer defaults", () => {
    expect(
      normalizePdktScenarioDraft({
        category: "",
        title: "Refund",
        description: "Email refund",
        primaryRecipientType: "ojk",
        recipientMode: undefined,
        recipientEmails: [
          " FIRST@test.com ",
          "first@test.com",
          "",
          "bad-email",
        ],
        script: undefined,
        sampleEmailTemplate: undefined,
        alwaysUseSampleEmail: undefined,
        isActive: undefined,
        attachmentImages: undefined,
      }),
    ).toMatchObject({
      category: "Umum",
      sampleEmailTemplate: { subject: "", body: "" },
      alwaysUseSampleEmail: false,
      isActive: true,
      attachmentImages: [],
      primaryRecipientType: "ojk",
      recipientMode: "single",
      recipientEmails: ["first@test.com"],
    });

    expect(
      normalizePdktConsumerDraft({
        name: "Formal",
        description: "Bahasa formal",
        difficulty: undefined,
        tone: undefined,
        isCustom: false,
      }),
    ).toEqual({
      name: "Formal",
      description: "Bahasa formal",
      difficulty: "Medium",
      tone: "",
      isCustom: true,
    });
  });

  it("normalizes Telefun scenario and consumer defaults", () => {
    expect(
      normalizeTelefunScenarioDraft({
        category: "",
        title: "Tagihan",
        instruction: "Tanyakan status",
        script: undefined,
        isActive: undefined,
      }),
    ).toEqual({
      category: "Umum",
      title: "Tagihan",
      instruction: "Tanyakan status",
      script: "",
      isActive: true,
    });

    expect(
      normalizeTelefunConsumerDraft({
        name: "Random",
        description: "Random gender",
        difficulty: undefined,
        gender: undefined,
      }),
    ).toEqual({
      name: "Random",
      description: "Random gender",
      difficulty: ConsumerDifficulty.Medium,
      gender: "random",
    });
  });
});
