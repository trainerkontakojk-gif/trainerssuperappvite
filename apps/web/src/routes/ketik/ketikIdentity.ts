import type { KetikIdentity, KetikIdentitySettings } from "@trainers/types";

const DUMMY_NAMES = [
  "Budi Santoso",
  "Siti Aminah",
  "Agus Setiawan",
  "Dewi Lestari",
  "Rina Wati",
  "Eko Prasetyo",
];
const DUMMY_CITIES = [
  "Jakarta Selatan",
  "Jakarta Pusat",
  "Jakarta Barat",
  "Jakarta Timur",
  "Kota Bogor",
  "Kota Depok",
];
const PHONE_PREFIXES = ["0812", "0813", "0821", "0852"];

export function resolveKetikSessionIdentity(
  settings: KetikIdentitySettings,
  pickIndex = Math.floor(Math.random() * 1000000),
): KetikIdentity {
  const name =
    settings.displayName || DUMMY_NAMES[Math.abs(pickIndex) % DUMMY_NAMES.length];
  const city =
    settings.city || DUMMY_CITIES[Math.abs(pickIndex) % DUMMY_CITIES.length];
  const prefix =
    PHONE_PREFIXES[Math.abs(pickIndex) % PHONE_PREFIXES.length];
  const phone =
    settings.phoneNumber ||
    `${prefix}${String(Math.abs(pickIndex)).padStart(8, "0").slice(-8)}`;

  return {
    name,
    city,
    phone,
    signatureName: settings.signatureName,
  };
}
