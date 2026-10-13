import type { PdktScenario } from "@trainers/types";

/**
 * Tiga arah balasan skenario PDKT. Disimpan sebagai `primaryRecipientType` +
 * `ojkRequestInBody`; peserta tidak pernah melihat pilihan ini.
 */
export type ReplyDirection = "cc_only" | "ojk_request_in_body" | "ojk";

export const REPLY_DIRECTIONS: {
  id: ReplyDirection;
  title: string;
  tag: string;
  description: string;
  to: string;
  cc: string;
  expected: string;
}[] = [
  {
    id: "cc_only",
    title: "Hanya tembusan ke OJK",
    tag: "Normatif",
    description:
      "Konsumen mengadu ke perusahaan dan hanya menembuskan email ke OJK.",
    to: "Perusahaan terlapor",
    cc: "OJK 157",
    expected: "Ucapan terima kasih dan arahan normatif.",
  },
  {
    id: "ojk_request_in_body",
    title: "Tembusan, tapi minta bantuan OJK",
    tag: "Jebakan",
    description:
      "Email ditujukan ke perusahaan, tetapi di tengah isinya konsumen meminta bantuan OJK. Peserta harus menyadarinya sendiri.",
    to: "Perusahaan terlapor",
    cc: "OJK 157",
    expected:
      "Tanggapi sebagai pengaduan ke OJK, sesuai kasus dan standar jawaban.",
  },
  {
    id: "ojk",
    title: "Langsung ke OJK",
    tag: "Substansi",
    description: "Konsumen menulis langsung ke OJK 157.",
    to: "OJK 157",
    cc: "Tidak ada",
    expected: "Sesuai kasus dan standar jawaban.",
  },
];

export function getReplyDirection(
  draft: Partial<PdktScenario>,
): ReplyDirection {
  if (draft.primaryRecipientType !== "reported_company") return "ojk";
  return draft.ojkRequestInBody ? "ojk_request_in_body" : "cc_only";
}

export function toScenarioDirection(
  direction: ReplyDirection,
): Pick<PdktScenario, "primaryRecipientType" | "ojkRequestInBody"> {
  if (direction === "ojk") {
    return { primaryRecipientType: "ojk", ojkRequestInBody: undefined };
  }
  return {
    primaryRecipientType: "reported_company",
    ojkRequestInBody: direction === "ojk_request_in_body" ? true : undefined,
  };
}
