# Plan 018: Unify spreadsheet handling onto ExcelJS and remove the frozen `xlsx` package

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a8d1f31..HEAD -- apps/web/package.json apps/web/src/lib/excel-utils.ts apps/web/src/routes/sidak/hooks/useTemuanImport.ts apps/web/src/routes/sidak/reports-data.tsx apps/web/src/routes/profiler/utils/profilerExportUtils.ts apps/web/src/routes/profiler/import.tsx`
> If any of those files changed since the plan was written, compare the
> "Current state" excerpts against live code before proceeding; on mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt / migration
- **Planned at**: commit `a8d1f31`, 2026-08-23

### Execution notes (2026-08-23)

- Executed on branch `advisor/018-unify-spreadsheet-lib`.
- Characterization tests were written together with the migration rather
  than strictly before it; they caught one real behavior gap: xlsx's
  `sheet_to_json` silently DROPPED fully-blank rows while the ExcelJS grid
  keeps them — an explicit skip was added to `parseExcel` to preserve the
  old contract (`spreadsheet-unification.test.ts`, case 3).
- CSV import for profiler (`.csv`) is preserved via a small in-house
  RFC-4180 parser (`parseCsv`) instead of SheetJS.
- Lint warnings went DOWN with this change (161 → 159), 0 errors.
- Peer warning `@tailwindcss/vite@4.0.7 wants vite ^5||^6` is PRE-EXISTING
  (installed vite 8.1.0); unrelated to this plan.

## Why this matters

The web app ships TWO spreadsheet libraries doing the same job: `xlsx`
(SheetJS, installed from a CDN tarball because the npm copy is frozen at
0.20.x) and `exceljs`. Six call sites use `xlsx`, two use `exceljs` — and
`apps/web/src/routes/sidak/hooks/useTemuanImport.ts` uses BOTH in one file
(exceljs writes the template, xlsx reads it back). Every duplicate copy ships
to the browser bundle. The team already converged on ExcelJS for anything
needing data-validation/styling; ExcelJS is actively maintained while npm's
SheetJS is not. This plan makes ExcelJS the single spreadsheet library and
removes `xlsx` entirely.

**Accepted user-visible tradeoff (approved by maintainer)**: ExcelJS cannot
read legacy `.xls` (BIFF) files, only `.xlsx`. File-input `accept=` attributes
are narrowed accordingly and a friendly error is shown when a user still
uploads `.xls`.

## Current state

- `apps/web/package.json` — declares both libs:
  ```json
  "exceljs": "^4.4.0",
  "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
  ```

### Readers (must migrate off `xlsx`)

- `apps/web/src/lib/excel-utils.ts:96-140` — `parseExcel(file, indicators,
  serviceType)`: FileReader → `XLSX.read(data, {type:"array"})` → picks sheet
  `"Input Temuan"` (fallback first sheet) → `XLSX.utils.sheet_to_json(ws,
  {defval:""})` → maps header names (`"No Tiket"`, `"Indikator"`,
  `"Nilai (0-3)"`, `"Ketidaksesuaian"`, `"Sebaiknya"` OR snake_case keys) to
  `ParsedRow`, validates indicator against `formatQAIndicatorName(i)
  .toLowerCase()` map, sets `error` per bad row.
- `apps/web/src/routes/sidak/hooks/useTemuanImport.ts:163-205` —
  `handleFileUpload`: same sheet-picking logic but POSITIONAL parsing:
  `XLSX.utils.sheet_to_json(ws, {header:1, defval:""})` → `row[0]`=no_tiket,
  `row[1]`=paramName, `row[2]`=nilai, `row[3]`=ketidaksesuaian, `row[4]`
  =sebaiknya; skips fully-empty rows starting at index 1.
- `apps/web/src/routes/profiler/import.tsx:297-300` — `processFile`:
  `XLSX.read(buffer, {type:"array", cellDates:true})`, first sheet,
  `sheet_to_json(ws, {defval:""})`, header-mapped through local
  `HEADER_MAP` built from its own `TEMPLATE_COLUMNS`.
- Input constraints today: `SidakInputImportPanel.tsx:156`
  `accept=".xlsx,.xls"`; `routes/profiler/import.tsx:530`
  `accept=".xlsx,.xls,.csv"`.

### Writers (flat exports)

- `apps/web/src/routes/sidak/reports-data.tsx:79-98` — `exportExcel`:
  `json_to_sheet(rows)` → `book_new` → `book_append_sheet(wb, ws, "Data
  Laporan")` → `XLSX.writeFile(wb, "laporan-data-${year}.xlsx")`.
- `apps/web/src/routes/profiler/utils/profilerExportUtils.ts:85-99` —
  `downloadExcel`: same pattern, sheet `"Peserta"`,
  `${selectedBatch}_peserta.xlsx`.
- `apps/web/src/routes/profiler/utils/profilerExportUtils.ts:101-118` —
  `downloadCSV`: uses `XLSX.utils.sheet_to_csv(ws)` then Blob-download. The
  only CSV-specific use of xlsx.

### ExcelJS exemplars already in the repo (match these patterns)

- Dynamic import form: `useTemuanImport.ts:84` —
  `const ExcelJS = (await import("exceljs")).default;`
- Template writing with data-validation + hidden ref sheet +
  `wb.xlsx.writeBuffer()`: `lib/excel-utils.ts:11-82` (`generateTemplate`)
  and `useTemuanImport.ts:~60-158` (template builder + Blob/anchor download
  at lines ~145-157).

### Conventions to honor

- Backend-first and Hono-RPC rules in `AGENTS.md` do not apply here (pure
  client-side file IO), but DO follow: dynamic `await import(...)` for heavy
  libs (both spreadsheet libs are dynamically imported everywhere — never add
  a static top-level import), human-friendly Indonesian error strings in UI,
  and TDD per `docs/AGENT_WORKFLOW.md` (this plan includes the tests).

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Install   | `pnpm install`                            | exit 0              |
| Typecheck | `pnpm turbo run typecheck --filter=@trainers/web` | exit 0      |
| Tests     | `pnpm turbo run test --filter=@trainers/web` | exit 0, all pass |
| Lint      | `pnpm turbo run lint --filter=@trainers/web` | exit 0          |
| Dep proof | `pnpm why xlsx`                           | "Not found" after removal |

## Scope

**In scope** (the only files you should modify/create):
- `apps/web/package.json` (remove `xlsx`)
- `pnpm-lock.yaml` (regenerated by `pnpm install`, not hand-edited)
- `apps/web/src/lib/excel-utils.ts` (add shared helpers)
- `apps/web/src/routes/sidak/hooks/useTemuanImport.ts`
- `apps/web/src/routes/sidak/reports-data.tsx`
- `apps/web/src/routes/profiler/utils/profilerExportUtils.ts`
- `apps/web/src/routes/profiler/import.tsx`
- `apps/web/src/components/sidak/SidakInputImportPanel.tsx` (only the
  `accept=` attribute)
- `apps/web/src/__tests__/spreadsheet-unification.test.ts` (create)

**Out of scope** (do NOT touch):
- `pptxgenjs`, `image-size`, or anything under `routes/profiler/utils/*Pdf* /
  *Pptx*` — that is plan 019's problem.
- Any backend code, any Supabase schema, any UI layout/redesign.
- Do not upgrade or downgrade `exceljs`; stay on `^4.4.0`.
- Do not change the generated template's column layout, sheet names
  (`Input Temuan`, `_indikator`, `Peserta`, `Data Laporan`) or file naming —
  users have downloaded templates and re-import them.

## Git workflow

- Branch: `advisor/018-unify-spreadsheet-lib`
- Conventional commits, e.g. `refactor(web): read temuan workbooks via exceljs, drop xlsx`
- Commit per step. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add shared ExcelJS readers/writers in `lib/excel-utils.ts`

Create three small exported helpers (dynamic-import exceljs inside each):

```ts
// Reads any .xlsx buffer into raw structure. ExcelJS row/cell indexing is
// 1-based; cell values may be primitives, Date, or objects like
// {richText:[...]}/{formula,result} — normalize via cellText().
export async function readWorkbookRaw(
  data: ArrayBuffer,
): Promise<{ names: string[]; sheets: Record<string, string[][]>> }>
```

- Iterate every worksheet with `ws.eachRow`; for each row collect
  `cellText(cell)` (below) for columns 1..`ws.columnCount`.
- `cellText(v: CellValue): string` — number→`String(v)`; Date→ISO date
  `YYYY-MM-DD`; object with `.text`/`.richText`/`.result`→coerce to string;
  null/undefined→`""`. Trim nothing here (callers decide).

```ts
export async function writeFlatExcel(
  sheetName: string,
  rows: Record<string, unknown>[],
  fileName: string,
): Promise<void>
```

- Build workbook, `addWorksheet(sheetName)`, header row from first object's
  keys (preserve caller's key order via `Object.keys(rows[0])`), then
  `addRow(Object.values(r))` per row; download via the existing Blob +
  `URL.createObjectURL` + anchor-click + `URL.revokeObjectURL` pattern from
  `useTemuanImport.ts:145-157`.

```ts
export function toCsv(rows: Record<string, unknown>[]): string
```

- Proper CSV: quote fields containing `,`/`"`/newline; escape `"` as `""`;
  join `\r\n`. (Replaces `XLSX.utils.sheet_to_csv`.)

**Verify**: `pnpm turbo run typecheck --filter=@trainers/web` → exit 0 (new
helpers unused yet must still compile).

### Step 2: Characterization tests FIRST for the SIDAK temuan parser

Behavior-change lane ⇒ tests before switching callers. Create
`apps/web/src/__tests__/spreadsheet-unification.test.ts` modeled structurally
on `apps/web/src/__tests__/exportAgentReport.test.ts`. In-test fixture:
BUILD a workbook with ExcelJS itself (same columns as `TEMPLATE_COLUMNS` in
`excel-utils.ts`: `No Tiket`, `Indikator`, `Nilai (0-3)`, `Ketidaksesuaian`,
`Sebaiknya`; sheet name `Input Temuan`) → `writeBuffer()` → feed to the
function under test. Cases:

1. Happy path: valid row maps to `ParsedRow` with correct fields and matched
   indicator (use a real-looking `QAIndicator` fixture; assert
   `indicator_id` set).
2. Example row `CONTOH-001` with an unknown indicator yields `error` field,
   not a throw.
3. Fully empty row is skipped (assert `result.length`).
4. Nilai arrives as string `"2"` from a text cell → coerced numeric `2`.
5. Sheet named other than `Input Temuan` still parses (first-sheet fallback).

Run them against the CURRENT xlsx-based implementation to prove they pass
pre-refactor: `pnpm turbo run test --filter=@trainers/web -- \
spreadsheet-unification` → 5 passing. (If your turbo invocation needs a
different passthrough syntax, use `pnpm --filter @trainers/web test <args>` —
check `apps/web/package.json` scripts first.)

**Verify**: the 5 new tests pass BEFORE any caller is migrated.

### Step 3: Migrate the four reader sites to `readWorkbookRaw`

For each file below, delete the `await import("xlsx")` block and rebuild rows
from the helper output. Port each caller's OWN mapping/validation code
VERBATIM — only the workbook-reading layer changes:

- `lib/excel-utils.ts` `parseExcel` — first data row = header names; map
  header→column index (trim, exact match against known bilingual headers);
  fall back to positional order 0-4 when a header is unrecognized. Keep the
  existing indicator map, `ParsedRow` shape, and error semantics identical
  (tests from Step 2 are the contract).
- `useTemuanImport.ts` `handleFileUpload` — positional access
  `row[0]..row[4]` on every non-empty data row; keep its paramMap, empty-row
  skip, and `ImportRowType` construction untouched.
- `profiler/import.tsx` `processFile` — keep `HEADER_MAP` logic; feed it
  header→value pairs rebuilt from `readWorkbookRaw`'s header row + data rows.
  Its old `cellDates:true` becomes unnecessary: `cellText` renders Dates as
  ISO strings. If any downstream field NEEDS a real Date object (not a
  string), STOP and report instead of improvising.

Also in `SidakInputImportPanel.tsx:156`: change `accept=".xlsx,.xls"` →
`accept=".xlsx"`; in `routes/profiler/import.tsx:530`:
`accept=".xlsx,.xls,.csv"` → `accept=".xlsx,.csv"`. Where upload handlers
receive a file, add: if `file.name.toLowerCase().endsWith(".xls")` set the
existing error state to `"Format .xls tidak didukung. Simpan ulang sebagai
.xlsx lalu impor kembali."` and return early.

**Verify**: Step 2 tests still pass; `grep -rn 'import("xlsx")' apps/web/src |
wc -l` → `0`.

### Step 4: Migrate the three writer sites

- `reports-data.tsx` `exportExcel` → `writeFlatExcel("Data Laporan", rows,
  \`laporan-data-${year}.xlsx\`)` with the SAME row objects it builds today.
- `profilerExportUtils.ts` `downloadExcel` → `writeFlatExcel("Peserta",
  buildRows(peserta), \`${selectedBatch}_peserta.xlsx\`)`.
- `profilerExportUtils.ts` `downloadCSV` → `toCsv(buildRows(peserta))` →
  existing Blob download code (keep `setGenerating` finally-blocks).

Add 2 more tests to `spreadsheet-unification.test.ts`: (a) `toCsv` quotes a
field containing comma + embedded quotes correctly; (b) `writeFlatExcel`
produces a buffer whose re-read (via `readWorkbookRaw`) round-trips header +
one row.

**Verify**: `grep -rn '"xlsx"' apps/web/src | wc -l` → `0`.

### Step 5: Remove the dependency

Delete the `xlsx` line from `apps/web/package.json`. Run `pnpm install`.

**Verify**:
- `pnpm why xlsx` → reports not found / no entries.
- `pnpm turbo run typecheck --filter=@trainers/web` → exit 0.
- `pnpm turbo run lint --filter=@trainers/web` → exit 0.
- Full `pnpm turbo run test --filter=@trainers/web` → exit 0.
- `git status` → only in-scope files modified.

## Test plan

- New file `apps/web/src/__tests__/spreadsheet-unification.test.ts` with the
  7 cases from Steps 2/4; structural pattern follows
  `apps/web/src/__tests__/exportAgentReport.test.ts` (same describe/expect
  style, fixtures built in-file).
- Verification: `pnpm turbo run test --filter=@trainers/web` → all pass
  including the 7 new tests.

## Done criteria

ALL must hold:

- [ ] `grep -rn 'from "xlsx"\|import("xlsx")\|"xlsx"' apps/web/src apps/web/package.json` → zero matches
- [ ] `pnpm why xlsx` → no entries
- [ ] `pnpm turbo run typecheck --filter=@trainers/web` exits 0
- [ ] `pnpm turbo run lint --filter=@trainers/web` exits 0
- [ ] `pnpm turbo run test --filter=@trainers/web` exits 0, incl. 7 new tests
- [ ] `accept=` attributes narrowed and `.xls` guard present
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Live code at the cited lines doesn't match "Current state" excerpts.
- Any of the 5 Step-2 characterization tests FAIL against the CURRENT xlsx
  implementation (the pre/post contract is broken — needs human triage).
- A caller turns out to need real `Date` objects, formulas, rich text, or
  `.xls` (BIFF) content that `cellText` cannot represent faithfully.
- Removing `xlsx` breaks an import you can trace to an out-of-scope file
  (e.g. something in `apps/api` or `scripts/` importing it transitively).

## Maintenance notes

- Future spreadsheet features (styling, dropdowns, multi-sheet) now have ONE
  answer: ExcelJS — see `generateTemplate` for the established pattern.
- If users report `.xls` uploads failing, the intended answer is the friendly
  error message, NOT reintroducing SheetJS.
- Reviewer should scrutinize: header-detection fallback order in `parseExcel`
  and that `useTemuanImport` keeps skipping row-index 0 (header) exactly as
  before — those two parsers historically diverged; the tests pin them.
