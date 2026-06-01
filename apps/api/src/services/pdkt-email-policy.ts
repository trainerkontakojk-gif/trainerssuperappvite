import type {
  PdktIdentity,
  PdktScenario,
  ResolvedConsumerNameMentionPattern,
  WritingStyleMode,
} from "@trainers/types";
import {
  LICENSED_COMPANY_NAMES,
  SCENARIO_COMPANY_CATEGORY_MAP,
} from "./pdkt-company-names";

export interface PdktEmailPolicy {
  writingStyleMode: WritingStyleMode;
  mentionPattern: ResolvedConsumerNameMentionPattern;
  identity: PdktIdentity;
  scenario: PdktScenario;
  mode: "template" | "initial_email" | "reply";
}

export function buildPdktEmailGenerationPolicy(
  config: {
    identity: PdktIdentity;
    resolvedConsumerNameMentionPattern?: ResolvedConsumerNameMentionPattern;
    writingStyleMode?: WritingStyleMode;
  },
  scenario: PdktScenario,
  mode: "template" | "initial_email" | "reply" = "template",
): PdktEmailPolicy {
  return {
    writingStyleMode: config.writingStyleMode || "training",
    mentionPattern: config.resolvedConsumerNameMentionPattern || "none",
    identity: config.identity,
    scenario,
    mode,
  };
}

export function getCompanyNameInstruction(scenario?: PdktScenario): string {
  if (!scenario?.isLicensed) {
    return `1. PENAMAAN PERUSAHAAN: WAJIB mengarang NAMA entitas/perusahaan fiktif yang diadukan. JANGAN menggunakan kata "Bank", "Asuransi", atau "Sekuritas" karena entitas ilegal tidak berhak menggunakan nama tersebut. Contoh: "Pinjaman Kilat Nusantara", "Dana Cepat 88", "Investasi Cuan Jaya".`;
  }

  const category =
    SCENARIO_COMPANY_CATEGORY_MAP[scenario.title] ||
    scenario.category ||
    "Perbankan";
  const names = LICENSED_COMPANY_NAMES[category] || [];
  const namesList = names.map((n) => `- ${n}`).join("\n");

  return `1. PENAMAAN PERUSAHAAN: Gunakan SALAH SATU NAMA RESMI perusahaan berikut untuk LJK yang diadukan:\n${namesList}\nPilih salah satu nama dari daftar di atas. JANGAN mengarang nama perusahaan lain.`;
}

export function getConsumerNameMentionInstruction(
  pattern: ResolvedConsumerNameMentionPattern,
): string {
  switch (pattern) {
    case "upfront":
      return "ATURAN NAMA KONSUMEN: Anda boleh menyebut nama di awal email, termasuk pada salam pembuka atau paragraf pertama.";
    case "middle":
      return "ATURAN NAMA KONSUMEN: Jangan sebut nama Anda di awal email, salam pembuka, atau paragraf pertama. Nama hanya boleh muncul setelah paragraf pertama (di bagian tengah isi email).";
    case "late":
      return "ATURAN NAMA KONSUMEN: Jangan sebut nama Anda di awal email, salam pembuka, paragraf pertama, atau bagian tengah email. Jika nama muncul, letakkan menjelang akhir email atau dekat penutup.";
    case "none":
      return "ATURAN NAMA KONSUMEN: Jangan sebut nama Anda sama sekali di salam, body, maupun penutup email. Jangan pernah menyebut nama diri Anda atau memperkenalkan diri dengan nama. Gunakan kata ganti seperti 'saya' saja.";
  }
}

export function getRealisticWritingInstruction(mode: WritingStyleMode): string {
  if (mode !== "realistic") return "";

  return `
    GAYA PENULISAN REALISTIS (WAJIB):
    - Tulis sebagai konsumen biasa, bukan penulis profesional.
    - Boleh ada 1-4 typo wajar, bukan typo di setiap kalimat.
    - Boleh ada 0-2 kata/frasa CAPSLOCK pendek untuk menunjukkan penekanan emosi atau kebingungan.
    - Gunakan istilah awam atau keliru ringan, misalnya "ojk", "pinjol", "tagihan muncul", "nama saya kebawa".
    - Jangan menjelaskan bahwa ini simulasi, skenario, atau tugas.
    - Jangan menulis analisis atau instruksi untuk user.
  `;
}

