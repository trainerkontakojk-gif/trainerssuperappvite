# SIDAK Agent Report — HTML Report Redesign (Phase 3)

Lane: **D** (significant UI redesign + public download-format contract).
Parent plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Phase 3.
Canonical docs: `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/design.md`,
`docs/feature-agent-detail-export-csv-md-html.md`.

## Requirement

- **Outcome:** HTML Statis and HTML Interaktif of `/sidak/agents/:id` must read as one
  professional editorial audit report, not a screenshot of the app shell.
- **Document hierarchy (shared, in order):** agent identity + report context →
  performance standing (quickview ranks, when present) → executive score for the
  active month → monthly score table (whole year + service) → top score-reducing
  tickets → root causes → trend chart + complete trend data table → benchmark
  comparison table → full findings by period and ticket → colophon (generated
  timestamp, scope statement).
- **Every section states its own scope.** Year + service, active month, YTD-to-month
  root causes, trend period labels, and `comparisonTable.scope` stay exactly as the
  existing CSV/MD scope contract defines them. No section may imply one month for the
  whole document.
- **No invented data or controls.** No new metric, score, or threshold. No control that
  cannot work in a downloaded offline file.
- **Remove offline-fake chrome:** the "Unduh Laporan" affordance, "Input Audit", "Muat
  ulang", the back affordance, and the disabled year/folder/agent `<select>` controls.
  Year and service are reported as plain metadata, not as fake selects.
- **Static variant:** semantic, fully readable document. Every section open and
  visible; no `hidden` panels; **no ARIA tabs** (no `role="tab"`/`role="tablist"`
  without real behaviour); no `<details>` used as a section shell.
- **Interactive variant:** real `role="tablist"`/`role="tab"` buttons with
  `aria-selected`/`aria-controls`, roving `tabindex`, Arrow/Home/End keyboard
  navigation, plus the existing trend series filter (`aria-pressed`) and optional
  `<details>` disclosures for period/ticket drill-down. Print must reveal every
  panel and every closed disclosure.
- **One design source:** both variants share the same dataset, markup, and styles.
  Only tab chrome, disclosure `open` state, and the inline script differ.
- **Offline/self-contained:** inline `<style>`, no remote font/link/script, no remote
  image, no `src="http…"`. All hostile data HTML-escaped. Avatar becomes offline initials.
- **Print:** A4 portrait `@page` with margins, `thead` repeating
  (`display: table-header-group`), `break-inside: avoid` on rows and score blocks,
  section headings not orphaned, no clipped long text.
- **Responsive:** no horizontal page overflow at 390px and 1440px; wide tables scroll
  inside their own wrapper instead of widening the page.
- **No product/app CSS changes.** All report styling stays inline in the generated
  document; no new tokens added to app or global CSS.
- **No phantom rows.** Clean sessions (`is_phantom_padding`) are never passed to the
  generator and never appear; the aggregate `sessionCount` stays as-is.
- **CSV and MD contracts are untouched** — same six sections, same schema header rows,
  same data rows, same scope comment lines.

## Design

- **Single source of report design.** `apps/web/src/utils/agentReportHtml.ts` owns the
  document stylesheet, the section builders, and the interactive script;
  `exportAgentReport.ts` keeps CSV/MD plus the `generateHTML` entry point that feeds
  both variants from the same snapshot arguments. No duplicated variant templates.
- **Attribute contract preserved** so the existing legacy unit expectations and the
  parity spec keep measuring the same thing: `data-report-variant`, `data-report-tab`,
  `data-report-panel`, `data-chart-series` + `data-series`/`data-series-key`/
  `data-series-total`/`data-series-summary`, `data-trend-filter`, `aria-pressed`, SVG
  class `trend-chart`, wrapper class `table-scroll`, finding/root-cause disclosure
  classes.
