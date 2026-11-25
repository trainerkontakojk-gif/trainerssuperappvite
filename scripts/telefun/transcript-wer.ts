/**
 * Offline accuracy comparison for the Telefun agent transcript.
 *
 * Compares two existing transcripts of the agent's speech against a manual
 * reference written by a person who listened to the recording:
 *   - live:  Gemini Live input transcription (`telefun_history.messages`,
 *            speaker "agent")
 *   - batch: post-call transcription of the agent-only recording
 *            (`telefun_history.voice_assessment.transcript`)
 *
 * No network, database, or provider call. Usage:
 *   pnpm exec tsx scripts/telefun/transcript-wer.ts --rows <rows.json> --refs <dir> [--init] [--json]
 *
 * rows.json is a JSON array of rows with `id`, `messages`, and either
 * `batch_transcript` or `voice_assessment.transcript`. Export it with the
 * query printed by `--sql`. Each reference is `<refs>/<id>.txt`; `--init`
 * creates empty placeholders for rows that have none.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseTelefunTranscript } from "../../packages/types/src/telefun-transcript.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FILLER_SOURCE = join(
  REPO_ROOT,
  "apps/api/src/lib/telefun-transcription.ts",
);

const EXPORT_SQL = `select json_agg(t order by t.created_at)
from (
  select id, created_at, telefun_model_id, messages,
         voice_assessment->>'transcript' as batch_transcript
  from telefun_history
  where id in ('<session-id-1>', '<session-id-2>')
) t;`;

type Source = "live" | "batch";
type Mode = "verbatim" | "content";

interface Alignment {
  refWords: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  errors: Array<{ ref: string | null; hyp: string | null }>;
}

interface SessionResult {
  id: string;
  refWords: number;
  fillers: Record<"ref" | Source, number>;
  scores: Record<Source, Record<Mode, Alignment> | null>;
}

/** Read the scoring filler patterns from source so this tool cannot drift from
 * production scoring. Importing the module would boot the API environment. */
async function loadFillerPatterns(): Promise<string[]> {
  const source = await readFile(FILLER_SOURCE, "utf8");
  const block = source.match(
    /TELEFUN_FILLER_PATTERNS\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  const patterns = block
    ? [...block[1]!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
        (m) => JSON.parse(`"${m[1]}"`) as string,
      )
    : [];
  if (patterns.length === 0)
    throw new Error(
      `TELEFUN_FILLER_PATTERNS not found in ${FILLER_SOURCE}; update loadFillerPatterns() to match its new shape.`,
    );
  return patterns;
}

function fillerRegex(patterns: string[]): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${patterns.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
}

/** Same audible-text and word rules as computeTelefunSpeechMetrics. */
function tokenize(text: string, mode: Mode, fillers: RegExp): string[] {
  let audible = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[[^\]]*\]/gu, " ")
    .replace(/<[^>]*>/gu, " ");
  if (mode === "content") audible = audible.replace(fillers, " ");
  return audible.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? [];
}

function countFillers(text: string, fillers: RegExp): number {
  return [...text.replace(/\[tidak jelas\]/giu, " ").matchAll(fillers)].length;
}

/** Word-level Levenshtein alignment with S/D/I backtrace. */
function align(ref: string[], hyp: string[]): Alignment {
  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const cost = new Uint32Array(rows * cols);
  for (let i = 0; i < rows; i++) cost[i * cols] = i;
  for (let j = 0; j < cols; j++) cost[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const same = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      cost[i * cols + j] = Math.min(
        cost[(i - 1) * cols + (j - 1)]! + same,
        cost[(i - 1) * cols + j]! + 1,
        cost[i * cols + (j - 1)]! + 1,
      );
    }
  }
  const result: Alignment = {
    refWords: ref.length,
    substitutions: 0,
    deletions: 0,
    insertions: 0,
    errors: [],
  };
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 || j > 0) {
    const here = cost[i * cols + j]!;
    if (
      i > 0 &&
      j > 0 &&
      here ===
        cost[(i - 1) * cols + (j - 1)]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
    ) {
      if (ref[i - 1] !== hyp[j - 1]) {
        result.substitutions++;
        result.errors.push({ ref: ref[i - 1]!, hyp: hyp[j - 1]! });
      }
      i--;
      j--;
    } else if (i > 0 && here === cost[(i - 1) * cols + j]! + 1) {
      result.deletions++;
      result.errors.push({ ref: ref[i - 1]!, hyp: null });
      i--;
    } else {
      result.insertions++;
      result.errors.push({ ref: null, hyp: hyp[j - 1]! });
      j--;
    }
  }
  result.errors.reverse();
  return result;
}