export function buildPdktSystemInstruction(
  policy: PdktEmailPolicy,
  hasCustomImages = false,
): string {
  const { scenario, identity, mentionPattern, writingStyleMode, mode } = policy;

  const scenarioDescription = scenario
    ? `[${scenario.category}] ${scenario.title}: ${scenario.description}`
    : "Tidak ada skenario spesifik.";

  const templateGuidance = scenario?.sampleEmailTemplate?.body
    ? `TEMPLATE REFERENSI: Anda bisa merujuk pada gaya bahasa template berikut, namun buatlah versi yang lebih panjang dan bertele-tele:\n"${scenario.sampleEmailTemplate.body}"`
    : "";

  let imageInstruction = "";
  if (mode === "initial_email") {
    if (hasCustomImages) {
      imageInstruction =
        "User (Program) sudah melampirkan bukti gambar secara manual. Fokus saja pada cerita keluhannya.";
    } else {
      imageInstruction =
        "Buatlah 1 sampai 3 prompt visual (deskripsi gambar) untuk bukti lampiran.";
    }
  } else {
    imageInstruction = "JANGAN menyertakan prompt gambar.";
  }

  let nameInstruction = "";
  if (mode === "template") {
    nameInstruction = `
    ATURAN NAMA KONSUMEN (PLACEHOLDER):
    - ${getConsumerNameMentionInstruction(mentionPattern)}
    - ${
      mentionPattern === "none"
        ? "Jangan menyebut nama diri Anda atau menyertakan placeholder nama sama sekali."
        : "Gunakan placeholder {{consumer_name}} sebagai pengganti nama Anda, dan letakkan placeholder tersebut HANYA di bagian/posisi yang diperbolehkan berdasarkan ATURAN NAMA KONSUMEN di atas."
    }
    `;
  } else {
    nameInstruction = `
    PROFIL PENGIRIM:
    Nama Akun: ${identity.name}
    Email: ${identity.email}
    Nama Panggilan/Asli: ${identity.bodyName || identity.name}
    Kota Domisili: ${identity.city}

    PENTING: Gunakan profil di atas secara KONSISTEN.
    ${getConsumerNameMentionInstruction(mentionPattern)}
    ${mentionPattern === "none" ? "Jangan menyebut nama diri Anda sama sekali." : ""}
    `;
  }

  const outputFormatJson =
    mode === "initial_email"
      ? `{ 
      "subject": "Subjek singkat & samar (maks 6 kata), atau kosong.", 
      "body": "Paragraf 1...\\n\\nParagraf 2...\\n\\nParagraf 3...\\n\\nParagraf 4...\\n\\nParagraf 5...",
      "imagePrompts": ["Deskripsi gambar 1"]
    }`
      : `{ "subject": "Subjek singkat & samar (maks 6 kata), atau kosong.", "body": "Paragraf 1...\\n\\nParagraf 2...\\n\\nParagraf 3...\\n\\nParagraf 4...\\n\\nParagraf 5..." }`;

  return `
    Anda adalah Simulator Konsumen untuk pelatihan Agen Email Kontak OJK 157.
    ${mode === "template" ? "Tugas Anda adalah membuat SATU CONTOH TEMPLATE EMAIL pengaduan berdasarkan skenario yang diberikan." : ""}
    
    ${nameInstruction}
    
    MASALAH: ${scenarioDescription}
    ${templateGuidance}
    ${imageInstruction}
    ${getRealisticWritingInstruction(writingStyleMode)}
    
    ATURAN WAJIB:
    ${getCompanyNameInstruction(scenario)}
    2. GAYA PENULISAN: Buatlah isi email yang SANGAT PANJANG (500-1000 kata), BERTELE-TELE, dan PENUH DETAIL curhatan tidak relevan. Jangan gunakan bullet points. Gunakan 5-8 paragraf yang dipisahkan dengan baris kosong (\\n\\n). JANGAN menulis dalam 1 paragraf saja — setiap paragraf harus membahas aspek berbeda (kronologi awal, detail masalah, upaya/dampak, harapan penyelesaian, dll).
    3. FORMAT OUTPUT: HANYA JSON.
    ${outputFormatJson}
  `;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const CONSUMER_PLACEHOLDER_PATTERNS = [
  /\{\{\s*consumer_name\s*\}\}/gi,
  /\[(?:nama\s*)?(?:konsumen|nasabah|pengirim|pelapor|diri)(?:\s+[^\]]+)?\]/gi,
] as const;

function replaceConsumerPlaceholders(text: string, replacement: string): string {
  return CONSUMER_PLACEHOLDER_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, replacement),
    text,
  );
}

