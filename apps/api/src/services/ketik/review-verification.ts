import {
  summarizeKetikVerificationStatus,
  type KetikAgentNote,
  type KetikIdentityAnomaly,
  type KetikVerificationField,
  type KetikVerificationReview,
} from "@trainers/types";
import { Type } from "@google/genai";
import { readMessages } from "./review-transcript";

const FIELD_LABELS = { nik: "NIK", email: "Email", city: "Domisili" } as const;

// One session-level deduction, regardless of how many fields were missed.
export const KETIK_VERIFICATION_PROBING_DEDUCTION = 20;

export const KETIK_VERIFICATION_INSTRUCTION = `
VERIFIKASI DATA (hanya bila verificationContext tersedia):
Untuk setiap field dari server, keluarkan verification.fields[] berisi field,
status (confirmed/unconfirmed/not_asked), dan agentMessageId.
confirmed: agen minimal sekali mempertanyakan NIK/email yang tidak sesuai atau
meminta kota/kabupaten untuk domisili yang belum spesifik. Permintaan data biasa
belum cukup. Sekali konfirmasi cukup meskipun konsumen menolak/mengabaikannya;
jangan menuntut pengulangan. unconfirmed: data diminta tetapi ketidaksesuaian
belum dikonfirmasi. not_asked: data tidak pernah diminta. Gunakan id pesan agen
yang benar-benar ada; jangan gunakan id pesan konsumen atau mengarang id.
Nilai Probing dasar seperti biasa tanpa pengurangan verifikasi; server menerapkan
pengurangan satu kali bila ada field belum dikonfirmasi. Jangan menambahkan
agentNotes verifikasi sendiri karena server membuat satu catatan beserta contoh.
`;

export const KETIK_VERIFICATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING, enum: ["nik", "email", "city"] },
          status: {
            type: Type.STRING,
            enum: ["confirmed", "unconfirmed", "not_asked"],
          },
          agentMessageId: { type: Type.STRING, nullable: true },
        },
        required: ["field", "status", "agentMessageId"],
      },
    },
  },
  required: ["fields"],
};

/** AI supplies only classification and an agent id; all evidence is server-owned. */
export function normalizeKetikVerification(
  raw: unknown,
  anomalies: readonly KetikIdentityAnomaly[],
  transcript: unknown,
): KetikVerificationReview | null {
  if (!anomalies.length) return null;
  const messages = readMessages(transcript);
  const agents = messages.filter((message) => message.sender === "agent");
  const source: unknown[] =
    raw &&
    typeof raw === "object" &&
    "fields" in raw &&
    Array.isArray(raw.fields)
      ? raw.fields
      : [];
  const fields: KetikVerificationField[] = anomalies.map((anomaly) => {
    const item = source.find(
      (entry): entry is Record<string, unknown> =>
        !!entry &&
        typeof entry === "object" &&
        "field" in entry &&
        entry.field === anomaly.field,
    );
    const agent = agents.find((message) => message.id === item?.agentMessageId);
    const status =
      item?.status === "not_asked"
        ? "not_asked"
        : item?.status === "confirmed" && agent
          ? "confirmed"
          : "unconfirmed";
    return {
      field: anomaly.field,
      value: anomaly.value,
      reason: anomaly.reason,
      status,
      agentMessageId: agent?.id ?? null,
      agentQuote: agent?.text ?? null,
    };
  });
  const status = summarizeKetikVerificationStatus(fields);
  const disclosureIndex = messages.findIndex(
    (message) =>
      message.sender === "consumer" &&
      anomalies.some((anomaly) =>
        message.text.toLowerCase().includes(anomaly.value.toLowerCase()),
      ),
  );
  const missed =
    disclosureIndex < 0
      ? agents.at(-1)
      : (messages
          .slice(disclosureIndex + 1)
          .find((message) => message.sender === "agent") ?? agents.at(-1));
  return {
    status,
    fields,
    missedBeforeMessageId: status === "confirmed" ? null : (missed?.id ?? null),
  };
}

export function buildKetikVerificationNote(
  verification: KetikVerificationReview | null,
  transcript: unknown,
): KetikAgentNote | null {
  if (!verification || verification.status === "confirmed") return null;
  const message = readMessages(transcript).find(
    (entry) =>
      entry.sender === "agent" &&
      entry.id === verification.missedBeforeMessageId,
  );
  if (!message) return null;
  const missed = verification.fields.filter(
    (field) => field.status !== "confirmed",
  );
  const examples = {
    nik: "Boleh konfirmasi kembali NIK 16 digitnya?",
    email: "Boleh konfirmasi ejaan alamat email dan domainnya?",
    city: "Boleh konfirmasi kota/kabupaten domisilinya?",
  };
  return {
    messageId: message.id,
    quote: message.text,
    dimension: "probing",
    verdict: "fix",
    note: `Verifikasi data: ${missed.map((field) => `${FIELD_LABELS[field.field]} ${field.reason.toLowerCase()}${field.field === "city" ? ", domisili tidak bisa diverifikasi" : ""}`).join("; ")}. Tanyakan atau konfirmasi sekali meski konsumen tidak menjawab.`,
    example: missed.map((field) => examples[field.field]).join(" "),
  };
}