function wer(
  a: Pick<Alignment, "refWords" | "substitutions" | "deletions" | "insertions">,
): number {
  return a.refWords === 0
    ? Number.NaN
    : (a.substitutions + a.deletions + a.insertions) / a.refWords;
}

function liveAgentText(messages: unknown): string {
  return parseTelefunTranscript(messages)
    .filter((entry) => entry.speaker === "agent")
    .sort((a, b) => a.startMs - b.startMs)
    .map((entry) => entry.text)
    .join(" ");
}

function batchAgentText(row: Record<string, unknown>): string | null {
  if (typeof row.batch_transcript === "string") return row.batch_transcript;
  const assessment = row.voice_assessment;
  if (
    assessment &&
    typeof assessment === "object" &&
    !Array.isArray(assessment)
  ) {
    const transcript = (assessment as Record<string, unknown>).transcript;
    if (typeof transcript === "string") return transcript;
  }
  return null;
}

function parseArgs(argv: string[]) {
  const args = { rows: "", refs: "", init: false, json: false, sql: false };
  for (let k = 0; k < argv.length; k++) {
    const flag = argv[k];
    if (flag === "--rows") args.rows = argv[++k] ?? "";
    else if (flag === "--refs") args.refs = argv[++k] ?? "";
    else if (flag === "--init") args.init = true;
    else if (flag === "--json") args.json = true;
    else if (flag === "--sql") args.sql = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.sql && (!args.rows || !args.refs))
    throw new Error(
      "Usage: transcript-wer.ts --rows <rows.json> --refs <dir> [--init] [--json] | --sql",
    );
  return args;
}

async function loadRows(path: string): Promise<Array<Record<string, unknown>>> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  // The SQL editor may wrap json_agg output as [{ "json_agg": [...] }].
  const rows =
    Array.isArray(parsed) &&
    parsed.length === 1 &&
    parsed[0] &&
    typeof parsed[0] === "object" &&
    Array.isArray((parsed[0] as Record<string, unknown>).json_agg)
      ? ((parsed[0] as Record<string, unknown>).json_agg as unknown[])
      : parsed;
  if (!Array.isArray(rows))
    throw new Error(
      `${path} must contain a JSON array of telefun_history rows`,
    );
  return rows.map((row, index) => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as Record<string, unknown>).id !== "string"
    )
      throw new Error(`Row ${index} in ${path} has no string id`);
    return row as Record<string, unknown>;
  });
}

const pct = (value: number) =>
  Number.isNaN(value) ? "   n/a" : `${(value * 100).toFixed(1).padStart(5)}%`;

function pooled(results: SessionResult[], source: Source, mode: Mode) {
  const scored = results.flatMap((r) =>
    r.scores[source] ? [r.scores[source]![mode]] : [],
  );
  const total = scored.reduce(
    (sum, a) => ({
      refWords: sum.refWords + a.refWords,
      substitutions: sum.substitutions + a.substitutions,
      deletions: sum.deletions + a.deletions,
      insertions: sum.insertions + a.insertions,
    }),
    { refWords: 0, substitutions: 0, deletions: 0, insertions: 0 },
  );
  return { sessions: scored.length, ...total, wer: wer(total) };
}

