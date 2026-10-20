import type { KetikIdentity } from "./ketik";

/**
 * Deliberately malformed consumer data a trainer can type in Pengaturan so the
 * agent practises verifying it. Pool records never trigger these rules.
 * Shared by the Pengaturan note, the Telaah card and the backend prompts, so
 * every surface agrees on what "tidak sesuai" means.
 */
export type KetikIdentityAnomalyField = "nik" | "email" | "city";

export interface KetikIdentityAnomaly {
  field: KetikIdentityAnomalyField;
  /** The value exactly as the session holds it. */
  value: string;
  /** Short chip text, e.g. "15 digit" or "domain typo". */
  label: string;
  /** Why it is not valid, e.g. "15 digit, harus 16". */
  reason: string;
  /** Substring of `value` to mark; the whole value when no part stands out. */
  highlight: string;
}

/** The well-formed value the consumer gives when the agent asks to confirm. */
export type KetikIdentityCorrection = Partial<
  Record<KetikIdentityAnomalyField, string>
>;

type IdentityFields = Pick<Partial<KetikIdentity>, "nik" | "email" | "city">;

const NIK_LENGTH = 16;
/** Domains a misspelling is matched against, most common first. */
const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.id",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
];
/** Real domains that sit one or two edits away from a common one. */
const KNOWN_EMAIL_DOMAINS = new Set([
  ...COMMON_EMAIL_DOMAINS,
  "ymail.com",
  "mail.com",
  "live.com",
  "outlook.co.id",
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Province → its capital, the city a consumer names when asked. */
const PROVINCE_CAPITALS: Record<string, string> = {
  aceh: "Banda Aceh",
  "sumatera utara": "Medan",
  sumut: "Medan",
  "sumatera barat": "Padang",
  sumbar: "Padang",
  riau: "Pekanbaru",
  "kepulauan riau": "Batam",
  kepri: "Batam",
  "sumatera selatan": "Palembang",
  sumsel: "Palembang",
  "bangka belitung": "Pangkalpinang",
  "kepulauan bangka belitung": "Pangkalpinang",
  babel: "Pangkalpinang",
  lampung: "Bandar Lampung",
  banten: "Serang",
  "jawa barat": "Bandung",
  jabar: "Bandung",
  "jawa tengah": "Semarang",
  jateng: "Semarang",
  "jawa timur": "Surabaya",
  jatim: "Surabaya",
  "di yogyakarta": "Yogyakarta",
  "daerah istimewa yogyakarta": "Yogyakarta",
  diy: "Yogyakarta",
  bali: "Denpasar",
  "nusa tenggara barat": "Mataram",
  ntb: "Mataram",
  "nusa tenggara timur": "Kupang",
  ntt: "Kupang",
  "kalimantan barat": "Pontianak",
  kalbar: "Pontianak",
  "kalimantan tengah": "Palangka Raya",
  kalteng: "Palangka Raya",
  "kalimantan selatan": "Banjarmasin",
  kalsel: "Banjarmasin",
  "kalimantan timur": "Samarinda",
  kaltim: "Samarinda",
  "kalimantan utara": "Tarakan",
  kaltara: "Tarakan",
  "sulawesi utara": "Manado",
  sulut: "Manado",
  "sulawesi tengah": "Palu",
  sulteng: "Palu",
  "sulawesi selatan": "Makassar",
  sulsel: "Makassar",
  "sulawesi tenggara": "Kendari",
  sultra: "Kendari",
  "sulawesi barat": "Mamuju",
  sulbar: "Mamuju",
  maluku: "Ambon",
  "maluku utara": "Ternate",
  papua: "Jayapura",
  "papua barat": "Manokwari",
  "papua barat daya": "Sorong",
  "papua selatan": "Merauke",
  "papua tengah": "Nabire",
  "papua pegunungan": "Wamena",
};
// Jambi, Bengkulu, Gorontalo and Yogyakarta also name a city, so they count as
// the city and are left out above.
const BARE_JAKARTA = new Set(["jakarta", "dki jakarta", "dki"]);
const JAKARTA_CITIES = [
  "Jakarta Selatan",
  "Jakarta Timur",
  "Jakarta Barat",
  "Jakarta Utara",
  "Jakarta Pusat",
];

function normalizeRegion(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/^(provinsi|prov\.?)\s+/, "")
    .replace(/\s+/g, " ");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[b.length];
}

/** The common domain a misspelt one was meant to be, or null. */
function closestCommonDomain(domain: string): string | null {
  if (KNOWN_EMAIL_DOMAINS.has(domain)) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best?.domain ?? null;
}

function nikAnomaly(nik: string): KetikIdentityAnomaly | null {
  const compact = nik.replace(/\s+/g, "");
  if (/[^0-9]/.test(compact)) {
    return {
      field: "nik",
      value: nik,
      label: "bukan angka",
      reason: "Berisi karakter selain angka",
      highlight: nik,
    };
  }
  if (compact.length === NIK_LENGTH) return null;
  return {
    field: "nik",
    value: nik,
    label: `${compact.length} digit`,
    reason: `${compact.length} digit, harus ${NIK_LENGTH}`,
    highlight: nik,
  };
}

function emailAnomaly(email: string): KetikIdentityAnomaly | null {
  const trimmed = email.trim();
  if (!EMAIL_PATTERN.test(trimmed)) {
    return {
      field: "email",
      value: email,
      label: "format salah",
      reason: "Format email tidak lengkap",
      highlight: email,
    };
  }
  const domain = trimmed.slice(trimmed.lastIndexOf("@") + 1);
  const intended = closestCommonDomain(domain.toLowerCase());
  if (!intended) return null;
  return {
    field: "email",
    value: email,
    label: "domain typo",
    reason: `Domain mirip ${intended}`,
    highlight: domain,
  };
}

function cityAnomaly(city: string): KetikIdentityAnomaly | null {
  const region = normalizeRegion(city);
  if (BARE_JAKARTA.has(region)) {
    return {
      field: "city",
      value: city,
      label: "belum spesifik",
      reason: "Jakarta tanpa kota administrasinya",
      highlight: city,
    };
  }
  if (!PROVINCE_CAPITALS[region]) return null;
  return {
    field: "city",
    value: city,
    label: "nama provinsi",
    reason: "Nama provinsi, kota/kabupaten belum disebut",
    highlight: city,
  };
}

/** Malformed NIK/email and unspecific domicile, in display order. Empty values pass. */
export function detectKetikIdentityAnomalies(
  identity: IdentityFields,
): KetikIdentityAnomaly[] {
  const anomalies = [
    identity.nik?.trim() ? nikAnomaly(identity.nik) : null,
    identity.email?.trim() ? emailAnomaly(identity.email) : null,
    identity.city?.trim() ? cityAnomaly(identity.city) : null,
  ];
  return anomalies.filter(
    (anomaly): anomaly is KetikIdentityAnomaly => anomaly !== null,
  );
}

function correctNik(nik: string): string {
  const digits = nik.replace(/[^0-9]/g, "");
  return digits.slice(0, NIK_LENGTH).padEnd(NIK_LENGTH, "0");
}

function correctEmail(email: string): string {
  const trimmed = email.trim().replace(/\s+/g, "");
  const at = trimmed.lastIndexOf("@");
  if (at < 0) {
    // "budi.santosogmail.com" → split off a trailing common domain if present.
    const domain = COMMON_EMAIL_DOMAINS.find(
      (candidate) =>
        trimmed.toLowerCase().endsWith(candidate) &&
        trimmed.length > candidate.length,
    );
    return domain
      ? `${trimmed.slice(0, -domain.length)}@${domain}`
      : `${trimmed}@gmail.com`;
  }
  const local = trimmed.slice(0, at) || "konsumen";
  const domain = trimmed.slice(at + 1).toLowerCase();
  const intended =
    closestCommonDomain(domain) ??
    COMMON_EMAIL_DOMAINS.find(
      (candidate) => candidate.split(".")[0] === domain.split(".")[0],
    ) ??
    "gmail.com";
  return `${local}@${intended}`;
}

function correctCity(city: string, seed: string): string {
  const region = normalizeRegion(city);
  const capital = PROVINCE_CAPITALS[region];
  if (capital) return capital;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return JAKARTA_CITIES[hash % JAKARTA_CITIES.length];
}

/**
 * The well-formed version of each anomalous field, or null when the identity is
 * valid. Deterministic for the same identity, so the consumer never invents a
 * different "correct" NIK, email or city between turns.
 */
export function computeKetikIdentityCorrection(
  identity: IdentityFields & Pick<Partial<KetikIdentity>, "name">,
): KetikIdentityCorrection | null {
  const correction: KetikIdentityCorrection = {};
  for (const anomaly of detectKetikIdentityAnomalies(identity)) {
    if (anomaly.field === "nik") correction.nik = correctNik(anomaly.value);
    if (anomaly.field === "email")
      correction.email = correctEmail(anomaly.value);
    if (anomaly.field === "city") {
      correction.city = correctCity(anomaly.value, identity.name ?? "");
    }
  }
  return Object.keys(correction).length > 0 ? correction : null;
}
