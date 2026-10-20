#!/usr/bin/env node
// Builds packages/types/src/ketik-consumer-pool.ts: 150 practice consumers whose
// name, gender, city, NIK, email and phone agree with each other. The seed is
// fixed, so rerunning produces the same file; commit the output.
//
// NIK = 6-digit regional code of the city + birth date (day +40 for women) +
// sequence 0000. Dukcapil never issues sequence 0000, so no NIK here belongs to
// a real person.
//
// Usage: node scripts/generate-ketik-consumer-pool.mjs

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/types/src/ketik-consumer-pool.ts",
);
const REFERENCE_YEAR = 2026;

/** City → 4-digit province+regency code (Kemendagri). */
const CITY_CODES = {
  "Jakarta Selatan": "3174",
  "Jakarta Pusat": "3171",
  "Jakarta Barat": "3173",
  "Jakarta Timur": "3175",
  "Jakarta Utara": "3172",
  "Kota Bogor": "3271",
  "Kota Depok": "3276",
  "Kota Bekasi": "3275",
  "Kota Tangerang": "3671",
  "Kota Tangerang Selatan": "3674",
  Bandung: "3273",
  Surabaya: "3578",
  Medan: "1275",
  Semarang: "3374",
  Makassar: "7371",
  Palembang: "1671",
  Yogyakarta: "3471",
  Malang: "3573",
  Denpasar: "5171",
  Balikpapan: "6471",
  Samarinda: "6472",
  Banjarmasin: "6371",
  Pontianak: "6171",
  Manado: "7171",
  Padang: "1371",
  Pekanbaru: "1471",
  "Bandar Lampung": "1871",
  Batam: "2171",
  Cirebon: "3274",
  Solo: "3372",
  Kediri: "3571",
  Jember: "3509",
  Mataram: "5271",
  Kupang: "5371",
  Ambon: "8171",
  Jayapura: "9171",
  Sorong: "9271",
  "Banda Aceh": "1171",
  Bengkulu: "1771",
  Jambi: "1571",
  Cilegon: "3672",
  Serang: "3673",
  Purwokerto: "3302",
  Magelang: "3371",
  Palu: "7271",
  Kendari: "7471",
  Gorontalo: "7571",
  Ternate: "8271",
  Mamuju: "7604",
};

const REGION_CITIES = {
  umum: [
    "Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Timur",
    "Jakarta Utara", "Kota Bogor", "Kota Depok", "Kota Bekasi",
    "Kota Tangerang", "Kota Tangerang Selatan", "Bandung", "Surabaya",
    "Semarang", "Yogyakarta", "Malang", "Batam", "Balikpapan", "Palembang",
  ],
  jabodetabek: [
    "Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Timur",
    "Jakarta Utara", "Kota Depok", "Kota Bekasi", "Kota Tangerang",
    "Kota Tangerang Selatan",
  ],
  jawa: [
    "Semarang", "Solo", "Yogyakarta", "Surabaya", "Malang", "Kediri",
    "Jember", "Purwokerto", "Magelang",
  ],
  sunda: ["Bandung", "Kota Bogor", "Cirebon", "Kota Depok", "Kota Bekasi"],
  banten: ["Serang", "Cilegon", "Kota Tangerang"],
  minang: ["Padang", "Pekanbaru"],
  batak: ["Medan"],
  melayu: ["Pekanbaru", "Batam", "Palembang", "Jambi", "Bengkulu", "Pontianak"],
  lampung: ["Bandar Lampung"],
  aceh: ["Banda Aceh"],
  bali: ["Denpasar"],
  ntb: ["Mataram"],
  ntt: ["Kupang"],
  bugis: ["Makassar", "Kendari", "Palu", "Mamuju"],
  sulut: ["Manado", "Gorontalo"],
  maluku: ["Ambon", "Ternate"],
  papua: ["Jayapura", "Sorong"],
  kalimantan: ["Banjarmasin", "Balikpapan", "Samarinda", "Pontianak"],
};

