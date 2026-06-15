export type ForecastInsightSectionKind =
  | "summary"
  | "parameters"
  | "actions"
  | "disclaimer"
  | "generic";

export interface ForecastInsightListItem {
  text: string;
  changeValue: number | null;
  tone: "risk" | "positive" | "neutral";
}

export interface ForecastInsightSubsection {
  title: string;
  items: ForecastInsightListItem[];
}

export interface ForecastInsightActionItem {
  index: number;
  title: string;
  body: string;
}

export interface ForecastInsightSection {
  kind: ForecastInsightSectionKind;
  title: string;
  paragraphs: string[];
  subsections: ForecastInsightSubsection[];
  actions: ForecastInsightActionItem[];
}

export interface ParsedForecastInsight {
  intro: string | null;
  sections: ForecastInsightSection[];
}

function stripMarkdownEmphasis(value: string): string {
  return value.replace(/\*\*/g, "").replace(/\*/g, "").trim();
}

function extractChangeValue(text: string): number | null {
  const match = text.match(
    /\(([+-]?\d+(?:[.,]\d+)?)(?:\s+(?:temuan|defects?|poin))?\)/i,
  );
  if (!match) return null;
  const parsed = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyListTone(
  subsectionTitle: string,
  changeValue: number | null,
): ForecastInsightListItem["tone"] {
  if (changeValue !== null) {
    if (changeValue < 0) return "positive";
    if (changeValue > 0) return "risk";
    return "neutral";
  }

  const normalized = subsectionTitle.toLowerCase();
  if (
    normalized.includes("berisiko") ||
    normalized.includes("risiko") ||
    (normalized.includes("menurun") && normalized.includes("kualitas"))
  ) {
    return "risk";
  }
  if (
    normalized.includes("meningkat") ||
    normalized.includes("membaik") ||
    normalized.includes("perbaikan")
  ) {
    return "positive";
  }
  return "neutral";
}

function classifySectionKind(title: string): ForecastInsightSectionKind {
  const normalized = title.toLowerCase();
  if (normalized.includes("ringkasan") || normalized.includes("eksekutif")) {
    return "summary";
  }
  if (normalized.includes("parameter") || normalized.includes("analisis")) {
    return "parameters";
  }
  if (
    normalized.includes("tindakan") ||
    normalized.includes("rekomendasi") ||
    normalized.includes("langkah")
  ) {
    return "actions";
  }
  if (normalized.includes("disclaimer") || normalized.includes("catatan")) {
    return "disclaimer";
  }
  return "generic";
}

function parseListItems(block: string): ForecastInsightListItem[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => {
      const text = stripMarkdownEmphasis(
        line.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""),
      );
      const changeValue = extractChangeValue(text);
      return {
        text,
        changeValue,
        tone: "neutral" as const,
      };
    });
}

function parseNumberedActions(block: string): ForecastInsightActionItem[] {
  const matches = [...block.matchAll(/^\d+\.\s+\*\*([^*]+)\*\*:?\s*(.+)$/gm)];
  if (matches.length > 0) {
    return matches.map((match, index) => ({
      index: index + 1,
      title: match[1].replace(/:$/, "").trim(),
      body: stripMarkdownEmphasis(match[2].trim()),
    }));
  }

  const bulletMatches = [
    ...block.matchAll(/^[-*•]\s+\*\*([^*]+)\*\*:?\s*(.+)$/gm),
  ];
  if (bulletMatches.length > 0) {
    return bulletMatches.map((match, index) => ({
      index: index + 1,
      title: match[1].replace(/:$/, "").trim(),
      body: stripMarkdownEmphasis(match[2].trim()),
    }));
  }

  const numberedLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line));

  if (numberedLines.length > 0) {
    return numberedLines.map((line, index) => {
      const raw = stripMarkdownEmphasis(line.replace(/^\d+\.\s+/, ""));
      const [title, ...rest] = raw.split(":");
      return {
        index: index + 1,
        title: title.trim(),
        body: rest.join(":").trim() || title.trim(),
      };
    });
  }

  const bulletLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line));

  if (bulletLines.length > 0) {
    return bulletLines.map((line, index) => {
      const raw = stripMarkdownEmphasis(line.replace(/^[-*•]\s+/, ""));
      const [title, ...rest] = raw.split(":");
      return {
        index: index + 1,
        title: title.trim(),
        body: rest.join(":").trim() || title.trim(),
      };
    });
  }

  return [];
}

function parseSubsections(block: string): ForecastInsightSubsection[] {
  const parts = block.split(/\*\*([^*]+)\*\*:?\s*/).filter(Boolean);
  if (parts.length < 2) {
    const items = parseListItems(block).map((item) => ({
      ...item,
      tone: classifyListTone("", item.changeValue),
    }));
    return items.length > 0 ? [{ title: "Detail", items }] : [];
  }

  const subsections: ForecastInsightSubsection[] = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    const title = stripMarkdownEmphasis(parts[i]);
    const body = parts[i + 1] ?? "";
    const items = parseListItems(body).map((item) => ({
      ...item,
      tone: classifyListTone(title, item.changeValue),
    }));
    if (items.length > 0) {
      subsections.push({ title, items });
    }
  }
  return subsections;
}

function parseParagraphs(block: string, allowLists: boolean = false): string[] {
  return block
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(
      (chunk) =>
        chunk.length > 0 &&
        (allowLists || (!/^[-*•]\s+/.test(chunk) && !/^\d+\.\s+/.test(chunk))),
    )
    .map(stripMarkdownEmphasis);
}

function parseSectionBlock(block: string): ForecastInsightSection {
  const lines = block.trim().split("\n");
  const title = stripMarkdownEmphasis(lines[0] ?? "Insight");
  const body = lines.slice(1).join("\n").trim();
  const kind = classifySectionKind(title);

  let paragraphs: string[] = [];
  let subsections: ForecastInsightSubsection[] = [];
  let actions: ForecastInsightActionItem[] = [];

  if (kind === "disclaimer") {
    paragraphs = body
      .split("\n")
      .map((line) => stripMarkdownEmphasis(line.trim()))
      .filter(Boolean);
  } else if (kind === "actions") {
    actions = parseNumberedActions(body);
    if (actions.length === 0 && body.length > 0) {
      paragraphs = parseParagraphs(body, true);
    }
  } else if (kind === "parameters") {
    subsections = parseSubsections(body);
    if (subsections.length === 0 && body.length > 0) {
      paragraphs = parseParagraphs(body, true);
    }
  } else {
    paragraphs = parseParagraphs(body, false);
  }

  return {
    kind,
    title,
    paragraphs,
    subsections,
    actions,
  };
}

export function parseForecastInsightText(text: string): ParsedForecastInsight {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { intro: null, sections: [] };
  }

  if (!/^###\s+/m.test(normalized)) {
    return {
      intro: null,
      sections: [
        {
          kind: "generic",
          title: "Ringkasan",
          paragraphs: [stripMarkdownEmphasis(normalized)],
          subsections: [],
          actions: [],
        },
      ],
    };
  }

  const [preamble, ...sectionBlocks] = normalized.split(/^###\s+/m);
  const intro = preamble.trim() ? stripMarkdownEmphasis(preamble.trim()) : null;

  return {
    intro,
    sections: sectionBlocks
      .map((block) => parseSectionBlock(block))
      .filter(
        (section) =>
          section.paragraphs.length > 0 ||
          section.subsections.length > 0 ||
          section.actions.length > 0,
      ),
  };
}