- **Visual direction** (restrained product register, from `docs/design.md` +
  `impeccable` product register): ink-first hierarchy (`#0f172a` headings on white
  paper, `#f8fafc` page canvas), a single near-black accent for the active tab and
  key figures, established semantic status colours only (emerald/amber/rose as in
  `AgentAuditDossier`), established chart palette for series, Outfit/Inter-first
  system font stack with no network fetch, `font-variant-numeric: tabular-nums` on
  every number, 4/8px spacing rhythm, 1px borders instead of shadows, radius 8–12px.
  No eyebrow labels, no numbered section scaffolding, no nested cards, no gradient,
  no invented badges.
- **Series differentiation without colour alone:** each trend series gets a distinct
  `stroke-dasharray` plus a matching marker shape, and the complete trend data table
  is rendered visibly (not `sr-only`) in both variants, so the chart never relies on
  hue alone.
- **Static vs interactive disclosure:** static renders findings/root-cause ticket
  references as plain visible blocks; interactive wraps the same blocks in
  `<details>`. The same underlying strings are emitted either way, so content parity
  holds at the text level.
- **Script hardening:** one delegated listener set on the report root; roving tabindex
  with Arrow/Home/End; `aria-pressed` filter toggles via
  `toggleAttribute('hidden', !visible)`; print forces all panels, all chart series,
  and all disclosure bodies visible, and hides tab/filter chrome.

## Tasklist

- [x] Read `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `trainers-superapp-tdd`,
      `docs/design.md`, `DESIGN.md`, feature doc, parent plan, live dossier/trend/
      findings/profile components, current generators, current E2E specs, legacy
      unit-test expectations, and the app theme tokens.
- [x] Classify Lane D; load `impeccable` (available) and read `ui-ux-pro-max` guidance
      from its on-disk dataset (not loadable as a host skill in this session).
- [x] Preflight E2E target: `localhost:3005` is this repo's Vite dev server,
      `apps/web/vite.config.ts` `/api` proxy is loopback-only, `env -u CI` so the
      existing local dev server is reused, browser network guard stays fail-closed.
- [x] RED: add behavioural E2E for the downloaded report (no faux controls, section and
      content parity, offline open, keyboard tabs, print reveals all panels, no
      horizontal overflow, accessible chart data table, screenshot artifacts).
- [x] Confirm RED fails for the intended reasons, not a broken harness.
- [x] GREEN: rewrite the shared report stylesheet, section builders, and interactive
      script; keep CSV/MD untouched.
- [x] GREEN: update the phase-1 HTML assertions from literal old markup to
      behavioural checks without weakening any data assertion.
- [x] Generate out-of-repo artifacts: desktop 1440, mobile 390, print (first/middle/
      last page) for both variants; report absolute paths.
- [x] `impeccable detect/audit` pass on the generated document; at most two fix rounds.
- [x] Verify: focused E2E (excluding the intentional PDF RED), web `tsc`, targeted
      eslint, prettier check, `git diff --check`.
- [x] Update `docs/feature-agent-detail-export-csv-md-html.md` to the final contract.
- [x] Record expected legacy breakage (`exportAgentReport.test.ts`, parity spec) as gaps
      for the Phase 5 owner; do not edit unit tests in this scope.
- [x] Gate repair: replace the lying clip-based print artifacts with the real
      `page.pdf()` output + per-page PDF read-back decoder.
- [x] Gate repair: print reveals closed `<details>` (content loss) and compacts
      the print rhythm so the standard fixture is 3 A4 pages, colophon on the
      last page together with the findings.
- [x] Gate repair: fail-closed offline egress guard installed before navigation,
      with a loopback self-test proving no bytes reach a socket.
- [x] Gate repair: 390px scroll cue on the benchmark table (mobile only, never in
      print), with a test proving the table really does overflow at 390px.

## Fase 3 gate repair (print pagination + offline egress)

Lane: **C** bounded repair inside this Lane D plan; Moy is the visual reviewer/gate.

Two real defects were found while repairing the print gate, plus one test-harness
safety defect. All three are covered by E2E in
`apps/web/e2e/sidak-agent-report-download.spec.ts`.

- **Pagination artifact was lying.** `page.screenshot({ clip })` cuts a
  continuous document flow, not the browser's pagination. `break-inside: avoid`
  moves blocks to the next page _without_ changing their offset in the flow, so
  the clip labelled "page 4" showed only the colophon while the real PDF's page 4
  held the findings section. The misleading clip artifacts are gone; print
  evidence is now the real `page.pdf()` A4 output plus a per-page text read-back
  decoded from that PDF (no external tools, no poppler dependency).
- **Print dropped the content of a closed `<details>`.** Chromium hides closed
  disclosure content through `::details-content { content-visibility: hidden }`,
  not through `display`, so forcing `display: block` on the children was not
  enough: the whole finding body and the root-cause evidence were missing from
  the print. The earlier E2E missed this because it _opened_ the disclosure with
  a click before printing. Fixed with `details::details-content { content-visibility:
visible }` in `@media print`, and the regression is now tested from the default
  closed state.
- **Sparse fourth A4 page.** With the finding actually printed, the report needed
  four A4 pages. Print-only spacing compaction (panel/section rhythm, line-height,
  colophon margins) brings the standard fixture to three pages with the colophon
  sharing the last page with the findings. Screen and desktop layout are
  untouched: every compaction rule lives inside `@media print`.
- **Mobile scroll cue.** The benchmark table scrolls inside `.table-scroll` at
  390px with no visual cue, so it gained a one-line hint that is shown only below
  40rem, hidden on desktop, and hidden in print.
- **E2E safety (the serious one).** The offline `file://` context had _zero_
  routes, so a regression that added a remote resource would have contacted an
  external host _before_ any assertion ran. `installOfflineEgressGuard` is now
  installed at context level **before** navigation, allowlists only
  `file:`/`blob:`/`data:`/`about:`, aborts and records everything else, and both
  the guard's blocked list and the browser's attempted list must be empty. A
  self-test (loopback standing-in listener) proves the guard closes the socket.