// [name, gender, region]. The first 49 are the pre-pool consumers, in their
// original order; index 0 stays Budi Santoso in Jakarta Selatan.
const PEOPLE = [
  ["Budi Santoso", "male", "jabodetabek"],
  ["Siti Aminah", "female", "umum"],
  ["Agus Setiawan", "male", "umum"],
  ["Dewi Lestari", "female", "umum"],
  ["Rina Wati", "female", "umum"],
  ["Eko Prasetyo", "male", "jawa"],
  ["Hendra Wijaya", "male", "umum"],
  ["Nurul Hidayah", "female", "umum"],
  ["Bambang Pamungkas", "male", "jawa"],
  ["Lina Marlina", "female", "sunda"],
  ["Dedi Supriyadi", "male", "sunda"],
  ["Sri Wahyuni", "female", "jawa"],
  ["Rudi Hartono", "male", "jawa"],
  ["Ratna Sari", "female", "umum"],
  ["Joko Widodo", "male", "jawa"],
  ["Mega Ayuningtyas", "female", "jawa"],
  ["Andi Pratama", "male", "umum"],
  ["Fitri Handayani", "female", "umum"],
  ["Rudi Hermawan", "male", "umum"],
  ["Lukman Hakim", "male", "umum"],
  ["Ayu Kartika", "female", "umum"],
  ["Fajar Nugroho", "male", "jawa"],
  ["Yanti Susanti", "female", "sunda"],
  ["Iwan Saputra", "male", "umum"],
  ["Maya Putri", "female", "umum"],
  ["Reza Rahadian", "male", "umum"],
  ["Indah Permatasari", "female", "umum"],
  ["Slamet Riyadi", "male", "jawa"],
  ["Tuti Alawiyah", "female", "jabodetabek"],
  ["Farhan Maulana", "male", "umum"],
  ["Nabila Zahra", "female", "umum"],
  ["Gilang Ramadhan", "male", "umum"],
  ["Citra Kirana", "female", "umum"],
  ["Bayu Anggara", "male", "umum"],
  ["Wulan Dari", "female", "jawa"],
  ["Teuku Fariz", "male", "aceh"],
  ["Cut Marlia", "female", "aceh"],
  ["I Made Wirata", "male", "bali"],
  ["Ni Luh Ayu", "female", "bali"],
  ["Ujang Komarudin", "male", "sunda"],
  ["Eneng Suryani", "female", "sunda"],
  ["La Ode Haris", "male", "bugis"],
  ["Wa Ode Sitti", "female", "bugis"],
  ["Johan Panjaitan", "male", "batak"],
  ["Boruk Sihombing", "male", "batak"],
  ["Daeng Makkawaru", "male", "bugis"],
  ["Andi Tenri", "female", "bugis"],
  ["Yohanes Korwa", "male", "papua"],
  ["Maria Matulessy", "female", "maluku"],
  // Added with the NIK/email pool.
  ["Wahyu Nugroho", "male", "jawa"],
  ["Sri Mulyani", "female", "jawa"],
  ["Bambang Sutrisno", "male", "jawa"],
  ["Endang Sulastri", "female", "jawa"],
  ["Sugeng Riyanto", "male", "jawa"],
  ["Kartini Rahayu", "female", "jawa"],
  ["Purnomo Adi", "male", "jawa"],
  ["Retno Wulandari", "female", "jawa"],
  ["Heru Susilo", "male", "jawa"],
  ["Wening Astuti", "female", "jawa"],
  ["Danang Prakoso", "male", "jawa"],
  ["Sekar Ayuningtyas", "female", "jawa"],
  ["Yudi Hartanto", "male", "jawa"],
  ["Pratiwi Anggraini", "female", "jawa"],
  ["Tri Widodo", "male", "jawa"],
  ["Dwi Purwanti", "female", "jawa"],
  ["Supardi Wibowo", "male", "jawa"],
  ["Lestari Ningsih", "female", "jawa"],
  ["Asep Sunandar", "male", "sunda"],
  ["Dadang Hermawan", "male", "sunda"],
  ["Euis Komariah", "female", "sunda"],
  ["Cecep Rahmat", "male", "sunda"],
  ["Neng Rosita", "female", "sunda"],
  ["Yayan Ruhiyat", "male", "sunda"],
  ["Iis Sumiati", "female", "sunda"],
  ["Dede Kurniawan", "male", "sunda"],
  ["Ai Nurhasanah", "female", "sunda"],
  ["Rahmat Hidayat", "male", "jabodetabek"],
  ["Nadia Safitri", "female", "jabodetabek"],
  ["Muhammad Rizky", "male", "jabodetabek"],
  ["Aulia Rahmawati", "female", "jabodetabek"],
  ["Fauzi Abdullah", "male", "jabodetabek"],
  ["Siti Rohmah", "female", "jabodetabek"],
  ["Dimas Aditya", "male", "jabodetabek"],
  ["Anisa Fitriani", "female", "jabodetabek"],
  ["Arief Kurniawan", "male", "jabodetabek"],
  ["Putri Ramadhani", "female", "jabodetabek"],
  ["Rizal Chaniago", "male", "minang"],
  ["Yusnita Sikumbang", "female", "minang"],
  ["Afdal Piliang", "male", "minang"],
  ["Rahmi Koto", "female", "minang"],
  ["Togar Simanjuntak", "male", "batak"],
  ["Rosmawati Siregar", "female", "batak"],
  ["Parulian Nainggolan", "male", "batak"],
  ["Lamtiar Hutapea", "female", "batak"],
  ["Hotman Situmorang", "male", "batak"],
  ["Mardiana Lubis", "female", "batak"],
  ["Azmi Syahputra", "male", "melayu"],
  ["Nurhaliza Putri", "female", "melayu"],
  ["Tengku Amir", "male", "melayu"],
  ["Wan Syarifah", "female", "melayu"],
  ["Hendri Saputra", "male", "melayu"],
  ["Juwita Sari", "female", "melayu"],
  ["Ridwan Effendi", "male", "melayu"],
  ["Teuku Iskandar", "male", "aceh"],
  ["Cut Rahmawati", "female", "aceh"],
  ["Muzakir Ibrahim", "male", "aceh"],
  ["I Wayan Sudarma", "male", "bali"],
  ["Ni Made Sriani", "female", "bali"],
  ["I Ketut Arsana", "male", "bali"],
  ["Ni Komang Sukerti", "female", "bali"],
  ["Andi Baso Amir", "male", "bugis"],
  ["Sitti Hajar", "female", "bugis"],
  ["Muhammad Arfah", "male", "bugis"],
  ["Nurhayati Rahman", "female", "bugis"],
  ["Ronald Tumbelaka", "male", "sulut"],
  ["Stevani Lumowa", "female", "sulut"],
  ["Fadli Hasan", "male", "sulut"],
  ["Rizky Mokoginta", "male", "sulut"],
  ["Ferry Pattinama", "male", "maluku"],
  ["Grace Latumahina", "female", "maluku"],
  ["Ahmad Tuasikal", "male", "maluku"],
  ["Nurlela Umasugi", "female", "maluku"],
  ["Markus Wenda", "male", "papua"],
  ["Yuliana Rumbiak", "female", "papua"],
  ["Elias Mandacan", "male", "papua"],
  ["Yosef Bria", "male", "ntt"],
  ["Maria Ndun", "female", "ntt"],
  ["Lalu Muhammad Zaki", "male", "ntb"],
  ["Baiq Nurul", "female", "ntb"],
  ["Gusti Rahman", "male", "kalimantan"],
  ["Rusmini Aryani", "female", "kalimantan"],
  ["Dayang Mariam", "female", "kalimantan"],
  ["Bonifasius Ajang", "male", "kalimantan"],
  ["Taufik Ramadhan", "male", "kalimantan"],
  ["Ade Supriatna", "male", "banten"],
  ["Uum Hasanah", "female", "banten"],
  ["Ratu Fitriana", "female", "lampung"],
  ["Hendra Gunawan", "male", "lampung"],
  ["Kevin Wijaya", "male", "umum"],
  ["Jessica Halim", "female", "umum"],
  ["Steven Gunawan", "male", "umum"],
  ["Linda Kusuma", "female", "umum"],
  ["Yohana Pratiwi", "female", "umum"],
  ["Galih Saputra", "male", "umum"],
  ["Novita Sari", "female", "umum"],
  ["Irwan Setiadi", "male", "umum"],
  ["Melati Anggraini", "female", "umum"],
  ["Yoga Pratama", "male", "umum"],
  ["Desi Kurniasih", "female", "umum"],
  ["Hari Santoso", "male", "umum"],
];