export function cleanNameOccurrences(
  text: string,
  name: string,
  bodyName?: string,
): string {
  if (!name) return text;
  let resolved = text;

  const escName = escapeRegExp(name);
  const escBodyName = bodyName ? escapeRegExp(bodyName) : "";

  const introPatterns = [
    new RegExp(`(?:perkenalkan,?\\s+)?(?:nama\\s+saya\\s+(?:adalah\\s+)?)${escName}`, "gi"),
    new RegExp(`(?:perkenalkan,?\\s+)?(?:saya\\s+(?:yang\\s+bernama\\s+)?)${escName}`, "gi"),
    new RegExp(`saya\\s+(?:yang\\s+bernama\\s+)?${escName}`, "gi"),
  ];

  if (escBodyName && escBodyName.length > 2) {
    introPatterns.push(
      new RegExp(`(?:perkenalkan,?\\s+)?(?:nama\\s+saya\\s+(?:adalah\\s+)?)${escBodyName}`, "gi"),
      new RegExp(`(?:perkenalkan,?\\s+)?(?:saya\\s+(?:yang\\s+bernama\\s+)?)${escBodyName}`, "gi"),
      new RegExp(`saya\\s+(?:yang\\s+bernama\\s+)?${escBodyName}`, "gi"),
    );
  }

  for (const pattern of introPatterns) {
    resolved = resolved.replace(pattern, "saya");
  }

  resolved = resolved.replace(new RegExp(`\\b${escName}\\b`, "gi"), "");
  if (escBodyName && escBodyName.length > 2) {
    resolved = resolved.replace(new RegExp(`\\b${escBodyName}\\b`, "gi"), "");
  }

  // Collapse multiple spaces
  resolved = resolved.replace(/ {2,}/g, " ");

  return resolved;
}