## Verification outcome

- Focused E2E `sidak-agent-report-download.spec.ts`: 14/14 passed with
  `--grep-invert "RED —"`; the PDF RED still fails for its intended reason
  (no PDF menu option yet — Phase 4).
- `pnpm --filter @trainers/web exec tsc --noEmit` → exit 0.
- `pnpm --filter @trainers/web exec eslint <3 owned ts files>` → exit 0, no warnings.
- `prettier --check` → clean for `agentReportHtml.ts` and this plan.
  `exportAgentReport.ts` and the feature doc still fail prettier; both already failed
  at baseline `8866306` (verified via `git show 8866306:<path> | prettier --check`),
  so this task did not introduce that debt and did not reformat them (that would
  bury the behavioural diff). The E2E spec is **new** — it did not exist at
  `8866306` and is still dirty in the working tree — so no baseline claim is made
  for it; it is excluded from this task's formatting scope.
- `git diff --check` → exit 0. Tree contains only the owned paths plus the five
  pre-existing dirty files, which were left untouched.

### Gate-repair verification

- Focused E2E `sidak-agent-report-download.spec.ts` with
  `--grep-invert "RED —"`: **17 passed** (14 pre-existing + 3 new), exit 0.
- RED proof for the print contract: with only the print block reverted to its
  pre-repair form, the new test failed with `4 halaman A4` (expected 3) and a
  page-4 read-back containing the findings heading plus the colophon but **not**
  the finding body — both the pagination defect and the content-loss defect.
- PDF RED still fails for its intended reason: `menu Unduh Laporan belum punya
opsi PDF; isi menu: []`. The user-facing PDF download option remains Phase 4;
  what is green here is the _print_ flow of the downloaded HTML through the
  browser's own print path.
