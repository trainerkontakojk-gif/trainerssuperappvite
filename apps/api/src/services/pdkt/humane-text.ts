/**
 * Pengaman terakhir untuk teks telaah yang dibaca agent: nama field prompt dan
 * nilai enum yang terbawa oleh AI diganti dengan bahasa sehari-hari. Aturan
 * bahasa di prompt tetap jalur utama; ini hanya menangkap yang lolos.
 */
const TERMS: ReadonlyArray<readonly [string, string]> = [
  [
    "reply_to_ojk_request_in_company_email",
    "permintaan bantuan kepada OJK di email untuk perusahaan",
  ],
  [
    "reply_to_company_with_ojk_cc",
    "balasan ke perusahaan dengan OJK sebagai tembusan",
  ],
  ["reply_to_ojk", "balasan langsung ke OJK"],
  ["replyIntent", "arah balasan"],
  ["recipientContext", "konteks penerima"],
  ["primaryRecipientType", "penerima utama"],
  ["conflictHints", "ketidaksesuaian penerima"],
  ["agentReplyBody", "balasan Anda"],
  ["inboundEmailBody", "email konsumen"],
  ["expectedAnswer", "jawaban yang diharapkan"],
  ["consumerPoints", "poin konsumen"],
  ["contentGaps", "informasi yang terlewat"],
  ["recipientDirectionScore", "skor arah penerima"],
  ["normativeResponseScore", "skor respons normatif"],
  ["clarityScore", "skor kejelasan"],
  ["typoScore", "skor ejaan"],
  ["templateComplianceScore", "skor kepatuhan template"],
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termPattern = TERMS.map(([term]) => escape(term)).join("|");
const humane = new Map(TERMS.map(([term, text]) => [term.toLowerCase(), text]));
/** Istilah dalam kurung, mis. "arah balasan (replyIntent)", cukup dihapus. */
const parenthesized = new RegExp(
  `\\s*\\(\\s*\`?(?:${termPattern})\`?\\s*\\)`,
  "gi",
);
const bare = new RegExp(`\`?\\b(${termPattern})\\b\`?`, "gi");

export function humanizePdktText(text: string): string {
  return text
    .replace(parenthesized, "")
    .replace(bare, (_, term: string) => humane.get(term.toLowerCase()) ?? term);
}

/** Kunci yang nilainya harus tetap persis: kutipan berposisi dan enum. */
const VERBATIM_KEYS = new Set([
  "quote",
  "replyQuote",
  "category",
  "dimension",
  "status",
  "kind",
]);

export function humanizePdktValue<T>(value: T): T {
  if (typeof value === "string") return humanizePdktText(value) as T;
  if (Array.isArray(value)) return value.map(humanizePdktValue) as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        VERBATIM_KEYS.has(key) ? item : humanizePdktValue(item),
      ]),
    ) as T;
  }
  return value;
}