export function renderPdktIdentityByMentionPattern(
  body: string,
  subject: string,
  policy: PdktEmailPolicy,
): { body: string; subject: string } {
  const { identity, mentionPattern } = policy;

  let resolvedSubject = subject;
  if (mentionPattern === "upfront") {
    resolvedSubject = replaceConsumerPlaceholders(resolvedSubject, identity.name);
  } else {
    resolvedSubject = replaceConsumerPlaceholders(resolvedSubject, "");
    resolvedSubject = cleanNameOccurrences(
      resolvedSubject,
      identity.name,
      identity.bodyName,
    );
  }
  resolvedSubject = resolvedSubject.replace(/\s+/g, " ").trim();

  let resolvedBody = body;

  if (mentionPattern === "none") {
    resolvedBody = replaceConsumerPlaceholders(resolvedBody, "");
    resolvedBody = cleanNameOccurrences(
      resolvedBody,
      identity.name,
      identity.bodyName,
    );
  } else if (mentionPattern === "upfront") {
    const hasPlaceholder = CONSUMER_PLACEHOLDER_PATTERNS.some((p) =>
      p.test(resolvedBody),
    );
    if (hasPlaceholder) {
      resolvedBody = replaceConsumerPlaceholders(resolvedBody, identity.name);
    } else {
      resolvedBody = `Halo, saya ${identity.name}.\n\n${resolvedBody.trim()}`;
    }
  } else if (mentionPattern === "middle") {
    let paragraphs = resolvedBody
      .split("\n\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) paragraphs = [""];

    paragraphs[0] = replaceConsumerPlaceholders(paragraphs[0], "");
    paragraphs[0] = cleanNameOccurrences(
      paragraphs[0],
      identity.name,
      identity.bodyName,
    );

    let replacedPlaceholder = false;
    for (let i = 1; i < paragraphs.length; i++) {
      const hasPl = CONSUMER_PLACEHOLDER_PATTERNS.some((p) =>
        p.test(paragraphs[i]),
      );
      if (hasPl) {
        paragraphs[i] = replaceConsumerPlaceholders(paragraphs[i], identity.name);
        replacedPlaceholder = true;
      }
    }

    if (!replacedPlaceholder) {
      if (paragraphs.length >= 2) {
        paragraphs.splice(
          Math.floor(paragraphs.length / 2),
          0,
          `Oya, saya ${identity.name} mau menambahkan sedikit detail lagi.`,
        );
      } else {
        paragraphs.push(`(Saya ${identity.name})`);
      }
    }
    resolvedBody = paragraphs.join("\n\n");
  } else if (mentionPattern === "late") {
    let paragraphs = resolvedBody
      .split("\n\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) paragraphs = [""];

    for (let i = 0; i < paragraphs.length - 1; i++) {
      paragraphs[i] = replaceConsumerPlaceholders(paragraphs[i], "");
      paragraphs[i] = cleanNameOccurrences(
        paragraphs[i],
        identity.name,
        identity.bodyName,
      );
    }

    const lastIdx = paragraphs.length - 1;
    const hasPl = CONSUMER_PLACEHOLDER_PATTERNS.some((p) =>
      p.test(paragraphs[lastIdx]),
    );
    if (hasPl) {
      paragraphs[lastIdx] = replaceConsumerPlaceholders(
        paragraphs[lastIdx],
        identity.name,
      );
    } else {
      paragraphs.push(`Salam,\n${identity.name}`);
    }
    resolvedBody = paragraphs.join("\n\n");
  }

  resolvedBody = resolvedBody
    .replace(/[ \t]+/g, " ")
    .replace(/\s+,\s*/g, ", ")
    .replace(/\s+\.\s*/g, ". ")
    .replace(/,\s*,/g, ",")
    .replace(/\n\s+\n/g, "\n\n")
    .trim();

  return { subject: resolvedSubject, body: resolvedBody };
}

export function validatePdktEmailPolicyCompliance(
  email: { subject: string; body: string },
  policy: PdktEmailPolicy,
): string[] {
  const { identity, mentionPattern } = policy;
  const violations: string[] = [];

  const name = identity.name.toLowerCase();
  const bodyName = identity.bodyName ? identity.bodyName.toLowerCase() : "";

  const subjectLower = email.subject.toLowerCase();
  const bodyLower = email.body.toLowerCase();

  const forbiddenPhrases = [
    "simulasi ini",
    "sebagai ai",
    "as an ai",
    "skenario",
    "untuk user",
    "untuk pengguna",
    "berikut adalah email",
    "saya akan menulis",
  ];

  for (const phrase of forbiddenPhrases) {
    if (bodyLower.includes(phrase) || subjectLower.includes(phrase)) {
      violations.push(`Mengandung bahasa meta/AI: "${phrase}"`);
    }
  }

  const leftoverSubjectPl = subjectLower.match(/\{\{[^}]+\}\}|\[[^\]]+\]/g);
  const leftoverBodyPl = bodyLower.match(/\{\{[^}]+\}\}|\[[^\]]+\]/g);
  if (leftoverSubjectPl || leftoverBodyPl) {
    violations.push(
      "Masih mengandung placeholder unresolved (seperti {{...}} atau [...])",
    );
  }

  if (mentionPattern === "none") {
    if (
      subjectLower.includes(name) ||
      (bodyName && subjectLower.includes(bodyName))
    ) {
      violations.push("Nama konsumen muncul di subject meskipun pattern adalah 'none'");
    }
    if (
      bodyLower.includes(name) ||
      (bodyName && bodyLower.includes(bodyName))
    ) {
      violations.push("Nama konsumen muncul di body email meskipun pattern adalah 'none'");
    }
  } else if (mentionPattern === "middle") {
    const paragraphs = email.body
      .split("\n\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length > 0) {
      const firstParaLower = paragraphs[0].toLowerCase();
      if (
        firstParaLower.includes(name) ||
        (bodyName && firstParaLower.includes(bodyName))
      ) {
        violations.push(
          "Nama konsumen muncul di paragraf pertama/salam pembuka pada pattern 'middle'",
        );
      }
    }
    if (
      !bodyLower.includes(name) &&
      (!bodyName || !bodyLower.includes(bodyName))
    ) {
      violations.push(
        "Nama konsumen tidak disebutkan sama sekali pada pattern 'middle'",
      );
    }
  } else if (mentionPattern === "late") {
    const paragraphs = email.body
      .split("\n\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length > 1) {
      for (let i = 0; i < paragraphs.length - 1; i++) {
        const paraLower = paragraphs[i].toLowerCase();
        if (
          paraLower.includes(name) ||
          (bodyName && paraLower.includes(bodyName))
        ) {
          violations.push(
            `Nama konsumen muncul di paragraf awal/tengah (${i + 1}) pada pattern 'late'`,
          );
        }
      }
    }
    if (
      !bodyLower.includes(name) &&
      (!bodyName || !bodyLower.includes(bodyName))
    ) {
      violations.push(
        "Nama konsumen tidak disebutkan sama sekali pada pattern 'late'",
      );
    }
  }

  return violations;
}

export function buildPdktRetryHint(
  violations: string[],
  policy: PdktEmailPolicy,
): string {
  return `
    Ditemukan pelanggaran aturan pada email yang Anda buat sebelumnya:
    ${violations.map((v) => `- ${v}`).join("\n")}
    
    Mohon perbaiki email tersebut dengan mematuhi aturan berikut secara ketat:
    1. ${getConsumerNameMentionInstruction(policy.mentionPattern)}
    2. Jangan menulis bahasa meta seperti "sebagai AI", "simulasi ini", atau menjelaskan instruksi.
    3. Kembalikan HANYA format JSON valid tanpa penjelasan tambahan.
  `;
}
