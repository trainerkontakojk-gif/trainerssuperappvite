/**
 * root-cause-phrase-extract.mjs
 * ==============================
 * Pure-text helper for normalizing Indonesian QA text, extracting n-grams,
 * and ranking the most frequent meaningful phrases from fallback rows.
 *
 * Keep synchronized with:
 *   apps/api/src/services/sidak/agent-root-causes.ts  (normalizeText)
 *
 * Usage:
 *   import { extractTopPhrases } from "./root-cause-phrase-extract.mjs";
 */

// ─── Normalization ──────────────────────────────────────────────────────────

/** Indonesian stopwords — only stripped when they appear as standalone unigrams. */
const STOPWORDS = new Set([
  "yang", "dan", "atau", "pada", "untuk", "dengan", "tidak", "ini", "itu",
  "di", "ke", "dari", "oleh", "sebagai", "dalam", "secara", "akan", "bisa",
  "dapat", "sudah", "telah", "belum", "ada", "lebih", "sangat", "juga",
  "saat", "ketika", "setelah", "sebelum", "karena", "sehingga", "maka",
  "hal", "tersebut", "merupakan", "bahwa", "ataupun", "maupun",
  "saya", "kami", "kita", "anda", "ia", "dia", "mereka",
  "1", "2", "3", "dan", "tdk",
]);

/** Known abbreviations used in SIDAK QA text — map to full form for matching. */
const ABBREVIATIONS = {
  sj: "standar jawaban",
  "std": "standar",
  "std jawaban": "standar jawaban",
  verif: "verifikasi",
  pujk: "pujk",
  puuk: "pujk",
  slik: "slik",
  bko: "bko",
  no: "nomor",
  "no.": "nomor",
  telp: "telepon",
  hp: "telepon",
  tlp: "telepon",
  tgl: "tanggal",
  yg: "yang",
  utk: "untuk",
  sbb: "sebagai berikut",
  "s/d": "sampai dengan",
  sd: "sampai dengan",
  info: "informasi",
};

/**
 * Normalize Indonesian QA text for matching:
 * - lowercase
 * - Unicode-aware punctuation removal
 * - collapse whitespace
 * - trim
 * - expand known abbreviations
 */
export function normalizeText(raw) {
  if (!raw) return "";
  let text = String(raw)
    .toLowerCase()
    .normalize("NFKD");

  // Expand abbreviations (word-boundary aware)
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    // Use word boundary to avoid partial matches
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`\\b${escaped}\\b`, "g"),
      full,
    );
  }

  // Remove punctuation (keep letters, numbers, spaces)
  text = text.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Normalize and also expand abbreviations for display purposes.
 * Slightly less aggressive than normalizeText (preserves more original form).
 */
export function normalizeDisplayText(raw) {
  if (!raw) return "";
  let text = String(raw)
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim();
  // Only expand common abbreviations
  const displayAbbrevs = {
    sj: "standar jawaban",
    verif: "verifikasi",
    tdk: "tidak",
    yg: "yang",
  };
  for (const [abbr, full] of Object.entries(displayAbbrevs)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), full);
  }
  return text;
}

// ─── N-gram Extraction ──────────────────────────────────────────────────────

/**
 * Extract n-grams from normalized text.
 * Skips n-grams that are only stopwords.
 */
export function extractNGrams(normalizedText, n, options = {}) {
  const { minWordLength = 3, skipStopwordOnly = true } = options;
  const words = normalizedText.split(/\s+/).filter(Boolean);
  const ngrams = [];

  for (let i = 0; i <= words.length - n; i++) {
    const slice = words.slice(i, i + n);
    // Skip if any word is too short (ignore for unigrams)
    if (n > 1 && slice.some((w) => w.length < minWordLength)) continue;
    // Skip if all words are stopwords
    if (skipStopwordOnly && slice.every((w) => STOPWORDS.has(w))) continue;
    const phrase = slice.join(" ");
    if (phrase.length >= 3) {
      ngrams.push(phrase);
    }
  }

  return ngrams;
}

// ─── Phrase Ranking ─────────────────────────────────────────────────────────

/**
 * From an array of fallback rows, extract and rank the top meaningful phrases.
 *
 * @param {Array<{id:string, ketidaksesuaian:string|null, sebaiknya:string|null, indicatorName:string|null}>} fallbackRows
 * @param {object} options
 * @param {number} [options.maxPhrases=20]  - Number of top phrases to return
 * @param {number} [options.minCount=2]     - Minimum occurrence count to include
 * @param {number} [options.maxNgram=3]     - Maximum n-gram size (1=unigram, 2=bigram, 3=trigram)
 * @returns {Array<{phrase:string, count:number, normalizedCount:number, sampleIds:string[]}>}
 */
export function extractTopPhrases(fallbackRows, options = {}) {
  const {
    maxPhrases = 20,
    minCount = 2,
    maxNgram = 3,
  } = options;

  // Build combined text per row
  const rowTexts = fallbackRows.map((row) => {
    const combined = [
      row.ketidaksesuaian,
      row.sebaiknya,
      row.indicatorName,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id: row.id,
      text: normalizeText(combined),
    };
  });

  // Count n-grams across all rows
  const phraseCounts = new Map(); // phrase -> { count, sampleIds: Set }
  const phraseSource = new Map(); // phrase -> normalized form (display)

  for (const { id, text } of rowTexts) {
    const seen = new Set(); // avoid double-counting same phrase per row

    for (let n = 1; n <= maxNgram; n++) {
      const ngrams = extractNGrams(text, n);
      for (const phrase of ngrams) {
        if (seen.has(phrase)) continue;
        seen.add(phrase);

        if (!phraseCounts.has(phrase)) {
          phraseCounts.set(phrase, { count: 0, sampleIds: [] });
        }
        const entry = phraseCounts.get(phrase);
        entry.count += 1;
        if (entry.sampleIds.length < 5) {
          entry.sampleIds.push(id);
        }
      }
    }
  }

  // Sort by frequency (desc), then by length (desc — favor more specific)
  const sorted = [...phraseCounts.entries()]
    .map(([phrase, data]) => ({
      phrase,
      count: data.count,
      sampleIds: data.sampleIds,
    }))
    .filter((p) => p.count >= minCount)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.phrase.split(/\s+/).length - a.phrase.split(/\s+/).length;
    });

  return sorted.slice(0, maxPhrases);
}

/**
 * Group top phrases by suggested cluster mapping.
 * This is a heuristic — does NOT match the actual runtime priority logic,
 * but attempts to label candidate clusters for human review.
 *
 * @param {Array<{phrase:string, count:number, sampleIds:string[]}>} topPhrases
 * @param {Array<{clusterId:string, keywords:string[]}>} registry
 * @returns {Array<{phrase:string, count:number, suggestedClusterId:string|null}>}
 */
export function suggestClusterForPhrases(topPhrases, registry) {
  return topPhrases.map((p) => {
    const normalized = normalizeText(p.phrase);
    for (const entry of registry) {
      const matched = entry.keywords.some((kw) =>
        normalized.includes(normalizeText(kw)),
      );
      if (matched) {
        return { ...p, suggestedClusterId: entry.clusterId };
      }
    }
    return { ...p, suggestedClusterId: null };
  });
}
