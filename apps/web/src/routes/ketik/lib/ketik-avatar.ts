import type { KetikSessionConfig } from "@trainers/types";

const FEMALE_NAME_TOKENS = new Set([
  "alawiyah",
  "aminah",
  "ayu",
  "citra",
  "dewi",
  "eneng",
  "fitri",
  "handayani",
  "indah",
  "kartika",
  "lestari",
  "lina",
  "maria",
  "marlia",
  "marlina",
  "matulessy",
  "maya",
  "mega",
  "nabila",
  "nurul",
  "permatasari",
  "putri",
  "ratna",
  "rina",
  "sari",
  "siti",
  "sri",
  "suryani",
  "tuti",
  "wahyuni",
  "wulan",
  "yanti",
  "zahra",
]);

const MALE_NAME_TOKENS = new Set([
  "agus",
  "andi",
  "bambang",
  "bayu",
  "budi",
  "dedi",
  "eko",
  "fajar",
  "farhan",
  "gilang",
  "hendra",
  "iwan",
  "johan",
  "joko",
  "lukman",
  "prasetyo",
  "rahadian",
  "reza",
  "riyadi",
  "rudi",
  "santoso",
  "saputra",
  "slamet",
  "supriyadi",
  "teuku",
  "ujang",
  "wijaya",
  "yohanes",
]);

function inferPortraitGender(
  identity: KetikSessionConfig["identity"],
): "men" | "women" | null {
  if (identity.gender === "female") return "women";
  if (identity.gender === "male") return "men";

  const tokens = identity.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.some((token) => FEMALE_NAME_TOKENS.has(token))) return "women";
  if (tokens.some((token) => MALE_NAME_TOKENS.has(token))) return "men";
  return null;
}

export function getKetikConsumerAvatarUrl(
  identity: KetikSessionConfig["identity"],
): string {
  const seed = `${identity.name}|${identity.phone}|${identity.city}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const gender =
    inferPortraitGender(identity) ?? (hash % 2 === 0 ? "men" : "women");
  const portraitIndex = Math.floor(hash / 2) % 100;

  return `https://randomuser.me/api/portraits/${gender}/${portraitIndex}.jpg`;
}
