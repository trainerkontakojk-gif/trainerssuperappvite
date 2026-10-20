import type { KetikIdentity, KetikIdentitySettings } from "./ketik";
import { KETIK_CONSUMER_POOL } from "./ketik-consumer-pool";

type KetikGender = NonNullable<KetikIdentity["gender"]>;

export {
  KETIK_CONSUMER_POOL,
  type KetikPoolConsumer,
} from "./ketik-consumer-pool";

/**
 * One whole pool record per session, so name, gender, city, NIK, email and
 * phone agree. A field the user filled in Pengaturan always wins; an email for
 * a user-chosen name is rebuilt from that name.
 */
export function resolveKetikSessionIdentity(
  settings: KetikIdentitySettings,
  pickIndex = Math.floor(Math.random() * 1000000),
): KetikIdentity {
  const start = Math.abs(pickIndex) % KETIK_CONSUMER_POOL.length;
  const customGender = settings.displayName
    ? inferKetikIdentityGender(settings.displayName)
    : undefined;
  // The NIK encodes gender (day +40 for women), so a custom name borrows the
  // next record of its own gender.
  const record =
    (customGender &&
      [...KETIK_CONSUMER_POOL.slice(start), ...KETIK_CONSUMER_POOL].find(
        (candidate) => candidate.gender === customGender,
      )) ||
    KETIK_CONSUMER_POOL[start];
  const name = settings.displayName || record.name;
  const gender = settings.displayName ? customGender : record.gender;
  const email =
    settings.email ||
    (settings.displayName
      ? buildKetikConsumerEmail(settings.displayName, record.birthDate)
      : record.email);

  return {
    name,
    city: settings.city || record.city,
    phone: settings.phoneNumber || record.phone,
    nik: settings.nik || record.nik,
    email,
    signatureName: settings.signatureName,
    ...(gender ? { gender } : {}),
  };
}

const EMAIL_SKIP_TOKENS = new Set([
  "i",
  "ni",
  "pak",
  "bapak",
  "bu",
  "ibu",
  "mas",
  "mbak",
  "kak",
  "bang",
]);

/** `nama.belakang<YY>@gmail.com`, the same shape the pool generator uses. */
export function buildKetikConsumerEmail(
  name: string,
  birthDate: string,
): string {
  const tokens = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const kept = tokens.filter(
    (token, index) =>
      !EMAIL_SKIP_TOKENS.has(token) || index === tokens.length - 1,
  );
  const words = kept.length > 0 ? kept : ["konsumen"];
  const local =
    words.length === 1 ? words[0] : `${words[0]}.${words[words.length - 1]}`;
  return `${local}${birthDate.slice(2, 4)}@gmail.com`;
}

const FEMALE_TITLES = new Set(["bu", "ibu", "mbak", "nona", "nyonya", "cut", "ni", "wa"]);
const MALE_TITLES = new Set(["pak", "bapak", "mas", "tuan", "teuku", "la", "daeng"]);
const FEMALE_NAME_TOKENS = new Set([
  "aisyah", "alawiyah", "aminah", "anisa", "ayu", "citra", "dewi", "eneng",
  "fatimah", "fitri", "handayani", "indah", "kartika", "kartini", "lestari",
  "lina", "luh", "maria", "marlia", "marlina", "maya", "mega", "nabila",
  "novi", "nurul", "permatasari", "putri", "ratna", "rina", "rini", "sari",
  "siti", "sitti", "sri", "suryani", "susanti", "tenri", "tuti", "wahyuni",
  "wati", "wulan", "yanti", "zahra",
]);
const MALE_NAME_TOKENS = new Set([
  "agus", "ahmad", "andi", "arief", "bambang", "bayu", "budi", "dedi",
  "dimas", "eko", "fajar", "farhan", "gilang", "haris", "hendra", "ilham",
  "iwan", "johan", "joko", "ketut", "lukman", "made", "muhammad", "nyoman",
  "prasetyo", "reza", "riyadi", "rizky", "rudi", "santoso", "saputra",
  "slamet", "supriyadi", "ujang", "wayan", "wijaya", "yohanes", "yusuf",
]);

/**
 * Gender for a custom consumer name, or undefined when the name does not say.
 * A title (Pak/Bu, Teuku/Cut, La/Wa) decides first; otherwise the first known
 * given-name token, so a male given name is never overridden by a surname.
 */
export function inferKetikIdentityGender(
  name: string,
): KetikGender | undefined {
  const tokens = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (FEMALE_TITLES.has(tokens[0] ?? "")) return "female";
  if (MALE_TITLES.has(tokens[0] ?? "")) return "male";
  for (const token of tokens) {
    if (FEMALE_NAME_TOKENS.has(token)) return "female";
    if (MALE_NAME_TOKENS.has(token)) return "male";
  }
  return undefined;
}