function topErrors(results: SessionResult[], source: Source, limit = 12) {
  const counts = new Map<string, number>();
  for (const r of results) {
    for (const e of r.scores[source]?.verbatim.errors ?? []) {
      const key = `${e.ref ?? "∅"} → ${e.hyp ?? "∅"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.sql) {
    console.log(EXPORT_SQL);
    return;
  }
  const fillers = fillerRegex(await loadFillerPatterns());
  const rows = await loadRows(args.rows);

  if (args.init) {
    await mkdir(args.refs, { recursive: true });
    let created = 0;
    for (const row of rows) {
      const path = join(args.refs, `${row.id as string}.txt`);
      if (!existsSync(path)) {
        await writeFile(path, "");
        created++;
      }
    }
    console.log(`Created ${created} empty reference file(s) in ${args.refs}`);
    return;
  }

  const results: SessionResult[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const id = row.id as string;
    const refPath = join(args.refs, `${id}.txt`);
    const refText = existsSync(refPath)
      ? (await readFile(refPath, "utf8")).trim()
      : "";
    if (!refText) {
      skipped.push(`${id}: no reference text`);
      continue;
    }
    const texts: Record<Source, string | null> = {
      live: liveAgentText(row.messages) || null,
      batch: batchAgentText(row),
    };
    const score = (hyp: string | null) =>
      hyp === null
        ? null
        : {
            verbatim: align(
              tokenize(refText, "verbatim", fillers),
              tokenize(hyp, "verbatim", fillers),
            ),
            content: align(
              tokenize(refText, "content", fillers),
              tokenize(hyp, "content", fillers),
            ),
          };
    results.push({
      id,
      refWords: tokenize(refText, "verbatim", fillers).length,
      fillers: {
        ref: countFillers(refText, fillers),
        live:
          texts.live === null ? Number.NaN : countFillers(texts.live, fillers),
        batch:
          texts.batch === null
            ? Number.NaN
            : countFillers(texts.batch, fillers),
      },
      scores: { live: score(texts.live), batch: score(texts.batch) },
    });
  }

  const summary = {
    live: {
      verbatim: pooled(results, "live", "verbatim"),
      content: pooled(results, "live", "content"),
    },
    batch: {
      verbatim: pooled(results, "batch", "verbatim"),
      content: pooled(results, "batch", "content"),
    },
  };

  if (args.json) {
    console.log(
      JSON.stringify({ summary, sessions: results, skipped }, null, 2),
    );
    return;
  }

  console.log(
    "WER per session (lower is better). verbatim keeps fillers; content drops them.\n",
  );
  console.log(
    "session                               refW  live-verb  batch-verb  live-cont  batch-cont  fillers ref/live/batch",
  );
  for (const r of results) {
    const cell = (s: Source, m: Mode) =>
      pct(r.scores[s] ? wer(r.scores[s]![m]) : Number.NaN);
    const f = (n: number) => (Number.isNaN(n) ? "-" : String(n));
    console.log(
      `${r.id.padEnd(36)} ${String(r.refWords).padStart(5)}     ${cell("live", "verbatim")}      ${cell("batch", "verbatim")}     ${cell("live", "content")}      ${cell("batch", "content")}   ${f(r.fillers.ref)}/${f(r.fillers.live)}/${f(r.fillers.batch)}`,
    );
  }
  console.log("\nPooled WER (total errors / total reference words):");
  for (const source of ["live", "batch"] as const) {
    for (const mode of ["verbatim", "content"] as const) {
      const p = summary[source][mode];
      console.log(
        `  ${source.padEnd(5)} ${mode.padEnd(8)} ${pct(p.wer)}  (sessions ${p.sessions}, refW ${p.refWords}, S ${p.substitutions}, D ${p.deletions}, I ${p.insertions})`,
      );
    }
  }
  for (const source of ["live", "batch"] as const) {
    console.log(
      `\nMost frequent ${source} errors (reference → hypothesis, ∅ = missing):`,
    );
    for (const [pair, n] of topErrors(results, source))
      console.log(`  ${String(n).padStart(3)}× ${pair}`);
  }
  if (skipped.length) console.log(`\nSkipped:\n  ${skipped.join("\n  ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