- `pnpm --filter @trainers/web exec tsc --noEmit` → exit 0. The E2E spec is not
  covered by `tsconfig.json` (`include: ["src"]`), so it was typechecked with an
  out-of-repo tsconfig that adds `e2e/` → exit 0.
- `pnpm exec eslint apps/web/src/utils/agentReportHtml.ts
apps/web/src/utils/exportAgentReport.ts
apps/web/e2e/sidak-agent-report-download.spec.ts` → exit 0, no warnings.
- `git diff --check` → exit 0.
- Print artifacts (out of repo, absolute paths under
  `SIDAK_VISUAL_ARTIFACT_DIR`):
  `html-report/print/cetak-interaktif.pdf` (3 A4 pages),
  `html-report/print/cetak-interaktif-pages.txt` (per-page read-back),
  `html-report/print/real-page-{1,2,3}.png` (rasterized from that PDF, produced
  outside the test because no in-test PDF rasterizer exists — headless Chromium
  has no PDF viewer and the repo must not gain a poppler dependency).

## Fase 5 — migrasi test legacy ke bukti unduhan nyata

Lane: **D** (pewarisan dari plan induk; tidak ada perubahan runtime produk di fase
ini). Plan induk: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md`
Fase 5.

> **Catatan baseline.** Semua angka test di dalam bagian Fase 5 dan Fase 6 ini
> adalah **catatan tahap di dalam working tree**, bukan baseline commit `8866306`.
> `sidak-agent-report-download.spec.ts` tidak ada di commit `8866306` dan baru
> ada pada perubahan ini, sehingga hitungan "21/21" dan "25 + 2" di bawah tidak
> boleh dibandingkan dengan baseline itu.
> Baseline yang sah ada di
> [Hitungan test](../../docs/feature-agent-detail-export-csv-md-html.md#hitungan-test)
> pada dokumen fitur: non-E2E **66 → 12 case**, E2E cakupan laporan **1 → 28**
> dari baseline `8866306` (net +27), dan **54 case unit dihapus, bukan 27** — 27 test E2E
> yang ditambahkan bukan pengganti satu-per-satu dari 54 case tersebut.

### Apa yang dikerjakan

1. **Harness diekstrak, bukan diduplikasi.** Fixture, mock auth, mock `/api`,
   guard fail-closed, preflight, `exportFromMenu`, dan pembaca offline `file://`
   dipindah ke `apps/web/e2e/helpers/sidakAgentReportFixture.ts`, lalu diimpor
   kedua spec. Alasannya bukan kerapian: paritas lintas permukaan mustahil
   dibuktikan kalau kedua spec memakai data berbeda. Spec unduhan tetap hijau
   21/21 sesudah pemindahan, jadi ini refactor, bukan perubahan kontrak.
2. **Spec paritas dirombak di tempat, bukan dibuang.** Bentuk lamanya memanggil
   `generateHTML()` langsung lalu `page.setContent`, tanpa guard fail-closed —
   dua-duanya bukan bukti jalur unduh. Bentuk baru mengunduh lewat menu dan
   mengukur apa yang tidak bisa diukur spec unduhan: fakta yang terlihat di
   halaman live ikut ada di dokumen unduhan dari fixture yang sama, halaman live
   tidak meluber di 320/390/768/1024/1440 dan utuh di dark mode / reduced
   motion / zoom 200%, dan kedua varian punya screenshot yang bisa direview
   (termasuk keadaan tersaring: tab Tren + filter seri + disclosure terbuka).
3. **Empat test E2E baru** untuk invarian yang tadinya hanya bisa dibuktikan
   lewat test legacy: menu tidak terpotong di layar sempit, geometri tren
   degeneratif, agen tanpa data audit, dan data berbahaya dari label seri /
   cakupan benchmark / quickview.
