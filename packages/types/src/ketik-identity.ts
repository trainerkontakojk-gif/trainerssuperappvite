import type { KetikIdentity, KetikIdentitySettings } from "./ketik";

type KetikGender = NonNullable<KetikIdentity["gender"]>;

/** Server-picked consumers carry an explicit gender so the portrait never guesses. */
export const KETIK_DUMMY_CONSUMERS: ReadonlyArray<{
  name: string;
  gender: KetikGender;
}> = [
  { name: "Budi Santoso", gender: "male" },
  { name: "Siti Aminah", gender: "female" },
  { name: "Agus Setiawan", gender: "male" },
  { name: "Dewi Lestari", gender: "female" },
  { name: "Rina Wati", gender: "female" },
  { name: "Eko Prasetyo", gender: "male" },
  { name: "Hendra Wijaya", gender: "male" },
  { name: "Nurul Hidayah", gender: "female" },
  { name: "Bambang Pamungkas", gender: "male" },
  { name: "Lina Marlina", gender: "female" },
  { name: "Dedi Supriyadi", gender: "male" },
  { name: "Sri Wahyuni", gender: "female" },
  { name: "Rudi Hartono", gender: "male" },
  { name: "Ratna Sari", gender: "female" },
  { name: "Joko Widodo", gender: "male" },
  { name: "Mega Ayuningtyas", gender: "female" },
  { name: "Andi Pratama", gender: "male" },
  { name: "Fitri Handayani", gender: "female" },
  { name: "Rudi Hermawan", gender: "male" },
  { name: "Lukman Hakim", gender: "male" },
  { name: "Ayu Kartika", gender: "female" },
  { name: "Fajar Nugroho", gender: "male" },
  { name: "Yanti Susanti", gender: "female" },
  { name: "Iwan Saputra", gender: "male" },
  { name: "Maya Putri", gender: "female" },
  { name: "Reza Rahadian", gender: "male" },
  { name: "Indah Permatasari", gender: "female" },
  { name: "Slamet Riyadi", gender: "male" },
  { name: "Tuti Alawiyah", gender: "female" },
  { name: "Farhan Maulana", gender: "male" },
  { name: "Nabila Zahra", gender: "female" },
  { name: "Gilang Ramadhan", gender: "male" },
  { name: "Citra Kirana", gender: "female" },
  { name: "Bayu Anggara", gender: "male" },
  { name: "Wulan Dari", gender: "female" },
  { name: "Teuku Fariz", gender: "male" },
  { name: "Cut Marlia", gender: "female" },
  { name: "I Made Wirata", gender: "male" },
  { name: "Ni Luh Ayu", gender: "female" },
  { name: "Ujang Komarudin", gender: "male" },
  { name: "Eneng Suryani", gender: "female" },
  { name: "La Ode Haris", gender: "male" },
  { name: "Wa Ode Sitti", gender: "female" },
  { name: "Johan Panjaitan", gender: "male" },
  { name: "Boruk Sihombing", gender: "male" },
  { name: "Daeng Makkawaru", gender: "male" },
  { name: "Andi Tenri", gender: "female" },
  { name: "Yohanes Korwa", gender: "male" },
  { name: "Maria Matulessy", gender: "female" },
];
const DUMMY_CITIES = [
  "Jakarta Selatan",
  "Jakarta Pusat",
  "Jakarta Barat",
  "Jakarta Timur",
  "Jakarta Utara",
  "Kota Bogor",
  "Kota Depok",
  "Kota Bekasi",
  "Kota Tangerang",
  "Kota Tangerang Selatan",
  "Bandung",
  "Surabaya",
  "Medan",
  "Semarang",
  "Makassar",
  "Palembang",
  "Yogyakarta",
  "Malang",
  "Denpasar",
  "Balikpapan",
  "Samarinda",
  "Banjarmasin",
  "Pontianak",
  "Manado",
  "Padang",
  "Pekanbaru",
  "Bandar Lampung",
  "Batam",
  "Cirebon",
  "Solo",
  "Kediri",
  "Jember",
  "Mataram",
  "Kupang",
  "Ambon",
  "Jayapura",
  "Sorong",
  "Banda Aceh",
  "Bengkulu",
  "Jambi",
  "Cilegon",
  "Serang",
  "Purwokerto",
  "Magelang",
  "Palu",
  "Kendari",
  "Gorontalo",
  "Ternate",
  "Mamuju",
];
const PHONE_PREFIXES = [
  "0812",
  "0813",
  "0821",
  "0852",
  "0811",
  "0815",
  "0817",
  "0818",
  "0819",
  "0822",
  "0823",
  "0851",
  "0853",
  "0856",
  "0857",
  "0858",
  "0895",
  "0896",
];

export function resolveKetikSessionIdentity(
  settings: KetikIdentitySettings,
  pickIndex = Math.floor(Math.random() * 1000000),
): KetikIdentity {
  const dummy =
    KETIK_DUMMY_CONSUMERS[Math.abs(pickIndex) % KETIK_DUMMY_CONSUMERS.length];
  const name = settings.displayName || dummy.name;
  const gender = settings.displayName
    ? inferKetikIdentityGender(settings.displayName)
    : dummy.gender;
  const city =
    settings.city || DUMMY_CITIES[Math.abs(pickIndex) % DUMMY_CITIES.length];
  const prefix = PHONE_PREFIXES[Math.abs(pickIndex) % PHONE_PREFIXES.length];
  const phone =
    settings.phoneNumber ||
    `${prefix}${String(Math.abs(pickIndex)).padStart(8, "0").slice(-8)}`;

  return {
    name,
    city,
    phone,
    signatureName: settings.signatureName,
    ...(gender ? { gender } : {}),
  };
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
