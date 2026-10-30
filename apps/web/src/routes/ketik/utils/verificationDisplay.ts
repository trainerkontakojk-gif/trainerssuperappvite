import type {
  KetikIdentityAnomalyField,
  KetikVerificationStatus,
} from "@trainers/types";

export const FIELD_LABELS: Record<KetikIdentityAnomalyField, string> = {
  nik: "NIK",
  email: "Email",
  city: "Domisili",
};

export const STATUS: Record<
  KetikVerificationStatus,
  { label: string; dot: string }
> = {
  confirmed: { label: "Dikonfirmasi", dot: "bg-chart-green" },
  unconfirmed: { label: "Belum dikonfirmasi", dot: "bg-chart-orange" },
  not_asked: { label: "Tidak ditanyakan", dot: "bg-chart-red" },
};