const PHONE_PREFIXES = [
  "0812", "0813", "0821", "0852", "0811", "0815", "0817", "0818", "0819",
  "0822", "0823", "0851", "0853", "0856", "0857", "0858", "0895", "0896",
];

// mulberry32: small, deterministic, good enough for fixture data.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20261020);
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (items) => items[Math.floor(random() * items.length)];
const pad = (value, size = 2) => String(value).padStart(size, "0");

const PARTICLES = new Set(["i", "ni"]);
function emailLocalPart(name) {
  const tokens = name.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/);
  const joined = [];
  for (let i = 0; i < tokens.length; i++) {
    if ((tokens[i] === "la" || tokens[i] === "wa") && tokens[i + 1] === "ode") {
      joined.push(`${tokens[i]}ode`);
      i++;
    } else if (!PARTICLES.has(tokens[i]) || i === tokens.length - 1) {
      joined.push(tokens[i]);
    }
  }
  return `${joined[0]}.${joined[joined.length - 1]}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

if (PEOPLE.length !== 150) {
  throw new Error(`Expected 150 consumers, got ${PEOPLE.length}`);
}

const seenNames = new Set();
const seenEmails = new Set();
const seenNiks = new Set();
const records = PEOPLE.map(([name, gender, region], index) => {
  if (seenNames.has(name)) throw new Error(`Duplicate name ${name}`);
  seenNames.add(name);
  const cities = REGION_CITIES[region];
  if (!cities) throw new Error(`Unknown region ${region}`);
  const city = index === 0 ? "Jakarta Selatan" : pick(cities);
  const cityCode = CITY_CODES[city];
  if (!cityCode) throw new Error(`No regional code for ${city}`);

  const year = REFERENCE_YEAR - int(21, 60);
  const month = int(1, 12);
  const day = int(1, daysInMonth(year, month));
  const birthDate = `${year}-${pad(month)}-${pad(day)}`;
  const nikDay = gender === "female" ? day + 40 : day;
  let nik;
  do {
    nik = `${cityCode}${pad(int(1, 9))}${pad(nikDay)}${pad(month)}${pad(year % 100)}0000`;
  } while (seenNiks.has(nik));
  seenNiks.add(nik);

  let email = `${emailLocalPart(name)}${pad(year % 100)}@gmail.com`;
  if (seenEmails.has(email)) email = email.replace("@", `${int(1, 9)}@`);
  seenEmails.add(email);

  const prefix = index === 0 ? "0812" : pick(PHONE_PREFIXES);
  const phone = `${prefix}${pad(int(0, 99999999), 8)}`;
  return { name, gender, city, birthDate, nik, email, phone };
});

const body = records
  .map(
    (record) =>
      `  { name: ${JSON.stringify(record.name)}, gender: "${record.gender}", city: ${JSON.stringify(record.city)}, birthDate: "${record.birthDate}", nik: "${record.nik}", email: "${record.email}", phone: "${record.phone}" },`,
  )
  .join("\n");

writeFileSync(
  OUTPUT,
  `// Generated by scripts/generate-ketik-consumer-pool.mjs — do not edit by hand.
// Practice data only: every NIK ends in sequence 0000, which Dukcapil never
// issues, and the app never sends email to these addresses.

export interface KetikPoolConsumer {
  name: string;
  gender: "male" | "female";
  city: string;
  /** ISO date (YYYY-MM-DD); the NIK encodes the same date. */
  birthDate: string;
  nik: string;
  email: string;
  phone: string;
}

// One record per line keeps the pool reviewable.
// prettier-ignore
export const KETIK_CONSUMER_POOL: ReadonlyArray<KetikPoolConsumer> = [
${body}
];
`,
);
console.log(`Wrote ${records.length} consumers to ${OUTPUT}`);
