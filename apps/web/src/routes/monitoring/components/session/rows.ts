import type {
  KetikMonitoringReview,
  PdktMonitoringReview,
  TelefunMonitoringReview,
} from "@trainers/types";
import { formatLongDuration } from "../../utils/formatting";

export type SessionRow = [label: string, value: string | null];

const joined = (...parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ") || null;

/** Baris panel "Sesi" khusus modul (setelah Peserta dan Akun pelaksana). */
export function ketikSessionRows(review: KetikMonitoringReview): SessionRow[] {
  const session = review.session;
  return [
    ["Konsumen", joined(session?.consumerName, session?.consumerCity, session?.consumerPhone)],
    ["Lama sesi", formatLongDuration(review.header?.duration_seconds)],
    // `simulationDuration` adalah batas waktu yang dipilih (menit), bukan lama sesi.
    [
      "Batas waktu",
      session?.simulationDuration != null ? `${session.simulationDuration} menit` : null,
    ],
  ];
}

export function pdktSessionRows(review: PdktMonitoringReview): SessionRow[] {
  const session = review.session;
  return [
    ["Konsumen", joined(session?.consumer_name, session?.consumer_type)],
    ...(session?.recipient ? [["Penerima", session.recipient] as SessionRow] : []),
    ...(session?.contact ? [["Kontak", session.contact] as SessionRow] : []),
    [
      "Lama mengerjakan",
      formatLongDuration(review.time_taken ?? review.header?.duration_seconds),
    ],
  ];
}

export function telefunSessionRows(review: TelefunMonitoringReview): SessionRow[] {
  const consumerType = joined(review.persona_config?.consumerType, review.consumer_gender);
  return [
    ["Konsumen", joined(review.consumer_name, review.consumer_city, review.consumer_phone)],
    ...(consumerType ? [["Tipe konsumen", consumerType] as SessionRow] : []),
    [
      "Lama panggilan",
      formatLongDuration(review.duration_seconds ?? review.header?.duration_seconds),
    ],
  ];
}