4. **Test legacy dihapus hanya setelah pengganti E2E-nya lulus**, dengan peta
   kontrak di
   [`docs/feature-agent-detail-export-csv-md-html.md`](../../docs/feature-agent-detail-export-csv-md-html.md#peta-kontrak--bukti-lama--pengganti-e2e--celah-yang-tersisa).
5. **Satu test non-E2E diretain** (`exportAgentReport.test.ts`), hanya untuk
   invarian `NaN`/`Infinity` dari payload runtime, dengan izin Fajar.

### Bukti bahwa invarian non-berhingga memang mustahil lewat E2E

Menyuntik `Number.NaN` dan `Number.POSITIVE_INFINITY` ke fixture E2E
(`helpers/sidakAgentReportFixture.ts`, agen tren degeneratif) **tidak membuat
test gagal** — test tetap hijau. Penyebabnya transport: `JSON.stringify`
mengubah keduanya menjadi `null`, jadi nilai non-berhingga tidak pernah sampai
ke peramban. Nilai non-berhingga hanya bisa masuk lewat cast di sisi runtime.
Percobaan kedua — menyuntik label seri berisi teks `NaN`, yang memang bisa
melewati JSON — **membuat test gagal** dengan pesan "nilai tidak berhingga bocor
ke HTML", jadi assertion-nya bukan lass.

Dengan demikian retensi test non-E2E itu dibenarkan bukti, bukan alasan formal.

### Bukti RED lain

- Spec paritas versi pertama gagal tepat karena dua alasan yang memang salah
  ukur: dokumennya dibuat dari `generateHTML` + `page.setContent`, dan teks
  temuan hanya hidup di panel Temuan yang tersembunyi (`innerText` tidak pernah
  mengembalikannya).
- Test _Tren degeneratif_ versi awal gagal pada nama seri karena label agen itu
  memang berubah menjadi label berbahaya — diperbaiki ke bentuk ter-escape-nya.
- Test _Agen tanpa data audit_ gagal dua kali pada tebakan kopy empty-state;
  kopy sebenarnya dibaca dari file yang diunduh, bukan dikarang.

### Verifikasi (perintah, exit code, artefak)

| Perintah                                                                                                                                                                           | Exit | Hasil                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `env -u CI pnpm --filter @trainers/web exec playwright test sidak-agent-report-download.spec.ts sidak-agent-html-export-parity.spec.ts --reporter=line`                            | 0    | **27 passed (1.7m)** — 25 + 2                                                                                                        |
| `pnpm --filter @trainers/web exec vitest run src/__tests__/exportAgentReport.test.ts -t "never lets NaN or Infinity from a runtime payload reach the document" --reporter=verbose` | 0    | 1 test file, **1 passed** — hanya invarian yang diizinkan, tanpa suite lain                                                          |
| `pnpm --filter @trainers/web exec tsc --noEmit`                                                                                                                                    | 0    | bersih                                                                                                                               |
| `pnpm --filter @trainers/web exec tsc --noEmit -p <tsconfig e2e di luar repo>`                                                                                                     | 0    | spec `e2e/` tidak termasuk `tsconfig.json` (`include: ["src"]`), jadi di-typecheck dengan tsconfig luar repo yang menambahkan `e2e/` |
| `pnpm exec eslint <5 file yang dimiliki>`                                                                                                                                          | 0    | 0 error, 0 warning                                                                                                                   |
| `pnpm typecheck`                                                                                                                                                                   | 0    | 4/4 workspace                                                                                                                        |
| `pnpm lint`                                                                                                                                                                        | 0    | 4/4 workspace; 107 warning bawaan, **0** di file yang dimiliki fase ini                                                              |
| `pnpm build`                                                                                                                                                                       | 0    | 3/3 task                                                                                                                             |
| `git diff --check`                                                                                                                                                                 | 0    | bersih                                                                                                                               |

Target E2E dibuktikan aman sebelum dijalankan: listener `localhost:3005` adalah
dev-server Vite repo ini (memuat `/@vite/client` dan `/src/main.tsx`, dan
`/@vite/client` melayani JavaScript), proxy `/api` di `apps/web/vite.config.ts`
hanya menunjuk `http://localhost:3001` (loopback), dan guard fail-closed
menahan `/api` yang tidak dimock. Audit per test mencatat `blockedApi: []` dan
`blockedExternal` hanya berisi host font `index.html` yang memang diblokir.
Perintah dijalankan dengan `env -u CI` supaya `reuseExistingServer` memakai dev
server lokal yang sudah hidup.

Artefak (di luar repo, `SIDAK_VISUAL_ARTIFACT_DIR`):
`html-report/parity/live-{320,390,768,1024,1440,dark-1440,reduced-motion-1440,zoom-200-1440}.png`,
`html-report/parity/{statis,interaktif}-{1440,390}.png`,
`html-report/parity/interaktif-{1440,390}-tersaring.png`, plus file HTML yang
benar-benar diunduh di `parity/` dan `parity-visual/`.

### Gerbang yang sudah tertutup

- ✅ **Keputusan Fajar masuk — dua konvensi DISETUJUI.** Prefiks CSV
  `[teks] ` dan penanda PDF `[U+XXXX]` sudah berubah dari "menunggu keputusan"
  menjadi kontrak final atas pertanyaan eksplisit; cakupannya hanya dua
  konvensi itu. Detail, bukti, dan batas yang jujur ada di
  [Status dokumen fitur](../../docs/feature-agent-detail-export-csv-md-html.md#status).
- ✅ **STOP placeholder `Masa Kerja,[teks] -` sudah diperbaiki.** `csvEscape`
  kini mengenali placeholder internal yang persis satu tanda hubung lebih
  dulu dan menuliskannya polos, sementara pemicu formula asli tetap
  dilindungi. Gate ini tertutup setelah keputusan prefiks `[teks] ` masuk,
  persis seperti syaratnya. Rinciannya di
  [Fase 6 — placeholder internal CSV](#fase-6--placeholder-internal-csv).
- ⚠️ `artifacts/sidak-agent-report-parity/` di akar repo masih berisi keluaran
  run lama (HTML hasil `generateHTML` langsung). Direktori itu gitignored dan
  tidak lagi ditulis spec mana pun, jadi dibiarkan apa adanya — bukan artefak
  yang valid lagi.

## Fase 6 — placeholder internal CSV

Lane: **C** bounded repair di dalam plan Lane D ini; keputusan yang
menjadikannya mungkin sudah diambil Fajar (persetujuan prefiks `[teks] `).

### Temuan

`csvEscape` menandai setiap sel yang diawali pemicu formula, dan placeholder
internal `computeTenure()` untuk agen tanpa `bergabung_date` adalah `-` —
yang persis berupa pemicu. Akibatnya baris profil menjadi `Masa Kerja,[teks] -`:
penanda `[teks] ` muncul di sel yang tidak pernah bisa dievaluasi spreadsheet,
dan pembaca laporan mengira ada data berbahaya yang dinetralisasi padahal tidak
ada. Ini terlihat di file CSV yang **benar-benar diunduh** (bukan di string
generator).

### Bukti RED

E2E baru *CSV: placeholder internal `-` tetap polos, pemicu formula `-1-1` tetap
dilindungi* di `apps/web/e2e/sidak-agent-report-download.spec.ts` mengunduh dua
file lewat menu UI: CSV agen tanpa `bergabung_date` dan CSV fixture berformula.
Sebelum perbaikan:

```
Expected: "Masa Kerja,-"
Received: "Masa Kerja,\x1b[7m[teks] \x1b[27m-"
```

RED, exit 1. Assertion lain di test yang sama sengaja mengukur arah sebaliknya
— sel `-1-1` harus tetap `CSV_FORMULA_PREFIX + "-1-1"` — supaya perbaikan yang
terlalu longgar (melewatkan semua sel berawalan `-`) tidak bisa lolos diam-diam.

### Perbaikan

`CSV_INTERNAL_PLACEHOLDER` di `apps/web/src/utils/exportAgentReport.ts` —
satu konstanta, satu pengecualian di `csvEscape`, tepat satu nilai. Pengecualian
hanya berlaku pada string yang **persis** `-`; tetangganya (`-1-1`, `-1.5`,
`- 1`) tidak berubah. Tidak ada perubahan pada `generateMD`, HTML, PDF,
`computeTenure`, skema enam seksi, BOM, maupun bentuk sel angka bertanda.

### Verifikasi (perintah, exit code, artefak)

| Perintah | Exit | Hasil |
| --- | --- | --- |
| `env -u CI pnpm --filter @trainers/web exec playwright test sidak-agent-report-download.spec.ts --grep "placeholder internal"` (RED, sebelum perbaikan) | 1 | `Expected: "Masa Kerja,-"` / `Received: "Masa Kerja,[teks] -"` |
| perintah sama (GREEN, sesudah perbaikan) | 0 | `1 passed` |
| `env -u CI pnpm --filter @trainers/web exec playwright test sidak-agent-report-download.spec.ts sidak-agent-html-export-parity.spec.ts --reporter=line` | 0 | **28 passed (1.8m)** — 26 + 2 |
| `pnpm --filter @trainers/web exec tsc --noEmit` | 0 | bersih |
| `pnpm --filter @trainers/web exec tsc --noEmit -p <tsconfig e2e di luar repo>` | 0 | spec `e2e/` tidak termasuk `tsconfig.json` (`include: ["src"]`) |
| `pnpm exec eslint apps/web/src/utils/exportAgentReport.ts apps/web/e2e/sidak-agent-report-download.spec.ts` | 0 | 0 error, 0 warning |
| `pnpm typecheck` | 0 | 4/4 workspace |
| `pnpm lint` | 0 | 4/4 workspace; 107 warning bawaan, 0 di file yang dimiliki |
| `pnpm build` | 0 | 3/3 task |
| `git diff --check` | 0 | bersih |

Bukti konsumen spreadsheet diulang setelah perbaikan, karena pengecualian
placeholder mengurangi satu bagian invarian struktural yang klaim sebelumnya
bergantung padanya. Kedua file **unduhan nyata** (fixture berformula dan
placeholder) plus satu kontrol positif dibuka di LibreOffice headless
(`soffice --convert-to xlsx` dengan profil sekali pakai di luar repo) dan dibaca
balik dengan `openpyxl`:

- kontrol positif: 1 sel formula terdeteksi (`=1+1`) → metode ini memang bisa
  gagal, jadi hitungan 0 di bawah bukan negatif palsu;
- CSV fixture berformula: **0 sel formula**, keempat sel yang dinetralisasi
  terbaca sebagai teks biasa, **45 sel angka** tetap angka dengan nilai
  byte-identik (`82,84,80,1,0` / `91,92,90,2,1` / `74.5,79,70,4,2`);
- CSV placeholder: **0 sel formula**, dan sel `Masa Kerja` terbaca sebagai
  teks biasa `-` (`data_type` string), bukan formula dan bukan angka.

Artefak unduhan (di luar repo, di bawah `SIDAK_VISUAL_ARTIFACT_DIR`):
`html-report/placeholder/Laporan_Audit_Laras Wulandari_2026.csv` (agen tanpa
`bergabung_date`, 660 byte) dan
`html-report/placeholder/Laporan_Audit_Bagas Prakoso_2026.csv` (fixture
berformula, 5896 byte). Keduanya bisa direproduksi dengan perintah Playwright di
atas.

### Batas yang masih terbuka

- **Microsoft Excel dan Google Sheets tidak diuji.** Hanya LibreOffice yang
  tersedia di lingkungan ini; `+`, `-`, dan `@` tetap dinetralisasi secara
  defensif, bukan terverifikasi.
- Penanda PDF `[U+XXXX]` **tidak dapat dibedakan** dari `[U+XXXX]` yang memang
  tertulis di teks sumber. Batas ini kini ditulis akurat di dokumen fitur
  (bagian *Karakter di luar WinAnsi di PDF*); perilaku penanda tidak diubah
  karena sudah disetujui.
- `Layanan Audit` kosong + baris cakupan tanpa nama layanan untuk agen tanpa
  periode masih **observasi**, belum jadi keputusan Fajar.

### Out of scope fase ini

Tidak ada edit runtime produk, tidak ada commit/push/deploy/install, tidak ada
root Vitest suite, `useAgentDetail.test.tsx` tidak disentuh, dan dua test
`AgentProfileBar` yang bukan kontrak ekspor juga tidak disentuh.

## Fase 7 — status run terakhir dan kurasi test yang tersisa

Lane: **A** (dokumentasi saja; tidak ada edit produk, test, atau kontrak).
Fokus: mencatat batas bukti secara jujur, lalu memutuskan kurasi test yang
tersisa sebelum ada penghapusan lagi.

### Status run *focused* terakhir

Run *focused* terdelegasi terakhir untuk
`sidak-agent-report-download.spec.ts` + `sidak-agent-html-export-parity.spec.ts`
melaporkan **28 passed (1,9 m)** pada reporter Playwright.

- **Exit code Playwright tidak diklaim dari run itu.** Worker menangkap status
  pipeline melalui `tail`, jadi tidak ada exit code yang terambil secara
  independen. Yang boleh diklaim dari run terakhir hanyalah isi laporan
  reporter.
- Exit `0` yang tertulis di tabel verifikasi Fase 6 adalah hasil **gate fase
  sebelumnya** yang tercatat, bukan hasil run terakhir. Kedua hal ini sengaja
  tidak digabung menjadi satu klaim.

### Kurasi 12 case non-E2E yang tersisa

Audit read-only terakhir atas 12 case yang tersisa menghasilkan
**0 dari 12 case yang membenarkan penghapusan sekarang**:

| Sisa case | Suite | Alasan tetap dipertahankan |
| --- | --- | --- |
| 1 case | `exportAgentReport.test.ts` | invarian `NaN`/`Infinity`; mustahil dibuktikan E2E (`JSON.stringify` mengubahnya jadi `null` sebelum mencapai peramban) — satu-satunya pengecualian non-E2E yang disetujui Fajar |
| 2 case | `AgentProfileBar.test.tsx` | perilaku UI komponen di luar scope ekspor, tanpa E2E ekuivalen yang terverifikasi |
| 9 case | `useAgentDetail.test.tsx` | perilaku hook di luar scope ekspor, tanpa E2E ekuivalen yang terverifikasi |

Catatan hitungan yang sering disalahbaca: **54 case unit dihapus, bukan 27**, dan
27 test E2E yang ditambahkan **bukan** pengganti satu-per-satu. Keduanya hanya
boleh dibaca sebagai total cakupan.

**Rekomendasi:** jangan hapus test lagi sekarang. Urutan yang benar adalah
menulis E2E untuk perilaku yang observabel di permukaan pengguna lebih dulu —
kandidat paling jelas dari 11 case komponen/hook di atas — baru menghapus test
unit yang kontraknya sudah terbukti setara. **Tidak ada kebijakan untuk
menghilangkan seluruh unit test**; batas repository adalah jangan menulis unit
test baru sebagai pengganti E2E, bukan menghapus setiap unit test yang tersisa.

Rincian yang sama tercatat di
[Kurasi: 12 case yang tersisa](../../docs/feature-agent-detail-export-csv-md-html.md#kurasi-12-case-yang-tersisa)
pada dokumen fitur.

## Out of scope

`AgentProfileBar`, `useAgentDetail`, `AgentDetailPage` route, app/global CSS,
scoring/backend, unit tests, PDF (Phase 4), commits/push/deploy/install.
