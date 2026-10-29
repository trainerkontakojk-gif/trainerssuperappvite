# Changelog

Every commit that changes the repository adds one entry here, in the same commit. Policy: [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) §4 "Changelog gate". Enforced by `.githooks/pre-commit` locally and `scripts/check-changelog.mjs` in CI.

Format: newest date first, one `## YYYY-MM-DD` heading per day, one `- type(scope): summary` bullet per commit. Entries before 2026-10-17 were backfilled from `git log` and carry the short commit hash.

## 2026-10-29

- feat(efek): anggap proper input APPK sesuai secara default dan sediakan toggle skor SIDAK resmi

- fix(deps): tambal advisory produksi (undici, body-parser, qs, dompurify, fast-uri, dll.) lewat override pnpm, naikkan minimum Node ke rilis yang sudah ditambal (22.23.4 untuk CI dan image Render), dan tambahkan probe keamanan respons undici

- fix(ketik): tahan balasan konsumen sampai agen selesai mengetik

- docs(efek): tambahkan plan proper input dianggap sesuai secara default dengan toggle, plus penataan tampilan, untuk dikerjakan Codex

- docs(ketik): tambahkan plan konsumen menunggu agen selesai mengetik untuk dikerjakan Codex

- feat(telefun): kirim arahan nada per giliran untuk konsumen marah dan sedih

- feat(telefun): pilih suara konsumen sesuai tipe marah dan sedih

## 2026-10-28

- docs(telefun): tandai Task 0 plan arahan nada lulus beserta bukti dan catatan urutan byte audio TTS

- docs(telefun): tambahkan plan arahan nada per giliran, suara per tipe konsumen, dan klip nonverbal untuk dikerjakan Codex

- test(telefun): amati audio setelah hold pada audio thread agar respons singkat tidak terlewat

- test(api): perbarui assertion basi di unit test KETIK timing (frasa "fase akhir" kini ada di panduan penutupan persona) dan SIDAK forecast (model kini gemini-3.8-flash)

- refactor(api): hapus opsi temperature yang tidak terpakai dari jalur Gemini sehingga KETIK, PDKT, dan SIDAK forecast hanya mengirim temperature ke OpenAI, sesuai deprecation parameter sampling Gemini

- chore(dev): tambahkan scripts/dev-local.mjs untuk menjalankan dev ke Supabase lokal dan perbaiki seed akun lokal agar bisa login dengan peran yang benar

- docs(telefun): track rencana investigasi crackle playback live beserta bukti verifikasi lokal

- fix(telefun): jaga kontinuitas playback PCM dengan lead 240 ms dan antrean antar-turn

## 2026-10-27

- feat(telefun): tambahkan tiga contoh acuan nada untuk setiap tipe konsumen tanpa mengubah kontrol panggilan atau pilihan suara

- fix(telefun): susun ulang prompt konsumen dan selaraskan arahan ekspresi dengan tipe serta de-eskalasi

- test(telefun): tetapkan gate energi pita full-call sejajar sumber untuk semua channel, validasi kontrol direct dan guard band CELT, tanpa mengubah bitrate atau ambang retensi

- fix(telefun): pensiunkan riwayat OpenAI terminal tanpa claim/provider, pertahankan cache completed dan lease aktif, serta lanjutkan antrean Gemini

## 2026-10-26

- fix(telefun): cegah scoring jika salah satu rekaman gagal, pertahankan rekaman valid, gagalkan enqueue/claim/hasil terlambat, dan lindungi retry sampai cleanup selesai

- fix(telefun): pisahkan input Gemini 16 kHz dari playback/rekaman full-call pada rate output native, pertahankan agent-only mic dan 32 kbps, serta finalisasi kedua recorder sebelum membersihkan graph

## 2026-10-25

- fix(telefun): konsumen marah menagih respons agen alih-alih menunggu pasif, dengan pengingat nada di akhir prompt yang tetap tunduk pada hold dan kontrol penutupan aplikasi; tipe lain dan pilihan suara tidak berubah

## 2026-10-23

- feat(telefun): telaah menandai kategori bahasa termasuk pengulangan dan efektivitas kalimat, memverifikasi dua bukti pengulangan, serta menjaga navigasi kutipan bertumpang tindih dan hasil lama

- fix(telefun): panggilan memakai mikrofon yang dipilih dan dicek di dialog Siapa yang berlatih (mis. headset Jabra), pilihan diingat per browser, dan panggilan gagal jelas bila mic itu hilang alih-alih pindah diam-diam ke mic laptop

- fix(telefun): konsumen AI kembali memilih Mas/Mbak atau Pak/Bu dari suara agen seperti Agustus, memakai "Kak" hanya saat ragu, tanpa meniru sapaan dari contoh kalimat

- fix(telefun): konsumen AI memanggil agen dengan sapaan netral "Kak" atau tanpa sapaan dan tidak lagi menebak Mas/Mbak/Pak/Bu, karena jenis kelamin agen tidak diketahui prompt

- fix(telefun): konsumen marah ngotot menolak solusi pertama dan baru menerima dengan berat hati setelah ada langkah konkret dan kepastian waktu, dan domisili provinsi seperti "Lampung" dijawab dengan kota/kabupaten spesifik hanya saat agen memprobingnya

- fix(pdkt): catat peserta yang dipilih saat membalas pada Riwayat, Monitoring, dan SIDAK tanpa mengubah snapshot pembuat email atau riwayat lama

- fix(telefun): konsumen marah tetap konsumen saat agen kasar atau menghina, bernada tinggi dan bertempo cepat, dengan kontrak peran di awal prompt dan tanpa kata "maaf" yang bisa ditiru sebagai gaya agen

- fix(web): allow blob: in connect-src for serve.json so the Telefun waveform renders on the VPS

## 2026-10-22

- feat(deploy): tambahkan proxy HTTP opsional khusus Gemini di API dan Telefun tanpa mengubah koneksi langsung saat GEMINI_PROXY_URL kosong

- feat(deploy): web mengizinkan panggilan https/wss ke *.trainerssuperapp.my.id agar web, API, dan Telefun bisa berjalan di VPS Coolify

- feat(deploy): API dan Telefun bisa dijalankan sementara di Render (Dockerfile.render + render.yaml dengan FFmpeg), pengaman database produksi dan pembatas spam mengenali Render, dan web mengizinkan alamat onrender.com

## 2026-10-21

- feat(telefun): pulihkan foto konsumen, tata ulang layar panggilan dengan waveform mikrofon langsung dan retry aman tanpa mengubah timer panggilan atau hold

- feat(telefun): tampilkan telaah dalam satu kolom tanpa catatan berulang, dengan navigasi bagian, alasan skor yang dapat dibuka, dan tombol sembunyikan/tampilkan telaah

- feat(ketik): tampilkan telaah dalam satu kolom tanpa catatan berulang, dengan navigasi bagian, alasan skor yang dapat dibuka, dan tombol sembunyikan/tampilkan telaah

- fix(ketik): the AI consumer treats attachment descriptions as its own facts, sees one indexed attachment list so it sends the right image, and remembers what each sent image showed

- fix(ketik): show consumer and agent message timestamps in Telaah without inventing missing legacy times

- docs(db): record the verified production apply of KETIK post-expiry closing and complete the production task

- fix(ketik): at session expiry the consumer sends one goodbye with a reason, the agent can keep sending closing messages without AI replies until Akhiri chat, and Telaah shows the consumer phone number
- docs(ketik): correct the proactive-attachment plan fallback to match the shipped guard
- fix(ketik): send scenario attachments proactively when their topic comes up, and have the backend add the matching unsent image when the AI forgets the tag after a proof request or a reply that tells what the image shows

## 2026-10-20

- docs(db): record the production apply of the KETIK consumer NIK/email migration
- fix(ketik): drop the verification hint and the practice-data note from the simulation Data konsumen panel so the agent gets no clue, and record the one-time Probing −20 decision
- feat(ketik): add NIK and email to Pengaturan Identitas with neutral notes for deliberately malformed data, a Data konsumen panel beside the chat (bottom sheet on narrow screens), a Telaah consumer-data card, missed-confirmation marker and Verifikasi data section, and NIK/email in CSV exports and Monitoring
- fix(ketik): skip NIK/email/domicile verification for sessions finished before NIK and email existed, so an old bare "Jakarta" domicile is never penalized on re-review
- fix(ketik): keep the "do not invent new data" consumer rule beside the NIK/email rule and label verification notes as NIK, Email and Domisili
- feat(ketik): store consumer NIK and email in KETIK history, have the consumer give them only when asked (with a server-computed correction for malformed data), and score verification of malformed NIK/email/domicile in the review with server-validated evidence
- feat(ketik): add the 150-consumer practice pool with NIK and email, malformed-identity detection and correction, and the shared NIK/email/verification contract
- docs(ketik): extend the verification rule to province-level or bare-Jakarta domicile while treating shared city/regency names as the city
- docs(ketik): penalize never asking for malformed NIK/email and show the session data plus a missed-verification marker beside the Telaah transcript
- docs(ketik): state that the consumer never volunteers NIK or email before the agent asks
- docs(ketik): plan a 150-consumer pool and let the consumer refuse or give a server-computed corrected NIK/email when the agent confirms malformed data
- docs(ketik): plan an unspaced NIK in the Data konsumen panel and a Verifikasi data section in Telaah for sessions with malformed NIK or email
- docs(ketik): record the NIK/email decisions — Gmail addresses, a Data konsumen side panel, and review credit for confirming deliberately malformed NIK or email at least once
- docs(ketik): plan NIK and email on KETIK consumer identities with a larger, region-consistent consumer pool
- feat(ketik): send each KETIK agent message as it is typed, keep the sent/read ticks, type published consumer replies out one at a time in the original rhythm (read time, length bands, occasional slow reply) instead of revealing them together, and show an honest elapsed clock plus a 1–2/3-minute estimate while Telaah runs
- feat(ketik): add the durable KETIK message API and its migration — `POST /ketik/sessions/:id/messages` persists one agent message without calling AI, `POST /ketik/sessions/:id/respond` answers the whole durable context, one stale reply is discarded and regenerated when newer context arrives, `/turns` keeps working for clients that have not updated yet, and the response ledger is service-role-only with owner-bound RLS reads
- fix(ketik): show agent messages instantly with sent/read ticks and guide the consumer to send relevant scenario attachments
- fix(telefun): allow local recording reads under production CSP

- feat(telefun): clarify review audio waveform and playback position

- fix(ketik): score Tata Tulis only from agent messages so the expressive consumer's lo/gue, dialect, caps, "!!", "hadeh" and emoji are never counted as agent typos or cited as typo evidence
- feat(ketik): make the AI chat consumer more expressive — written emphasis (caps on a word, !!, ..., hadeh/astaga, light emoji), lo/gue, light dialect from identity.city, calm types no longer told to avoid drama, and believing an answer no longer calms an angry consumer at once; typo ban and exact identity kept
- feat(telefun): make the AI consumer more expressive — voice-level emotion without spoken stage directions, everyday speech incl. lo/gue, light regional dialect from the caller's city, and angry callers may vent a few heated sentences instead of one line then silence
- test(profiler): update the global birthdays E2E spec to the inline "Ulang tahun terdekat" list from the phase 4 redesign (no card or popup), keeping the limit=5, empty-state and Coba lagi retry checks
- feat(profiler): show the KTP landing as one grouped team → folder list in the main area, hide the side panel there, and add a "Ringkasan tahun" link back from inside a folder

- fix(sidak): give every agent a unique rank using critical findings, QA score, then name as tie-breakers

- fix(sidak): drop the coaching suggestion from Parameter teratas; it already leads Kesimpulan

- fix(sidak): tighten the dashboard summary (stacked left column, collapsible agent toggle), drop the duplicate agent list from Parameter teratas, and label only the latest, highest and lowest trend points

- docs(audit): archive Supabase egress findings with evidence limits and redacted identities

- feat(sidak): rework the dashboard What / So what / Now what summary with short headlines, worded tone labels, the coaching recommendation and top agents inline, and share the findings sentence with the Beranda trend card

- fix(efek): compare participants with the monthly service average so the baseline no longer disappears once most agents have trained

- feat(home): add self-scoped agent QA summaries, practice quotas and Telefun history

- docs(plans): plan the EFEK baseline switch from non-participant agents to the monthly service average for KETIK, PDKT, Telefun and CERIWIS, so the dashed line no longer disappears once most agents have trained
- fix(db): make the access groups count view honor caller RLS and revoke it from signed-in users (Supabase security_definer_view advisor)
- feat(tna): add reversible EFEK agent exclusions with reasons and report comparisons

- docs(plans): draft the optional phase 4 agent home scope (current state, candidate blocks, decisions K1–K5, draft contract, sentences, and E2E) pending Fajar's decisions
- feat(home): add scoped lowest-score agents, audited-agent trend comparisons, latest-period service shares, and filtered SIDAK links to the staff home

## 2026-10-19

- feat(sidak): add deterministic dashboard conclusions, the fastest-rising focus parameter, and scoped coaching-agent disclosures with QA-target context and capability-gated TNA navigation
- fix(sidak): make the dashboard weekly pattern follow team and month filters without widening leader scope, and add QA-target and per-audited-agent comparison badges to its KPI strip
- fix(tna): score the EFEK report from raw SIDAK temuan the same way the SIDAK agent page does, instead of the dashboard cache table that holds score 0 from the SQL refresh and is never refreshed by imports, which showed impossible averages (a PDKT average of 35) and KETIK agents without data; QA, team leaders and trainers no longer count as comparison peers
- docs(plans): add the What / So what / Now what dashboard spec for coding agents (SIDAK weekly pattern follows team and month filters, score-vs-target pills, a deterministic dashboard summary with focus parameter and coaching agents, and Beranda comparisons with filtered links), in three phases with E2E checks
- feat(tna): add EFEK phase 3: an "Unduh laporan" button on the EFEK program page that saves a self-contained, printable HTML report (summary, method, charts, sessions, participants, monthly breakdown, all text escaped), and an "Ikut pelatihan" list on the SIDAK agent sidebar linking to the EFEK session, sent in the agent quickview only to roles with `tna.read`
- feat(tna): add the EFEK report: per program and per session, the change in participants' SIDAK QA score and findings per audit session between the closed months before and after training (window 1–6 months, training and running month excluded), naik/stabil/turun/menunggu status with a thin-data flag, a comparison with agents of the same service who did not attend, charts by month relative to training, and a sortable participant table with a monthly breakdown (`GET /api/v1/tna/efek/report`, `/report/:program`, page `/tna/efek/program/$code`); no schema change
- feat(tna): add EFEK (Evaluasi Efektivitas dan Kinerja) phase 1 under TNA: training programs KETIK/PDKT/Telefun/CERIWIS (CERIWIS measured on CSO), training sessions with participants from Profiler (create, edit, delete), and Excel/CSV participant import with name matching, behind `tna.read`/`tna.write` with RLS read-only tables and service-role write functions; production needs migration `20261019160000_efek_training_sessions.sql`
- fix(pdkt): keep the scenario editor visible after choosing an attachment and cover the file-picker focus flow on mobile and desktop
- docs(codex-cloud): add the Codex cloud environment guide and the setup/maintenance scripts that install the Supabase, Vercel and Railway CLIs, render `.env`, and republish the setup-phase tokens into `~/.codex-cloud-env.sh` so the agent phase still has them, with the network allowlist and the deliberate absence of `SUPABASE_SERVICE_ROLE_KEY`
- perf(db): add list indexes for the Telefun history (owner, newest first), the PDKT history (owner, newest first) and the PDKT mailbox (latest activity first), with a rollback; production applies them with `supabase db push`
- perf(telefun): prepare the Telefun connection (microphone, call server, voice AI setup) while the 2.5 s ringtone plays instead of after it, so the call is ready when the ring ends; recording, microphone audio and "Tersambung" still start only at pickup, and leaving during the ring opens no further connection or microphone
- perf(telefun): load the Telefun history list (landing and Riwayat) without transcripts, session metrics, prompts or coaching text (`GET /telefun/sessions?view=list`), and fetch the one full call only when its Telaah opens; never send the scoring worker's claim token hash or owner to the browser
- perf(pdkt): load the PDKT history list (Riwayat, workspace, landing) as short rows with only the score, scenario title and last subject (`GET /pdkt/history?view=list`), and fetch one full session (`GET /pdkt/history/:id`) only to replay it or its full Telaah only when Telaah opens, instead of downloading every email and evaluation up front
- perf(practice): store KETIK scenario images and PDKT attachments once in a Supabase Storage bucket and keep only their links in settings, sessions, mailbox and history, with a one-off backfill (`pnpm --filter @trainers/api backfill:scenario-attachments`) that moves existing base64 attachments; PDKT shows and opens image and PDF links
- perf(practice): open a finished KETIK Telaah with one read (the review status now carries the ready result), return the Telefun score without waiting for the coaching summary AI call, and upload both Telefun recordings at once after a call
- perf(practice): stop reloading the full PDKT history after saving settings, creating an email or re-saving a draft, and when someone else's finished review is first read; start a KETIK session without waiting for the monthly AI cost summary, wait 300 ms after typing before searching KETIK history, re-render the KETIK chat once at the deadline instead of every second, and record Telefun calls at 32 kbps instead of the browser's ~128 kbps
- feat(dev): refuse to start the API and Telefun against the production Supabase project outside Railway or Vercel, with `ALLOW_PROD_DB_IN_DEV=1` to start anyway with a warning, so local and cloud dev runs stop writing to production and using its egress quota
- fix(telefun): download a Telaah recording once per visit and play, seek, draw the waveform and save from that local copy, instead of pulling it from Supabase Storage again for the player and every seek; an expired link is replaced once

## 2026-10-18

- feat(users): give an account a last day (masa aktif) after which it cannot sign in and its open logins end, set it from the user page, the approve dialog or for many people at once, show "Masa aktif habis" with a Habis filter and a clear login message, and add checkboxes to the users list to approve, set a practice limit, set masa aktif or suspend up to 100 accounts with a per-person result
- feat(users): end every open login of an account the moment it is suspended, rejected, deleted or given a lower role, and let agents and leaders re-score a KETIK session with AI once (the Telaah ulang button hides when it is used and a refusal shows the reason); trainers and admins keep unlimited re-scores
- feat(users): add a Batas latihan page `/dashboard/batas-latihan` where admins and trainers set the daily KETIK, PDKT and Telefun limit for agents and leaders and see today's starts, give one person a different limit with an end date and a note from that page or the user page, approve a pending account with its role and a suggested KTP participant in one dialog, and show each account's limit plus a "Belum tertaut" filter in the users list
- feat(practice): open Telefun to every role from the menu (the Akses Terbatas window is gone; starting a call still follows the daily limit), show one line with today's remaining KETIK, PDKT and Telefun starts under each start button and turn the button off with the reason and the 00.00 WIB reset when it is used up, add `GET /me/practice-quota`, and keep Telefun re-scoring and AI annotation generation with trainers and admins because they have no daily limit
- feat(practice): limit practice starts per day on the server (agent and leader: KETIK 3, PDKT 3 new emails with free replies, Telefun not allowed; admin and trainer unlimited; per-user overrides with an end date; WIB day; failed starts refunded; retries counted once), show the limit message when KETIK or PDKT refuses a start, and close the bypasses: the Telefun call server only starts a fresh active session made by the API, owners can no longer write `telefun_history` directly, and a PDKT email that skipped the count is counted when answered
- feat(users): link each account to one KTP participant from a new user page `/dashboard/users/:id` (account, participant, KETIK assignment, leader access, change history), show the linked participant in the users list and an "Akun aplikasi" row on the KTP profile, read the agent SIDAK scope and Monitoring from the new `akun_id` link, stop the KTP editor from setting it, and make reset password actually email the address stored on the account
- feat(monitoring): rename the tabs to Riwayat / Biaya AI / Harga & kurs, rebuild Biaya AI at `/monitoring/biaya` with month, module and search kept in the address, one summary row, per-person and per-model tables with total rows and a compact phone list, add a per-person page `/monitoring/biaya/:pengguna` with input/output tokens and a link to that person's sessions in Riwayat, and limit leaders to the costs of accounts in their approved teams
- feat(monitoring): open each session on its own page `/monitoring/sesi/:modul/:id` with the transcript, emails or recording on the left and session data plus the AI assessment as aligned rows on the right, a copy-link button, delete from the page, a back link that keeps the Riwayat filters, and the same view in a SIDAK dialog; the review API now returns the scenario title, time, participant and session length
- feat(monitoring): load Riwayat one page at a time from the server (25 short rows, no transcripts) with module, status, WIB date and search filters kept in the address, a one-row-per-session table, a compact list on phones, a delete dialog that names the session, and leaders limited to sessions of their approved teams in the list and the session detail
- feat(monitoring): schedule AI prices from a chosen date (00.00 WIB) with cancel before it starts, cost every AI call at the price in effect at that moment, seed Gemini 3.8 Flash at $1.50/$7.50 from 1 Jan 2027, and move Harga & kurs to its own page `/monitoring/harga` with prices grouped by provider, the next price, the image output rate, an edit dialog and collapsed legacy models

## 2026-10-17

- fix(monitoring): show the real KETIK session length (first to last message) in Monitoring and SIDAK instead of the time limit, label the time limit as 'Batas waktu: N menit', count every AI call in a month (no 1000-row cap), add a Lainnya cost and an Analisis QA filter, show month and module names in the usage filters with a way back to Semua modul, categorise four uncounted PDKT/Telefun actions, hide raw database errors, and reject prices for unknown models
- feat(profiler): show up to five upcoming birthdays in the year summary, replace statistik pie charts with bars labelled with number and percent, add a name strip to jump between slides, show one compact row per participant on phones, and rename the remaining 'batch' UI text to 'folder'
- feat(profiler): open Tambah peserta and Impor inside the workspace and make Kelola daftar tim a dialog; Impor now checks every row with a reason (missing name, unknown jabatan, bad date, duplicate) before anything is saved, accepts the headers of the app's own template, and `/profiler/add`, `/profiler/import` and `/profiler/teams` redirect to the new views
- feat(profiler): merge the participant list into the workspace Peserta tab with Kartu/Tabel modes, search by NIK/email and a team filter, open the profile and edit form in the main area with previous/next, move Pilih banyak/Pindah folder/Atur urutan into the tab, and redirect /profiler/table to the Tabel mode
- feat(pdkt): make the AI consumer email feel written by a real person and harder to skim: per-type personality outside the data block, a layperson rule (no correct solution or legal basis), scattered facts, pasted chat/SMS "attachments", a request hidden mid-email, random distractors and self-corrections, 500-1000 words for every type including rushed; fix name checks so "Agus" no longer fails on "Agustus" and place fallback names after the greeting or in the signature
- feat(ketik): pace the AI consumer like a person: back-to-back agent messages are read and answered once, the reply waits for reading then typing time (shown as typing only after reading), speed varies by consumer type, and "is this clear?" check-ins get an honest, type-specific answer
- feat(ketik): make the AI chat consumer behave like a real person: it never helps, corrects or hints the agent, reveals details only when asked (with or without a script), follows per-type behavior with chat-style examples, and the angry type stays hard to calm with template empathy; default scenarios get a short backstory and the unused /ketik/simulation page file is removed
- fix(profiler): require a target folder in the add form instead of saving into "Batch 1", scale the participant slide to fit laptop and phone screens without clipping (exports stay full size), count system teams in Kelola tim, show jabatan labels in selects, and say that sensitive data appears on slides and exports
- refactor(telefun): remove the conversation challenges feature (settings section, prompt block and the session's disruption_config); saved challenge choices are ignored and dropped on the next save
- feat(telefun): make the AI consumer behave like a real caller: it never corrects or hints the agent, angry and rushed types may interrupt and stay hard to calm, holds are always accepted but in the type's tone (one refusal allowed from the second hold), and the app tells the AI each hold's number and whether it ran too long
- fix(ai-usage): cost PDKT attachment images at Google's image-output rate ($60 per 1M tokens for Nano Banana 2) instead of the $3 text rate, so Monitoring matches the bill
- fix(ai-usage): count Gemini thinking tokens (thoughtsTokenCount) as output tokens so Monitoring cost matches what Google bills
- feat(ai-models): run the SIDAK dashboard forecast narration on Gemini 3.8 Flash and remove the unused free-form POST /v1/ai/generate endpoint and its ai.generate capability
- feat(ai-models): limit KETIK and PDKT model choices to Gemini 3.8 Flash and Gemini 3.5 Flash Lite; older saved choices move to Flash Lite (if they were Flash-Lite) or Gemini 3.8 Flash, enforced on the server for new sessions
- perf(sidak): add a (tahun, id) index on qa_temuan for the dashboard's year-filtered keyset paging
- perf(sidak): load the dashboard with keyset paging, in-memory staff exclusion and one rule-version read per service, and make a month range narrow the agent table and Pareto too
- refactor(api): move the Telefun voice-scoring handler and its helpers out of the 1,054-line recordings route into recording-scoring.ts without changing responses
- refactor(monitoring): move the history table cell renderers and session-count cards out of the 1,121-line HistoryTab without changing its markup
- refactor(api): split the 1,054-line profiler service into folder, team and participant modules behind the same import path, without changing behavior
- refactor(telefun): split the 1,291-line usage logger into live Gemini, retired OpenAI and shared store modules behind the same `usage.js` entry, without changing behavior
- refactor(sidak): move the agent HTML report stylesheet and SVG chart builders into their own modules without changing the generated report
- refactor(pdkt): split the 1,361-line simulation workspace into review-polling and delete hooks, a replay mapper and workspace state views without changing behavior
- fix(telefun): count "panggilan bulan ini" on the server via GET /telefun/sessions/month-count (the list stops at 50 rows), show "–" when the count is unavailable, and stop logging the full call config to the browser console
- refactor(sidak): split the 1,564-line agent report PDF generator into theme, text, layout and chart modules without changing its output
- fix(telefun): keep a trainer note in the form when saving fails, list coaching recommendations most urgent first, show moment labels instead of raw keys, and keep at least one consumer character
- chore(telefun): delete the retired OpenAI Telefun code no production entrypoint imports (WebSocket adapter, tool coordinator, voice assessment, scoring-audio, rollout gate, browser WebRTC session/recording/interruption modules) and their unit tests; the owner-bound DELETE cleanup path is untouched
- fix(telefun): keep only unsynced calls in the local history copy so deleted sessions stop reappearing, refresh the Telaah recording link on every expiry with a visible retry when it keeps failing, and show hold times on the recording clock
- chore(workflow): exempt Dependabot-authored commits from the changelog gate so its update PRs can pass CI and be merged directly
- chore(deps): apply the pending Dependabot minor/patch updates (genai, hono node-server, supabase-js, zod, TanStack, base-ui, framer-motion, lucide, Playwright, Vite, Prettier, typescript-eslint and more) and supabase/setup-cli v3 in CI
- fix(api): key the per-IP rate limit on the rightmost X-Forwarded-For hop Railway appends, so a caller rotating a fake leftmost value can no longer bypass the 200/min limit
- test(ketik): type the worker-host activation cases as Record<string, string> so the e2e typecheck (and CI verify) passes again
- fix(telefun): match content-review quotes on whole words only, so a short quote no longer anchors inside another word on the wrong line
- fix(telefun): delete sessions the server no longer has, keep history working when localStorage is full, download recordings as real files, and resolve the assessment model from ai-models.ts
- fix(telefun): keep Telaah replay audible during mute — only the agent mic is off then, so muting playback dropped the consumer's voice; holds stay silent
- feat(tna): mark the current Asia/Jakarta month as "berjalan" — no trend percentage or candidates from it, a running-period banner, and /tna defaults to the latest completed period via GET /tna/periods
- docs(ketik): record the prod activation of the embedded KETIK review worker
- feat(ketik): run the review worker inside the API process behind KETIK_REVIEW_WORKER_ENABLED, and let the API exit after SIGTERM
- docs(db): record the prod rollout of 20261017150000 (settle_ketik_review no longer writes results)
- test(db): allowlist the 11 by-design service_role-only KETIK RPCs in the D5.1 exposed-function guard
- fix(db): stop settle_ketik_review writing the legacy results table, which failed every KETIK review publish
- test(e2e): mock the KETIK landing history summary in usage.spec so the hermetic guard passes
- fix(e2e): keep the browser E2E /api proxy off :3001 and guard remaining production paths
- chore(workflow): require a CHANGELOG.md entry in every commit, enforced by a pre-commit hook and CI
- docs(db): record prod migration-history repair and closed parity gaps (`abe9862b`)
- fix(db): capture prod-only profile guard, activity-log and updated_at triggers, and results (`d0f0b341`)
- feat(telefun): record mute intervals and mute replay during them (`cb45466a`)
- docs(telefun): correct hold-mute clock skew evidence (`442f4421`)
- fix(telefun): mute replay during hold intervals (`593f6e0a`)
- fix(sidak): capture prod-only trg_fill_tahun on qa_temuan (`87604dc4`)
- fix(sidak): write qa_temuan.tahun on batch insert and backfill NULLs (`9131e344`)
- test(sidak): self-seed SLIK fixtures in real-backend E2E specs (`a4c910fd`)
- fix(sidak): give new rule indicators a master id and reject invalid batches (`c62e4f85`)
- chore(sidak): split audit registry/matcher module and format SIDAK docs (`ddda8a27`)
- docs(sidak): record 8.58% fallback after komunikasi_layanan (`357795b2`)
- feat(sidak): add komunikasi_layanan root-cause cluster for Call findings (`de5b7513`)
- docs(sidak): record 17.70% fallback after scoping proses_ideb_slik to slik (`58de5ded`)
- fix(sidak): scope proses_ideb_slik root cause to SLIK findings (`cffd5d26`)
- docs(sidak): record 17.24% fallback after proses_ideb_slik (`d86a9b58`)
- feat(sidak): add proses_ideb_slik root-cause cluster (`24935f62`)
- chore(sidak): opt-in fallback sample texts and indicator names in coverage audit (`6fc879f5`)
- feat(sidak): add hold_waktu_tunggu root-cause cluster (`b3dc7110`)
- fix(pdkt): secure history and recover simulation failures (`f61906bd`)

## 2026-10-16

- chore(claude): standing authorization for commit/push/merge and local terminal (`dd49b2fa`)
- fix(pdkt): fit the landing demo pause button inside its 44px bar (`579efa4f`)
- test(pdkt): mock requireCapability in evaluate-route test (`18c87a6c`)
- docs: align PDKT and Telefun review guidance (`5818d4a8`)
- fix: clarify Telefun and PDKT review evidence and navigation (`ebdfeb89`)
- feat(sidak): Periode QA shows finding counts and blocks deleting used periods (`4cce9dd3`)
- fix(ketik): ground review feedback and restore historical attachments (`ba14be05`)
- feat(ketik): add durable asynchronous review worker (`3572fd60`)
- fix(ketik): count-up simulation timer and gender-true consumer portrait (`2dbeaab0`)
- feat(sidak): Input temuan ticket list, delete dialog and labels follow the mockup (`bec5199e`)
- feat(sidak): agent detail sidebar, tab count and filters follow the mockup (`5a1aeccb`)
- feat(sidak): close remaining mockup gaps and drop the Ringkasan page (`af5e50ec`)
- feat(sidak): redesign pages to follow the SIDAK mockup (`5451c676`)
- feat(ketik): secure server sessions and paginate history (`63785527`)

## 2026-10-15

- feat(landing): bottom-center Scroll link and a peeking Modul heading (`717ff0d9`)
- fix(telefun): line times per speaker turn, large caller data, plain spider (`a60b943c`)
- feat(telefun): spider profile, clickable markers, line onsets, waveform (`00822c2d`)
- feat(telefun): settings tabs follow the KETIK design (`8488ed75`)
- feat(telefun): replace the radar with a "Target vs hasil" list in Telaah and Monitoring (`e76cda05`)
- fix(telefun): faster Telaah ulang with a wait panel, required annotation fields, "Filler" label (`1b1ca453`)
- docs(telefun): neutral wording in the real-AI check note (`64fde181`)
- docs(telefun): record the post-deploy real-AI check owner (`88b14657`)
- test(telefun): cover content-review quote validation and Telaah ulang recovery (`14b5d8bf`)
- feat(telefun): Telaah content annotations and Telaah ulang (`323eeb18`)
- test(telefun): open the end-call confirmation before confirming in the cleanup retry test (`d2a8a42b`)
- feat(telefun): Telaah stage, softphone call screen, data landing, Riwayat page, and settings redesign (`c835851b`)
- feat(ketik): Telaah ulang for completed reviews (`309facd3`)
- feat(ketik): Telaah annotations for case core, consumer questions, and agent sentences (`10a97113`)
- feat(ketik): Telaah stage, quiet chat, data landing, Riwayat page, and settings redesign (`a233ac01`)

## 2026-10-14

- fix(pdkt): stop forwarding raw provider errors from template and email generation (`42e17412`)
- fix(pdkt): 44px controls, coded telaah errors, and plain backend copy (`751bbd59`)
- feat(pdkt): open replied emails as email, Telaah behind an explicit button (`d6c956f2`)
- fix(pdkt): keep Telaah jump links from scrolling the app shell (`f103f0d4`)
- fix(pdkt): drop technical codes from review text and plain-language prompt rules (`de631645`)
- fix(pdkt): retry empty consumer points, link fix steps to reply, humane review notes (`d7997726`)
- feat(pdkt): consumer points, transition notes, and deduplicated findings in Telaah (`26710ab9`)
- feat(pdkt): URL-backed workspace navigation and correct practice-again attribution (`d0d29cff`)
- test(monitoring): assert the current landing heading after session expiry (`38372c42`)
- fix(web): raise the text floor to 12px per docs/design.md (#70) (`ac150bf5`)
- fix(pdkt): Telaah audit fixes — linked reply marks, one comparison surface, 44px controls (#69) (`bf60b81d`)
- feat(pdkt): side-by-side Telaah and required reply marks (#68) (`0c166ae7`)
- chore: add landing page mockup and ignore local tool state (#67) (`94b7bbdc`)
- perf(tna): load evaluation period options with a light audit-presence query (#66) (`be739a1e`)
- feat(tna): phase 2 post-training evaluation (#65) (`dbf8bfe3`)
- feat(pdkt): tighten the landing page and explain the PDKT name (#64) (`0946caa3`)

## 2026-10-13

- feat(pdkt): history page, consistent copy, and AI-slop cleanup (#63) (`5efef24b`)
- feat(pdkt): show AI usage as a small popover from the landing menu (#62) (`5429428b`)
- PDKT: redesign the Pahami, Tanggapi, and Telaah stages from the mockup (#61) (`8272570f`)
- PDKT: edit scenarios on a single page (#60) (`a9905a09`)
- PDKT: redesign landing page and settings from the approved mockup (#59) (`85db80c7`)
- PDKT: close scenario data leak, grade hidden OJK requests, mark reply sentences (#58) (`12ce799a`)
- feat(sidak): count dashboard findings per parameter and per ticket (#57) (`95d163d1`)
- feat(web): YTD month range and smooth trend chart on Beranda (#56) (`4ba57ab2`)
- feat(web): match the Beranda mockup with a compact trend card (#55) (`c78d7bd6`)
- feat: role-aware Beranda with a home/attention endpoint (#54) (`3c1a3095`)
- feat(web): labeled sidebar shell with a single role-aware nav model (#53) (`4de2cb03`)

## 2026-10-12

- feat(web): redesign public landing with split-flap boards (#52) (`9f40096b`)
- test(tna): isolate metric fixtures from seeded audits (#51) (`842273e2`)

## 2026-10-10

- docs(db): record CI replay and production ledger entry for 20261010120000 (#50) (`ed1c2222`)
- fix(db): add coaching summary annotation columns on clean replay (#49) (`6eb4527b`)
- fix(ketik): make the session replay an accessible modal dialog (#48) (`23842cff`)
- ci: pin Supabase CLI version (#47) (`42075ff7`)
- chore(deps): bump the prod-minor-patch group across 1 directory with 2 updates (#7) (`d315c99f`)
- chore(deps-dev): bump the dev-minor-patch group across 1 directory with 3 updates (#13) (`df4d6804`)
- chore(deps): bump actions/setup-node from 4 to 7 (#6) (`0b23c34e`)
- chore(deps): bump pnpm/action-setup from 4 to 6 (#5) (`e3c42115`)
- chore(deps): bump actions/checkout from 4 to 7 (#4) (`2ba5e7c9`)
- docs(plan): record blocking CI replay pass (`bd370fda`)
- fix(db): let a clean migration replay pass and make the CI replay blocking (`56d32a18`)
- fix(e2e): load apps/api modules inside the env pin in SIDAK real-backend specs (`87f1cd74`)
- fix(web): ignore API specs in browser E2E config and fix landing contrast (`33dff102`)
- docs(sidak): record Jadwal Shifting trainer smoke test in production (`bcdc273d`)
- docs(sidak): record Jadwal Shifting production verification for admin (`11578172`)
- fix(sidak): use the QA target 95 for Agents directory score color (`1bcd4200`)
- fix(e2e): isolate browser E2E from production services (`1ccc40a7`)
- docs(db): drop stale T6 next steps after PR #38 merge (`97b5d119`)
- docs(db): record executed production rollout and post-rollout verification (T6 §3b) (`b72db4a3`)
- docs(db): T6 handoff report with production preflight evidence (`59f34a80`)
- fix(db): guard service-role RPCs instead of revoking EXECUTE (`78277ed5`)
- feat(sidak): finish minor polish on Agents, SIDAK home, and Jadwal Shifting (`766c404c`)
- feat(sidak): polish Ranking, Heatmap, and Reports Data filters (`d50a02d2`)

## 2026-10-09

- ci(migrations): make clean-replay step advisory (`c2cb37a8`)
- chore(claude): add guardrail hooks, migration CI job, and workflow skills (`7477f92b`)
- feat(sidak): redesign Forecast page (`e8c670db`)
- feat(sidak): redesign Periode QA page (`e42c256e`)
- feat(sidak): redesign Parameter QA settings and fix version bugs (`0c3c098e`)

## 2026-10-08

- feat(sidak): redesign Input Temuan as a single work screen (`0aecf458`)
- docs(tna): record production migration apply (`327a8529`)
- feat(tna): add Training Needs Analysis module phase 1 (`ef24e29c`)
- docs(plans): add SIDAK Input and Settings redesign plans (`fc6dccc4`)
- chore(sidak): remove unused Reports AI feature (`bf5bc6f9`)
- test(web): replace heatmap spec timers with response gates (`5ec827c8`)
- test(web): make jadwal-shifting loading state test deterministic (`03de77f4`)
- chore(web): drop stale ParetoChart mock from SIDAK filter test (`e3802396`)
- fix(web): raise Ketik and PDKT accent contrast (`d27a17f3`)
- fix(web): add on-accent text token for Telefun buttons (`9130d7d4`)
- fix(api): stop sending temperature to Gemini (`44505cfd`)
- fix(web): use Telefun module token for accent colors (`1eb97e59`)
- fix(web): remove nested main landmarks from shell pages (`182c2d87`)
- fix(web): remove nested main landmark on dashboard (`de803d53`)
- chore(web): remove unused SIDAK ServiceBarChart and FatalDonutChart (`f26ba776`)
- fix(web): raise chart legend text contrast to 4.5:1 (`c46e1a8d`)
- fix(web): raise chart axis label contrast to 4.5:1 (`9e0a2f10`)
- chore(web): remove dead layout code (`f64ea30f`)
- fix(web): apply 11px text floor to Dashboard trend panel (`c3ff8a9a`)
- fix(web): apply 11px text floor to layout and sidebar (`c30e53b5`)
- fix(web): finish 11px text floor in Profiler workspace and table (`a92f6889`)
- fix(web): apply 11px text floor to Profiler import (`50ecd4ce`)
- fix(web): apply 11px text floor to PDKT (`57685e4b`)

## 2026-10-07

- fix(web): apply 11px text floor to KETIK (`0be873a8`)
- chore(web): remove unused Monitoring HistoryCard (`5103d42c`)
- fix(web): apply 11px text floor to Monitoring (`35032ebe`)
- fix(web): apply 11px text floor to Telefun (`356a8b8c`)
- fix(web): enforce 11px text floor (text-xs + SIDAK) (`747b8006`)
- fix(web): raise contrast of fg3, Telefun and Profiler tokens (`737b6da9`)
- chore(ci): hold vitest 5.0.0-5.0.3 and @types/node 23+ in Dependabot (`02b664ba`)
- docs: add 2026-10-06 dependency and security audit log (`972c76aa`)
- test(web): add useSearch to router mock in sidak-filter-pairing (`0dcd7a36`)
- chore(web): remove unused ParetoImprovementInsight (`aa8db05f`)
- test(web): move dashboard trend forecast jsdom specs to E2E (`af3212d9`)
- fix(web): open SIDAK ranking with the linked service and year (`1621fa48`)
- test(web): move stale SIDAK jsdom specs to E2E; drop dead ParetoChart (`e8043e73`)
- ci: skip the non-E2E test step until approved (`cd163383`)
- ci: add verify workflow + dependabot (`edacbabf`)
- chore(tooling): declare engines.node >=22.12 in every workspace (`609a9cc6`)
- chore(tooling): pnpm 11.5.1 -> 12.9.1 + fix advisory pnpm 11 audit missed (`0d10b9ff`)
- test(api,web): repair stale tests broken by the data-scope refactor (`3506035c`)

## 2026-10-06

- chore(deps): cn 0.2.6 -> 0.4.0 (apps/web) (`25df48a8`)
- chore(deps): @testing-library/jest-dom 6.9.1 -> 7.0.1 (apps/web) (`ceccc6e4`)
- chore(deps): jsdom 29.1.1 -> 30.1.2 (apps/web devDependency) (`31f6ef46`)
- chore(deps): typescript 5.9.3 -> 7.0.2 (side-by-side TS6 API for lint) (`ed5fd219`)
- chore(deps): zod 3.25.76 -> 4.6.5 + @hono/zod-validator 0.9.1 (`1641a702`)
- chore(deps): lucide-react 0.475.0 -> 1.52.0 (apps/web) (`5b1d9919`)
- chore(deps): framer-motion 12.39.0 -> 14.0.0 (apps/web) (`ffdd7aa5`)
- chore(deps): drop unused ecc-universal devDependency (`d4d7b86b`)
- chore(deps): minor/patch bumps across workspaces (`0a441e4d`)
- fix(deps): patch prod security advisories (pnpm audit --prod 26 -> 0) (`191dc605`)
- feat(web): redesign management pages; make activity logs append-only (`19aec69a`)
- docs(db): record accepted Telefun RLS policy drift (`4556ddb6`)
- fix(db): drop Telefun policy rewrites from role migration (`ccbba7c8`)
- docs(access): document capability matrix and execution log (`681413e9`)
- test(e2e): cover role matrix, data scope and per-role navigation (`9f7dab74`)
- refactor(web): drive guards, navigation and controls from capabilities (`d087e50c`)
- refactor(api): gate routes by capability and centralize data scope (`2edf818c`)
- feat(db): restrict profile roles to the four application roles (`36cf4d61`)
- feat(types): add canonical role and capability catalog (`a04b608c`)
- feat(sidak): make agent report downloads human readable; replace CSV/MD with Excel (`9ad7eea9`)
- chore(agents): add project skill adapters for workflow tools (`75d90469`)
- fix(profiler): label solo teams and clear stale slide participant (`ea05fca8`)
- fix(profiler): raise row menu items to 44px touch targets (`39fb88e5`)
- feat(profiler): render stats, slides and export as workspace tabs (`34818c95`)
- feat(profiler): redesign workspace into library nav + batch roster (`17fbedc1`)
- feat(sidak): replace yearly monthly bars with weekday pattern (`aafbe38e`)

## 2026-10-05

- fix(sidak): clarify heatmap insight copy (`ddf75717`)
- feat(sidak): redesign agent detail with profile sidebar (`a1e8e0be`)
- feat(sidak): redesign dashboard into focused summary layout (`fbd4ffdd`)

## 2026-10-04

- fix(sidak): reset temuan accordion on context change (`87c012a5`)
- fix(sidak): improve heatmap insight copy (`3595149d`)

## 2026-10-02

- docs(plans): close plan 025 as partial, split 026/027, deliver monitoring spec (`2a3e3645`)
- test(e2e): migrate replaceable web unit tests to hermetic Playwright specs (`94f0384e`)
- feat(sidak): heatmap per-tiket, insight lengkap, dan heatmap per-agent (`1c921979`)
- feat(sidak): derive heatmap intensity legend from data (`498ffa67`)
- docs(plans): add PDKT cleanup guard role-claim plan (`7b2ab8b3`)
- fix(pdkt): read service-role claim from request.jwt.claims in subject intent cleanup (`0a783826`)
- feat(sidak): add business dates and heatmap calendar (`33f1d761`)

## 2026-10-01

- Improve SIDAK agent detail hierarchy (`e3084083`)
- docs: streamline Pi harness workflow and cache guidance (`a112fcd7`)

## 2026-09-30

- fix(sidak): lay out the schedule calendar with CSS instead of JS measurement (`8d5bfcc6`)
- fix(sidak): compute the calendar height from content coordinates (`b9e8795c`)
- fix(sidak): measure the calendar against the scroll area, not the window (`2b6cf322`)
- fix(sidak): measure the calendar room instead of reserving a fixed gap (`05793bb2`)
- test(sidak): assert the calendar scroller contract across nine viewports (`4a6b0427`)
- fix(sidak): shrink calendar height floor so the scroller stays reachable (`12f1041a`)
- fix(sidak): close thermo-nuclear gate findings on ordering and layout (`2220a2e8`)
- fix(sidak): lead ordering with service and make the calendar scroller usable (`66c8641d`)
- feat(web): self-host fonts and enable Content-Security-Policy (`510187bd`)
- docs(deployment): kembalikan formatting tabel lama, sisakan tambahan header hardening (`7b638b5d`)
- fix(web): activate security headers that Vercel was silently dropping (`f3e9be5c`)
- test(sidak): reject leftover Masuk/Libur panels in Hari ini (`6be0712e`)
- feat(sidak): make Hari ini table-only and order rows by shift (`582c931c`)
- fix(sidak): harden shifting order grouping after thermo-nuclear gate (`e8bf6b0a`)
- feat(sidak): group daily shifting list by service and team leader (`010e3611`)

## 2026-09-29

- feat(sidak): add WFM shifting schedule workspace (`721cc870`)
- feat(dashboard): refresh quality trend layout (`538335cf`)

## 2026-09-28

- feat(sidak): improve agent report exports (`3c01368c`)
- docs(sidak): clarify historical export plan status (`87b65ffe`)
- docs(sidak): document agent report export contracts and test curation (`8194587c`)
- feat(sidak): professional agent report exports and E2E (`db2d4964`)

## 2026-09-27

- fix(sidak): align reports data Excel cells with UI (`8866306e`)
- feat(sidak): clarify actionable reports data and E2E coverage (`6a8cb88a`)

## 2026-09-25

- chore(tests): audit and curate unit tests for relevance and coverage (`386305aa`)
- feat: Refactor Telefun identity and scenarios tabs for improved layout and consistency (`bdbbc192`)

## 2026-09-24

- refactor(telefun): improve layout and accessibility of Telefun system settings (`4f0ab899`)
- refactor(pdkt): enhance layout and structure of scenario wizard and email settings (`3f644221`)
- refactor: streamline PDKT scenario wizard and enhance expected-answer evaluation (`c2dca227`)
- test(web): tambahkan audit aksesibilitas axe-core (`c9f076d6`)

## 2026-09-23

- docs(pdkt): track scenario UX implementation plans (`adeb9fbf`)
- feat(pdkt): clarify AI and manual scenario email flows (`e60b5715`)
- docs: update product definition (`3eeee67c`)
- fix(telefun): simplify call history actions (`0977e2c6`)

## 2026-09-22

- fix(sidak): align ranking scope and movement status (`5dedbc47`)
- fix(telefun): silence recording during mute and hold (`29439902`)
- docs(sidak): document responsive comparison table (`039cf7f9`)
- fix(sidak): keep agent comparison table within viewport (`49e404cb`)

## 2026-09-21

- feat(telefun): expand Gemini Live voice catalog (`772ee0cc`)
- feat(telefun): add Gemini 3.8 Live default (`7435db07`)
- Refine SIDAK agent filters and typography (`df0455c9`)
- Improve SIDAK agent directory grid (`ab94183c`)

## 2026-09-17

- refactor(sidak): reduce forecast UI density (`57df012f`)
- fix(sidak): preserve mix phantom history by service (`c89e6336`)
- fix(monitoring): improve tab and history table usability (`edae5d37`)

## 2026-09-16

- feat: Update MonthRangePicker and DashboardTrendPanel for improved UI consistency and compact design (`2b74de24`)
- feat: Enhance PDKT mailbox and simulation features (`2bf14c59`)

## 2026-09-15

- chore(workflow): tegaskan gerbang lane Pi, rapikan plan & turbo (`294cfd16`)
- fix(profiler): seragamkan tinggi kartu grid & ukuran avatar peserta (`e7161e58`)
- test: add unit test for MoveFolderModal to verify footer visibility with long folder list (`1866a1c8`)
- feat: align UI components with shadcn design system across multiple routes (`6713105a`)

## 2026-09-13

- feat: add Telefun readability tests and align UsageModal with shadcn standards (`aab59fbe`)

## 2026-09-12

- feat: align KETIK UI with shadcn/ui components (`ca55ba36`)
- feat: align Profiler subroutes with shadcn/ui design system (`7105b324`)

## 2026-09-11

- feat: add Combobox component with various subcomponents for enhanced UI interaction (`c48faaa9`)
- feat(sidak): refine agent directory presentation (`f08217b9`)
- feat(sidak): refine agent detail presentation (`4d7d4a81`)
- feat(ketik): add global and personal quick templates (`b7205f95`)

## 2026-09-10

- feat: add SIDAK agent simulation history functionality (`76153cf1`)
- Refactor code structure for improved readability and maintainability (`220e2dcd`)
- test(profiler): add test for participant options retrieval through profiler route (`b379c748`)
- feat(migrations): add simulation_subject_attribution and cleanup function for mailbox subject intents (`ecf8970a`)

## 2026-09-08

- docs(telefun): record production worker retirement (`ad71b0a5`)
- docs(telefun): remove rollout log trailing whitespace (`e7157cf7`)
- Implement Phase 216: Telefun In-Process Scoring Worker Enhancements (`0af05084`)

## 2026-09-04

- fix(ketik): revert minute-aware pacing to 1-20s responses (`ae9f867a`)

## 2026-09-03

- docs(phase-213): record gemini-3.8-flash pricing apply to production (`7c320bca`)
- feat(ai): swap default text model to gemini-3.8-flash + pricing migration (`ebcdbcd0`)

## 2026-08-23

- refactor(billing): unify AI pricing constants into @trainers/types (`a634671f`)
- docs(plans): add 018 execution notes, mark 018 DONE and 019 blocked-upstream (`2ae678b4`)
- refactor(web): unify spreadsheet IO onto exceljs, drop frozen xlsx package (`03c605ab`)
- test(e2e): fix deleted email, add mockAuth helper and magic link flow (`a8d1f317`)
- fix(web): correct PdktEducationSections doc comment and unused key assignment (`2b9f2644`)
- fix(pdkt): harden buildPdktEdu against malformed scoreBreakdown (`9386e0d4`)
- chore(graphify): update code graph after education layer batch (`8582579d`)
- test(web): fix 8 stale Telefun tests + impeccable audit fixes for education UI (`0d30fbef`)
- feat(edukatif): add education layer to Ketik/PDKT/Telefun evaluations (`f1c9e026`)

## 2026-08-22

- feat: enhance AGENTS.md and AGENT_WORKFLOW.md to enforce TDD loading for behavior changes (`dcc53497`)
- feat: update KETIK and PDKT panels to prevent duplicate consumer card rendering (`89a6bf55`)
- fix(tsconfig): resolve apps folder red in vscode - fix vite moduleResolution and dedupe @types/node (`c35f3594`)
- feat: add image alt support for scenarios and update related components (`9d4a6baa`)

## 2026-08-21

- feat(pacing): implement minute-aware pacing with fast same-minute option and add tests (`6c11ccbd`)
- fix(telefun): mute benar-benar senyapkan track mic agar rekaman agent tidak bocor saat evaluasi AI (`17c5dcbb`)
- feat: expand consumer dummy database KETIK/Telefun/PDKT (variasi tidak itu-itu lagi) (`56d57846`)
- fix: correct AI pricing to official rate cards (Gemini 3.7/3.5 + OpenAI) (`1cd3b754`)
- fix: adjust alignment of message panel in ChatInterface component (`dcf4fdfc`)
- fix: correct alignment of message bubbles for agent and user in KetikMessageBubble component (`135f4dc9`)
- feat: enhance UI components and improve accessibility in Ketik and PDKT modules (`4631a2f2`)
- feat: integrate TelefunMotionFrame component and enhance UI for phone simulation training (`c5879a8d`)

## 2026-08-20

- feat: update motion frame component and adjust layout for improved UI clarity (`dd53357c`)
- feat: replace ModuleWorkspaceIntro with KetikMotionFrame component for enhanced UI experience (`04e5b948`)
- feat: enhance voice quality assessment feedback and scoring criteria in Telefun analysis (`5597a5e8`)
- feat: update default AI model references to Gemini 3.7 across various components and tests (`d75d0810`)
- feat: update Gemini model references from 3.6 to 3.7 across tests and documentation (`140ac63e`)
- feat: add temperature support handling for reasoning models in OpenAI and AI model registry (`56ae6ce0`)
- feat: implement historical OpenAI Realtime model handling and cleanup (`5e93decf`)
- feat(tests): add OpenAI playback tests for watchdog behavior and response handling (`6b49bdac`)

## 2026-08-19

- feat(vercel): add README and project.json for Vercel configuration (`5a50a1ea`)
- fix(telefun): raise instruction length limits to 48k to match prompt builder (`64c505df`)
- feat(telefun): production feedback, scoring worker, Mini WebRTC (Trains A+B) (`60bd0082`)

## 2026-08-15

- perf(tests): curate fast/core test tiers and parallelize web workers (`be544638`)

## 2026-08-14

- fix(telefun): harden WebRTC phase 7 merge (`a30b9bcf`)

## 2026-08-13

- chore(graphify): refresh WebRTC interruption graph (`eaa7e6e3`)
- fix(telefun): avoid WebRTC double truncation (`2d980aa8`)
- chore(graphify): refresh WebRTC response graph (`4ae22351`)
- fix(telefun): enforce single-owner WebRTC responses (`929a427c`)

## 2026-08-12

- fix(telefun): allow production exact-cohort WebRTC (`376b0ca2`)
- fix(telefun): serialize WebRTC response creation (`34c94697`)

## 2026-08-11

- fix(telefun): align WebRTC persona and identity parity (`86c3ab53`)
- docs(telefun): record Phase 7 staging evidence (`2f3c225f`)
- feat(telefun): add WebRTC Full parity controls (`7c72a4fd`)
- docs(telefun): record successful paid re-smoke (`b3fda062`)
- fix(telefun): coalesce overlapping call starts (`b7c5ed89`)
- fix(telefun): repair WebRTC lease renewal (`f8d9cec1`)
- docs(telefun): record provider-free staging deployment (`929d53a1`)
- chore(graphify): refresh WebRTC dependency graph (`2b2545ba`)
- docs(telefun): record Phase 6 and production evidence (`eaf0c794`)
- test(web): add provider-free Chromium SDP gate (`c0cd6b10`)

## 2026-08-10

- fix(telefun): preserve WebRTC SDP and redact diagnostics (`8e9fdc36`)
- fix(telefun): trace WebRTC termination owners (`66b1a958`)
- fix(web): CSP media-src izinkan Supabase Storage utk playback rekaman (`00ad9e35`)
- fix(db): mark_telefun_recording_uploaded scoring_status ambiguous — kualifikasi v_session (`411a974d`)
- fix(web): webrtc broker fetch Illegal invocation — receiver binding (`4dbad96c`)
- fix(web): webrtc client observability + error code kategori + prevent overwrite (`8a5a8663`)
- fix(web): serve.json CSP google fonts + cache immutable asset (`77f326d4`)
- fix(telefun): webrtc no-attempt finalization + observability + size guard (`93e2a38b`)
- fix(web): telefun error mapping akurat — mic literal hanya untuk error mic (`cca72bb1`)
- feat(telefun): webrtc prompt parity — kirim live_prompt_instructions dari web ke OpenAI Realtime (`735332ba`)

## 2026-08-08

- feat: humanize UI copy for SIDAK agent directory and detail (`992dd3e7`)

## 2026-08-02

- chore: remove obsolete files and update .gitignore for new project structure (`306dbcb6`)
- chore(workflow): plans 013-017 — agent instructions, workflow lanes, orchestrator cost, test feedback, conditional knowledge tools (`474dc836`)
- feat(telefun): OpenAI WebRTC migration Phase 1-5 — POC to production hardening (`e3a307b5`)

## 2026-08-01

- fix(ui): konsolidasi design system & migrasi legacy palette ke tokens (fase 211) (`e356c918`)
- test(quality): hygiene suite — fix 20 failure, bersihkan parity/legacy, konsolidasi fragmentasi (`f36b8a96`)
- fix(security): resolve pnpm audit advisories and centralize test:core lists (`416846ac`)

## 2026-07-30

- fix(monitoring): lengkapi penilaian AI dan data konsumen di Riwayat Simulasi (`2f7892a5`)

## 2026-07-29

- fix: harden ketik and pdkt scenario image saves (`bc68733d`)

## 2026-07-28

- fix(sidak): align agent HTML reports with live view (`ba26c7d9`)
- fix: implement retry logic for PDKT evaluation invalid output (`1123599f`)
- feat: normalize 'pasrah' consumer difficulty to Hard and update related prompt guidance (`4f709457`)
- docs: note PDKT scenario identity override (`32a81630`)
- feat: add optional identity schema to PDKT scenarios and update prompt scenario schema (`901ad1cb`)
- feat: enhance evaluation response normalization and update scoring logic (`078093d7`)

## 2026-07-27

- feat: Refactor AI model capabilities and integrate OpenAI support (`7ccabcdb`)
- feat: add tests for Telefun scenario description without character limit (`1856e0da`)
- Refactor code structure for improved readability and maintainability (`b5c3679a`)
- feat: refactor PDKT scenario editor into a three-step wizard (`fe8f1964`)
- Refactor code structure for improved readability and maintainability (`e0826ef2`)

## 2026-07-26

- feat: Implement Telefun persona prompt improvements with enhanced guidance and stability (`16a9510d`)

## 2026-07-22

- fix(pdkt): update prompt budget to 200,000 characters and adjust related tests and documentation (`33de9964`)
- feat(pdkt): Implement prompt contract and remediation based on audit findings (`a8e8fc06`)
- refactor(ReviewModal): remove voice dashboard metrics and related UI elements (`3534be61`)
- fix(telefun): align end-call runtime with audit (`5d8318de`)

## 2026-07-21

- docs(ketik): document send-while-loading guardrail (`c02671d2`)
- fix(ketik): allow sending while consumer is typing (`8e0bc93d`)
- feat: enhance communication profile metrics and improve filler handling (`4102e90f`)

## 2026-07-20

- Implement requested application updates (`46674f75`)
- feat: enhance KETIK prompt limits and implement chat message compaction logic (`f3dfa529`)
- feat: add resolution score to ketik review and history (`ca0bdb06`)
- fix(telefun): run production server with tsx (`d732a347`)
- Add audit report for Telefun system prompt (`45157866`)
- feat: implement Telefun OpenAI readiness service and dual-provider architecture (`4d135a36`)
- docs: specify Telefun OpenAI voice gender parity (`75b7e3a8`)

## 2026-07-17

- Implement code changes to enhance functionality and improve performance (`4b370cf1`)
- feat(sidak): show agents sharing ranking positions (`a854b02a`)
- feat: include fallback label for inactive indicators in agent detail (`537f8348`)

## 2026-07-16

- feat: add agent detail ranking and forecast quickview (`92c4b11d`)
- docs(sidak): clarify least-findings quickview rank (`f952082e`)
- docs(sidak): design agent ranking forecast quickview (`4582af98`)
- feat(sidak): add hierarchical SLIK QA parameters (`a5eb1427`)
- Add tests and utility functions for SIDAK report data processing (`7c7f8018`)
- feat: add feature request for agent detail export in CSV, MD, and HTML formats (`f6e29930`)
- docs(sidak): plan HTML report variants (`405477ff`)
- docs(sidak): design interactive and static HTML reports (`47666483`)

## 2026-07-15

- Prioritize stronger root-cause matches in SIDAK clustering (`2bd02b6f`)

## 2026-07-14

- feat(docs): update architecture, database, deployment, and module documentation (`8f99533f`)
- feat(profiler): add upcoming birthdays endpoint and service functionality (`50f1f6fa`)

## 2026-07-13

- feat(telefun): enhance local history validation and management with corruption guard (`dd2f4f25`)
- Harden Telefun auth flow and session finalization (`b7523dc2`)
- Refine Telefun prompt-first runtime and session cleanup (`728c31c2`)

## 2026-07-10

- feat(telefun): implement simulation challenge handling and improve API validation (`03c8c6c1`)
- refactor(telefun): move conversation challenges into prompt (`98d08149`)
- Refactor SIDAK root-cause ticket evidence display (`15e0a5fd`)

## 2026-07-09

- feat(sidak): enhance agent root cause analysis with new ticket reference handling and improve UI components for better clarity (`1d655115`)
- feat(sidak): enhance agent root cause analysis with ticket references and improve UI components for better visibility (`63cfccae`)
- feat: add agent comparison table to SIDAK agent detail view (`c4543eeb`)
- feat(sidak): redesign SIDAK agent detail with new AgentAuditDossier component, enhancing layout and functionality (`2d6e36f5`)
- feat(sidak): add audit-root-cause-coverage script for measuring SIDAK QA coverage (`2dc78f3f`)

## 2026-07-04

- feat(sidak): enhance agent classification with findings slope and update tests (`f8ef3886`)

## 2026-07-03

- fix: update label for stability indicators to "Stabil/Stagnan" (`ec67d59c`)

## 2026-07-02

- feat: add support for PDF attachments in PDKT scenarios (`b099da1c`)
- Refine SIDAK forecast controls and coverage (`ab39d8cc`)

## 2026-07-01

- feat(sidak): add forecast submodule with folder-aware filters and enhance access-groups (`a7efd332`)
- Normalize SIDAK service scope to allowed leader service (`7c54486d`)

## 2026-06-30

- feat(access-groups): enhance team rule selection with subfolder support (`76dfd2f9`)
- Add SIDAK forecast module card (`ddf3daae`)
- Add SIDAK forecast route and agent forecast types (`7d7f404f`)
- Prevent selected service reset during stale agent detail load (`cee36844`)
- Fix SIDAK agent directory latest period selection (`04ce4b7c`)
- feat: add forecast visibility toggle (`41d9684c`)
- feat(sidak): add folder-aware filters and navigation (`805bdeb8`)

## 2026-06-28

- chore: update docs, AGENTS.md, design artifacts & graphify (`15ffadda`)
- refactor(ketik): chat interface visual refinement (`7f953d73`)
- refactor(pdkt): email interface redesign + evaluation (`e75fcad7`)
- feat(pdkt): scenario editor wizard (`e589dba7`)
- feat(pdkt): multi-recipient email targets (`6e61a3df`)

## 2026-06-26

- fix(sidak): guard empty counts in automatedCoaching useMemo (`eb983f43`)
- fix: skip unresolved indicators instead of falling back to 'Unknown' (`fcc04336`)
- fix(sidak): ganti filter bulan UUID range (.gte/.lte) ke period ID membership (.in) (`59ad3c67`)
- feat: add 'Logout dari Semua Perangkat' (revoke all sessions) feature (`3e139a35`)
- fix(telefun): block agent & leader from Telefun, allow agent on PDKT (`5834e3a0`)
- fix(ketik): add leader to role allowlist on POST /generate (`f3019490`)

## 2026-06-25

- feat: add Cache-Control headers for root and assets (`34ea338c`)
- fix: use routes + filesystem handle for proper SPA static asset serving (`bdbd5c01`)
- fix: exclude /assets/ from Vercel SPA rewrite to prevent CSS preload failure (`5e35ceac`)
- Phase 207 — Security headers, auth RLS fix, CORS hardening, KETIK duration UX & dep bumps (`e8c4bd9c`)
- Refactor SIDAK input flow and scoring parity (`c89b87d0`)

## 2026-06-23

- Clarify Telefun fillers radar target guide (`94d70893`)
- fix(telefun): prevent early 15 minute self-close (`c81366c5`)
- Prevent Telefun AI audio overlap on turn transitions (`aca0bac4`)
- Refine Telefun fillers scoring and docs (`94e3288b`)
- Restrict Telefun recording playback to signed URLs (`095a46e5`)

## 2026-06-22

- fix(telefun): repair seek & scoring production lifecycle contract (`f590013e`)
- fix: hide mobile sidebar and ignore root env files (`da0411c3`)

## 2026-06-21

- Refine settings modal typography and contrast (`6204fbfd`)

## 2026-06-20

- docs: add Contrast & Readability Rules to design docs (`4997218c`)

## 2026-06-19

- fix(pdkt): add agent role to frontend route guards for PDKT (`67102f46`)
- fix(pdkt): add agent role to PDKT allowedRoles in app-config (`2cd2b6ba`)
- feat(telefun): add context-window per-turn billing and per-minute audio cost (`5bedb9e4`)
- fix(telefun): clean up storage files during bulk history delete (`f191bf79`)
- feat(telefun): add FFmpeg server-side remux for seekable audio recordings (`814bbe31`)
- feat(telefun): skip maintenance warning for admin/trainer roles (`7a4c9e9c`)
- feat(types): add gemini-3.1-flash-live-preview to model registry (`c20e6667`)

## 2026-06-18

- chore(types): remove deprecated gemini-2.0-flash-lite model (`f162285b`)
- feat(telefun): add per-modality billing tracking for Gemini Live API (`9dc70243`)
- fix(billing): singleton upsert pattern + legacy fallback + MiMo model migration (`66cc4b2e`)
- fix: show all available service types regardless of folder filter (`34fff978`)
- fix: restore getSoftDeletedPesertaIds to return empty array (`5be50b60`)
- fix: use trainer_id in getSoftDeletedPesertaIds agent-directory.ts (`314d3eb6`)
- fix: add CORS headers to onError handler as safety net (`a453fd37`)
- fix: use trainer_id instead of user_id in profiler_peserta queries (`017437c9`)
- docs: update AGENTS.md with pagination fix and RPC migration details; add .hermes to .gitignore (`e558bf04`)
- fix(final-audit): propagate SIDAK metadata query errors (`750f001f`)
- fix(final-audit): harden scoped pagination and DB error propagation (`7156a48e`)
- fix(review): propagate DB errors instead of silently swallowing in ranking and leader-access services (`77652c88`)
- test(api): cover access groups count view (`bd3799fa`)
- refactor(api): migrate access groups counting to view (`c1260ba7`)
- feat(db): add access groups count view (`7162ced3`)
- test(api): add leader scope snapshot rpc integration coverage — deviation: cannot run locally (no .env.integration / Supabase bootstrap unavailable) (`98a5344d`)
- refactor(api): migrate leader scope snapshot to rpc (`cfb8bf9a`)
- feat(db): add leader scope snapshot rpc (`dff1372f`)
- test(api): cover profiler folder counts rpc mapping (`53ba6f5f`)
- refactor(api): migrate profiler folder counts to rpc (`84c97f40`)
- feat(db): add profiler folder counts rpc (`0ffaec2d`)
- test(audit): add high-risk pagination regressions (`26e464c7`)
- fix(audit): harden pagination ordering and helper usage (`bbbecc95`)
- fix(multiple): paginate Wave 4 backlog risk queries to prevent 1000-row truncation (`4c6c5cab`)
- fix(profiler): paginate Wave 3 admin workflow queries to prevent 1000-row truncation (`da0a8ba2`)
- fix(sidak,admin,profiler): paginate Wave 2 list/filter/count queries to prevent 1000-row truncation (`edeab669`)
- fix(sidak): paginate getAgentDetail and apply startMonth/endMonth filter that was being ignored (`d3e4b850`)
- fix(sidak): paginate refreshDashboardSummary to aggregate all findings per period (`7e51c96b`)
- fix(sidak): paginate getDataReportRows to prevent 1000-row truncation in chart/AI report (`74ae4213`)
- feat(api): add fetchAllPages generic pagination helper (`27ac4411`)
- fix(sidak): paginate getDashboardData qa_temuan query to prevent 1000-row truncation (`45d79b55`)

## 2026-06-16

- dokumentasi: update AGENTS.md Phase 203 + rebuild log untuk DeepSeek Direct Provider (`3c14456f`)
- dokumentasi: update AGENTS.md Phase 97 follow-up — middle clause weaving refactor (`70c56b10`)
- dokumentasi: update AGENTS.md Phase 202 + rebuild log untuk OpenRouter Error Refactoring & DeepSeek Models (`d4282951`)

## 2026-06-15

- dokumentasi: update AGENTS.md Phase 201 + rebuild log untuk SIDAK Dashboard & Ranking Default Filter Pairing (`4627f2c8`)
- dokumentasi: update SIDAK_LOGIC_AND_SCORING.md, AGENTS.md Phase 200, dan rebuild log untuk parameter normalization & three-block layout (`2c0fbe4f`)
- dokumentasi: tambah aturan wajib referensi design.md di AGENTS.md + dokumentasi Phase 199 finding delta semantics (`901a8a9a`)

## 2026-06-14

- dokumentasi: update architecture.md, SIDAK_LOGIC_AND_SCORING.md, AGENTS.md untuk forecast snapshot & stale attention (`2b2f4ed4`)
- docs: record stale forecast attention behavior (`24f14cc8`)
- feat: highlight stale SIDAK forecasts (`3e747eb6`)
- feat: detect stale SIDAK forecast snapshots (`67938cab`)
- fix(web): decouple sidebar rail active state from flyout open state (`58b70fd8`)
- dokumentasi: update phase progress and add rebuild log untuk UI Radical Redesign Wave (phase 197) (`7bc50a36`)

## 2026-06-13

- feat: landing page hero stack animated states (Phase 196 enhancement) (`671c6104`)
- feat: landing page hero stack cards (Phase 196) (`3fd3fe38`)
- docs: add design.md guidelines based on landing page overhaul (`7b9a57f7`)
- style: remove AI slop badge from AuthModal (`f3b08658`)
- fix: auth modal dark mode selector (`bf76c28b`)
- chore: redesign auth modal to match landing page concept (`fab66f3d`)
- feat: KETIK/PDKT mobile responsive enhancement (Phase 195) (`52b51669`)
- docs: update phase progress and landing page redesign log (`a7e41428`)
- fix: add allowedHosts for dev tunnel and CORS fallback for dev mode (`dae22cce`)
- feat: add mobile bottom tab bar navigation (`85ff3ebe`)

## 2026-06-12

- fix(eslint): relax no-restricted-imports to only block deprecated wrapper functions instead of entire useApi hook (`d4025a6b`)
- chore: telefun UI fixes + MV QA security test (`73e5cc4d`)
- feat(db): add rollback for all 39 migrations + fix RLS recursion (`6d6325c4`)
- fix(profiler): await rpc responses and document CORS fix (`09f22d49`)
- chore: ignore tsconfig.tsbuildinfo (`3bba67a3`)
- chore: tambah P1 plans + integration test scripts (`df492964`)
- docs: update docs untuk RPC migration + integration tests + rebuild logs (`4096e7c8`)
- feat(db): tambah migration scoring lifecycle + retry queue + tighten RLS (`b9923c1c`)
- chore: update config files for Hono RPC migration (`e6ff8011`)
- test(web): tambah Telefun end-call + finalizer tests (`21ac6771`)
- test(api): tambah PDKT mailbox RPC integration tests (`e62a6600`)
- feat(api): Telefun scoring retry queue + end-call idempotency (`1ad5d690`)
- feat(api): simplifikasi PDKT evaluation + tambah KETIK/PDKT service tests (`37bee640`)
- feat(web): migrasi Dashboard & Monitoring ke Hono RPC (`d20b285a`)
- feat(web): migrasi SIDAK module ke Hono RPC (`f68aa25d`)
- feat(web): migrasi Telefun module ke Hono RPC (`9ea1795d`)
- feat(web): migrasi KETIK module ke Hono RPC (`d23b9257`)
- feat(web): migrasi PDKT module ke Hono RPC (`188282c2`)
- feat(web): migrasi hooks ke Hono RPC (`2db7b473`)
- feat(web): migrasi lib services ke Hono RPC (`9a77dc5f`)
- feat(web): add Hono RPC client foundation (rpc-client + unwrap-response) (`c3edc708`)
- docs: update AGENTS.md dengan migration status RPC (`6886459e`)
- chore: tambah ESLint gate no-restricted-imports untuk hooks/useApi (`fd1e72e6`)
- test(web): migrasi monitoring-unauthorized-parity ke mock lib/api (`3962070c`)
- test(web): bersihkan dead mock functions wrapper useApi — access/sidak (`a55ac0f0`)
- test(web): bersihkan dead mock functions dari wrapper useApi (`9060df30`)
- feat(web): hapus wrapper functions dari useApi.ts (`43954636`)

## 2026-06-11

- fix(telefun): update lifecycle schema test for retry queue compatibility (`cd2e620e`)
- docs: add P1.6 telefun scoring retry queue rebuild log (`ca9d2470`)
- feat(telefun): auto-enqueue scoring on recording save + status-aware UI (`69caacd2`)
- feat(telefun): add durable scoring retry service and worker (`5b819922`)
- feat(telefun): add scoring error classification and exponential backoff (`e3829262`)
- feat(telefun): add scoring retry queue migration with next_attempt_at column (`9202e5c0`)
- chore: move plan from .herpes/ to .hermes/plans/, add .herpes/ to gitignore (`930c4c3d`)
- fix(p0): telefun coaching summary rpc contract - remove p_user_id, sha256 checksum, drop legacy overload (`9896b235`)

## 2026-06-10

- docs: add Phase 192 rebuild log for KETIK/PDKT custom scenarios draft payload (`0c1cb367`)
- docs: add missing rebuild log references for Phases 188-191, fix range (`0f0f5bf0`)
- fix(ketik,pdkt): support custom scenarios & consumer types via draft payload (`11dcb8b9`)
- fix: resolve tab text overlap in ReviewModal — add shrink-0, gap-6, scrollbar-hide (`73c8eed9`)
- fix(telefun): handle Gemini serverContent.interrupted for turn boundary (`39c62af8`)

## 2026-06-09

- docs: update AGENTS.md with Phase 191, fix doc numbering (`32eb0f61`)
- fix(telefun): transcript ordering & graceful shutdown drain (`aaa6768c`)
- feat(telefun): speaker & timestamp transcript from Gemini Live events (`b8562278`)

## 2026-06-08

- docs(sidak): Phase 188 Agent Detail zero score cache remediation + dokumentasi (`60413baa`)
- feat(sidak): add Pareto improvement insight with RCA analysis (`9670778d`)
- feat(admin): consolidate leader access cards with grouped UI (`14ef10a3`)

## 2026-06-07

- feat: implement 4-tier test strategy (targeted/core/fast/full) (`e510f33f`)

## 2026-06-06

- docs: Phase 186 Telefun Metrics Trust Boundary — dokumentasi + key files (`b805df9e`)

## 2026-06-05

- fix(telefun): refine assessment robust validation and hold caching (`e4d9b4ff`)
- feat(telefun): enforce frontend assessment trust boundary (`9a63faec`)
- feat(telefun): enforce backend assessment trust boundary (`1ef94579`)
- refactor(telefun): add canonical assessment parser (`55190a66`)
- test(telefun): characterize assessment trust boundary (`196cccd4`)
- docs: Phase 185 Monitoring History Delete Atomicity (`9af89773`)
- Telefun Hold Overtime & Deterministic Assessment (`019c29ee`)
- feat(vercel): backup deploy plan — SPA rewrite, OAuth callback route, CORS docs (`15cffb99`)
- feat(telefun): live reconnect lifecycle, AudioWorklet, 4-phase timing cues — server reconnect with backoff/session resumption, AudioWorklet mic processing with ScriptProcessorNode fallback, 4-phase time cues (2min/1min/30s/20s), keepalive ping (30s), prompt builder removed AI time limit, stalled watchdog threshold increase, docs update (Phase 123) (`0df8fbec`)
- fix: set framework null for static SPA on Vercel (`311a0654`)
- fix: use -w flag for root script in monorepo (`7fde7bc8`)
- fix: use explicit pnpm run for Vercel build command (`9fbde24e`)
- Add Vercel deployment support (turbo.json env + vercel.json + docs) (`7de0eff7`)
- docs(graphify): update AGENTS.md, GEMINI.md, graphify knowledge graph, and rebuild logs for Phase 121-122 (`f644eb63`)
- feat(telefun): implement telefun ai assessment radar consistency and cache normalizers (`aa8e4520`)
- fix(waiting-approval): prevent excessive Supabase polling — 5 min interval + visibility check (Phase 119) (`7b3bfb47`)
- feat(telefun): realtime microphone waveform with useMicrophoneActivity hook (Phase 120) (`c2db7d20`)

## 2026-06-04

- fix(telefun): Ursa voice fallback & performance — canonical voice registry, lazy review/chart, throttled audio (Phase 118) (`0544c044`)
- fix(ktp): canonical profiler-foto storage bucket — fix trainer manual input photo upload (Phase 117) (`8fc2b29f`)
- Phase 116: Telefun disable silence & dead-air detectors (`d948fbfd`)
- fix(ketik): [NO_RESPONSE] tag leak — defense-in-depth strip (`8b33d2e0`)
- fix(telefun): gender-first identity, orchestrator removal, audio encoding, radar fix (Phase 114) (`e617d07e`)
- docs(rebuild-logs): add Phase 113 profiler slides label fix (`f50dc4ea`)
- feat(profiler): EditPesertaModal tab-based layout redesign — 4-tab segmented form with animated transitions (`32c8e4e2`)
- docs: update AGENTS.md with Phase 111 & 112; add Phase 112 rebuild log (`247f0b16`)
- refactor(telefun): replace scattered failure flags with FinalizerStatus object (`e6ea4e0b`)
- feat(sidak): dashboard summary consistency fix — real-time scoring engine replaces MV/cache chain (Phase 110) docs(rebuild-logs): add Phase 110 SIDAK dashboard summary consistency fix docs: update architecture, database, scoring, and audit docs for Phase 110 test(sidak): add multi-period range summary test; refactor MV fallback test graphify: update knowledge graph for Phase 110 changes (`3a381a7f`)
- docs: update AGENTS.md with Phase 108 & 109; add rebuild logs docs(rebuild-logs): add Phase 108 SIDAK dashboard trend toggle & total temuan filter docs(rebuild-logs): add Phase 109 SIDAK agent score caching & score card UI overhaul feat(sidak): agent detail MV score caching with fallback (Phase 109) feat(sidak): SidakInputScoreCard UI overhaul — SVG ring, glassmorphism, live badge (Phase 109) test(sidak): update input parity tests for new score card UI (Phase 109) (`deb0b199`)

## 2026-06-03

- feat(sidak): toggle parameter trend chart show/hide with rotation animation (`8ae2d01c`)
- feat(sidak): add total temuan filter button (`9db2c86a`)
- feat(pdkt): evaluation sharing access fix for shared mailbox (Phase 107) (`c34a1ac2`)
- fix(pdkt): post-Phase 106 refinements — history ownership, skeleton loading, mailbox limit (`50a74f03`)
- feat(pdkt): bulk delete & soft delete RPC COALESCE fix (Phase 106) (`59bc42b2`)
- feat(pdkt): shared mailbox ownership with role-based delete auth (Phase 105) (`f2e212e2`)
- docs: update AGENTS.md with Phase 105 entries docs: add rebuild log for Phase 105 SIDAK RCA BKO tooltip fix feat(sidak): ParetoChart tooltip upgrade with full parameter names, category colors, No Category legend test(sidak): add ParetoChart component tests and dashboard parity tests (`c0877d45`)
- chore: pnpm 11.5.0→11.5.1 packageManager bump (`e9c22d41`)
- chore: turbo v2.9.14→v2.9.16 upgrade & sidak input BKO parameter fix (`a83e18e0`)

## 2026-06-02

- feat(sidak): dashboard KPI delta & compliance sparkline fix (Phase 103) (`de38eaed`)
- feat(sidak): parameter period isolation & rule version resolver (Phase 102) (`8f64044a`)
- refactor(sidak): input selection grid & card extraction (Phase 101) (`8995bb3b`)
- chore(graphify): update knowledge graph for Phase 100 changes (`24bd5e23`)
- feat(profiler): reorder auth fix, grid view, and API transport cleanup (Phase 100) (`ac75c78c`)

## 2026-06-01

- docs: remove RTK section from GEMINI.md, add Logout Guest Lock to auth-rbac docs (`aa9acc53`)
- feat(extract): AI usage categories, summary service, and KETIK review state machine (`622cc910`)
- docs: update AGENTS.md and GEMINI.md for Phase 98 (`47099bfb`)
- feat(pdkt): natural name context clues, structured AI image diagnostics (`670e924b`)
- refactor(pdkt): full route + service + frontend decomposition (Phase 96) (`21462899`)
- docs: update AGENTS.md and rebuild log for Phase 95 remaining changes (`6b58f891`)
- refactor(ai): extract robust JSON parsing library and adopt across all AI services (`5f7dc90e`)
- feat(pdkt): AI image generation remediation with backend orchestration (`fb4f8e3f`)
- feat(pdkt): settings modal visual polish alignment (`340e4439`)
- Harden PDKT consumer name and realistic mode (`16bb87a0`)
- feat(fallback): broaden placeholder handling and unify retry path (`90d15e5d`)
- feat(fallback): implement identity and company context fallback for KETIK, PDKT, and Telefun (`b9fff713`)
- feat(ai-usage): post-session detail breakdown by category (`cf7f6123`)
- feat: refine ai usage reporting (`0420c922`)
- fix(pdkt,ai-usage): handle PGRST204 schema cache and verify mailbox batch contract (`8f81fafe`)

## 2026-05-31

- chore(graphify): update knowledge graph after code changes (`ad9a38b5`)
- docs: update phase-90 docs, remove temp_plan.md (`4fa3fb65`)
- docs: sync architecture.md and README with phase 90 - types barrel, rebuild-logs range, test counts (`d17c7ce4`)
- docs: record phase 90 mega maintainability refactor and sync AGENTS.md (`a81d401a`)
- chore: upgrade pnpm 9.0.0 → 11.5.0 (`29655512`)
- docs(settings): record phase 88 normalization hardening and sync graph (`ec68b713`)
- docs: update AGENTS.md with phase 87 canonical commit + scenario script stale guard fix (`deebcd20`)
- docs(settings): record phase 87 canonical save refactor and sync graph (`a1bcac4d`)
- refactor(telefun): coerce settings parser boundaries (`49ebeef3`)
- test(telefun): cover settings parser coercion (`e2abc596`)
- refactor(settings): remove duplicate collection draft helper (`5f901057`)
- refactor(settings): type ketik template draft saves (`a3787426`)
- refactor(settings): route tab saves through crud form (`4ac92220`)
- refactor(settings): centralize draft item defaults (`6b1c11f1`)
- refactor(settings): allow normalized crud draft saves (`9cf5cd29`)
- test(settings): cover canonical crud draft commit (`1f5c9be1`)
- Phase 86: Settings Draft Type Safety Hardening (`bcdb1ca8`)
- refactor(settings): clean up settings type assertions and refresh graph (`34a5d34e`)
- docs: record phase 85 quality gate hardening (`5d0a9bbc`)
- chore: clear decomposition quality gates (`bc4c0191`)
- refactor(sidak): centralize input rule model (`ff5e2077`)
- docs: update knowledge graph after refactoring settings tabs (`af3234c4`)
- refactor(settings): remove cast-heavy duplicate save logic using applyCollectionDraft helper (`d0b47a8a`)
- refactor(settings): make draft commits immutable (`3d253602`)
- feat(phase-84): SIDAK input hooks decomposition (`18fa82dd`)
- feat(phase-83): settings modal full decomposition into per-tab sub-modules (`e667a15f`)
- feat(phase-82): KETIK service decomposition into 5 sub-modules (`fcc9bf24`)

## 2026-05-30

- feat(phase-81): KETIK ChatInterface message utils & pacing extraction (`e2a12d1b`)
- feat(phase-79): SIDAK route full decomposition (`d139ebc8`)
- feat(phase-78): extract SIDAK AI report + folders/agents from route to sub-modules (`9e16fbb7`)
- refactor: simplify sidak service barrel file and deduplicate service trends aggregation (`d9816364`)
- docs: update AGENTS.md with complete SIDAK decomposition docs (13 sub-modules + math-utils + structural tests) (`4082347e`)
- fix(test): increase ketik-settings-modal template test timeout to 15s (`61e33470`)
- fix(packages/types): add type:module export (`371707cb`)
- fix(types): circular dependency between index.ts and ai-models.ts causing Railway deployment crash (`75683360`)
- chore: sync graphify graph after GEMINI.md update (3425 nodes, 5967 edges) (`e0a4e102`)
- docs: add graphify rules to GEMINI.md (parity with AGENTS.md) (`1728bf82`)
- feat: graphify knowledge graph integration - install, build, AGENTS.md rules, .gitignore (`743d4a1d`)
- feat(phase-75): maintainability refactor — SIDAK service decomposition, Telefun API adapter, shared AI registry, settings modal decomposition, Telefun recording fix (`836aba8a`)
- feat(sidak): display current month next to agent score percentage (`3dc0523f`)
- fix(sidak): restore Top 5 month sync and stabilize web tests (`df95abd8`)

## 2026-05-28

- feat(monitoring): remove redundant category filter buttons on token usage tab (`d033d365`)
- docs: add pre-push checklist rule (lint → build → test) to AGENTS.md (`97cf2fc7`)
- feat(monitoring): redesign history layout to spacious paginated table view and add dynamic growth KPI cards (`da151192`)
- docs & feat: phase 71 monitoring redesign and visual polish (`e7a289b8`)
- docs: monitoring telefun history schema fix — align queries to Vite columns (`8324d0f3`)
- feat: monitoring page redesign — chat-first detail panels, Telefun recording & score normalization (`419fd35e`)
- docs: replace ECC default with Superpower Skill, keep ECC for complex tasks (`da398b84`)
- feat: AI usage cost breakdown in module usage buttons & modals (`877622f0`)
- fix: AI usage delta timing — KETIK/PDKT/Telefun review cost capture (`bc29252c`)
- docs: update Phase 67 rebuild log with Hono Variables generic fix (`b14a6c96`)

## 2026-05-27

- fix: PDKT mailbox error handling, API env bootstrap, and docs update (`ddc085a8`)
- fix: KETIK review progress stuck at 5% and scores always 0 (`c3f192a3`)
- fix: replace upsert with select-then-insert in triggerKetikAIReview, add unique index migration (`40b7e354`)
- fix: extract fenced JSON from AI response, add errorMessage to status, fix env bootstrap path (`aaa6d5f1`)
- fix: reclaim stale queued/expired jobs, await processing, add polling timeout (KETIK review V2) (`70ff9a50`)
- fix: repair KETIK AI analysis failure - sanitizer opt-out, canMarkFailed, route job state, provider fallback, status reconciliation (`69b61cb4`)
- feat: add UI/UX Pro Max skill (install + docs) and gitignore .opencode/ (`49738f0d`)
- fix: wrap Mermaid edge label in quotes to fix GitHub parse error (`4869fd53`)
- fix: add simulation_duration column to ketik_history to fix session save failure (`df279832`)
- docs: update Phase 65 rebuild log with post-commit fixes (remove limit, subtitle context, index fix) (`f007b513`)
- fix: resolve index is not defined error in Sidak Ranking view (`b1bd0e6d`)
- feat: display previous rank context subtitle under rank change badges (`16336bdb`)
- feat: remove 20-agent limit from Sidak Ranking API (`0ab85264`)
- docs: add rebuild logs for Phase 64 & 65 (ranking filter fix + rank change indicator) (`3274d9e7`)
- docs & feat: enable monthly rank change indicators (Phase 65) (`aa11545a`)
- docs: sync GEMINI.md with AGENTS.md, add RTK rules section (`b31914db`)
- docs & feat: implement YTD Agent Ranking position change indicator (Phase 65) (`2d46d634`)
- docs & feat: fix monthly Agent Ranking month filter bug (Phase 64) (`9892c86e`)
- feat(sidak): Sesi Tanpa Temuan legacy parity (phantom padding) (`935baf02`)
- docs: rewrite README in Indonesian (`37794436`)
- fix(sidak): ranking service filter shows all available services, not just Call (Phase 62) (`3c217a12`)
- fix(phase-60): resolve Railway build errors and 2 pre-existing test failures (`a42b8a6e`)
- phase-61: SIDAK Input Period + Temuan Legacy Refresh (`b2995a8f`)
- feat(sidak): fix Top 5 Pengurang Skor Terbesar with full legacy parity (Phase 60) (`24d1578f`)

## 2026-05-26

- fix(sidak-input): add missing ArrowLeft import causing Railway build failure (Phase 58a) (`3f237447`)
- feat(sidak-input): restore visual & navigation parity with legacy (Phase 58) (`db6a4f2d`)
- fix(migration): add deduplication DELETE before creating unique index (`d61731f5`)
- feat(sidak-import): fix duplicate detection, no_tiket passthrough & reverse crash (Phase 57) (`95b7d15e`)
- fix: cast ServiceType[] to string[] in includes check for TS strictness (`2d06c30a`)
- feat(leader-scope): harden folder/service scope visibility with shared snapshot, KTP metadata scoping, SIDAK service_type enforcement, and frontend normalization (Phase 56) (`947a15d2`)
- feat(telefun): communication profile radar chart 2-series with AI insight and zoom modal (Phase 55) (`c5cc0a6c`)
- feat(mv-security): terminal re-harden mv_qa_period_summary after contract restore (Phase 54) (`29dd011e`)
- fix(leader-access): shared approval resolver, scope parity for module=all, route guard bypass fix (`ca25c506`)
- fix: LeaderAccessGate light mode readability - use CSS variable tokens (`7585947c`)
- fix: upgrade LeaderAccessGate UI, add leader to PDKT, remove QA from PDKT (`a9beba8e`)
- feat(approval): leader KTP backend scope filter, access-status API, and frontend gate (`bef2cfe4`)
- fix(auth): use VITE_APP_URL for reset password and OAuth redirectTo (`631baa9f`)
- fix(phase-51): guardResetPassword blocking active users + PASSWORD_RECOVERY race condition (`8eaeb041`)
- phase-51: auth login, reset redirect & approval guard hardening (`14f6433f`)
- docs: replace Superpowers with ECC plugin in AGENTS.md (`2db2e381`)
- feat(phase-50): Railway Login Non-Admin E2E Fix (`719f22df`)
- fix: TS build errors in synthetic mailbox replay item (`44ded142`)
- phase-49: PDKT legacy parity hardening (`e36e654c`)
- phase-48: KETIK Legacy Parity Upgrade -- 3-tier time instruction, strictScriptMode, allowSolutionAcknowledgement (`f6677c02`)
- docs(telefun): add dead-air double-fire hotfix to phase 47a rebuild log (`13e17b1e`)
- fix(telefun): disable manual dead-air detection when realistic mode orchestrator is active (`49c2ec01`)
- feat(telefun): call UI parity, legacy prompt builder, replay annotation generation & service hardening (phase 47a) (`d83bc38c`)

## 2026-05-25

- feat & fix(telefun): functional hardening, legacy parity V2, utility gaps closure, and test coverage (phase 47) (`8eef8f14`)
- docs & feat(telefun): stabilize end-call lifecycle & finalize hardening (phase 46) (`a09b98e7`)
- docs & feat(telefun): production voice save repair and session finalizer (Phase 45) (`b90c9f7e`)
- docs & feat: implement Telefun Railway force-close and legacy parity fix (`79675537`)
- chore: ignore supabase config.toml and .gitignore from CLI (`624fecf7`)
- feat(telefun): add consumer_phone and consumer_city columns migration (`4efd4724`)
- fix: add favicon.ico and link tag to prevent decode warning (`5dd1aa67`)
- docs & feat: phase 43 telefun schema fix and recharts dimension guard (`87c9381b`)
- docs & fix: implement logout redirect fix and route guards hardening (Phase 42) (`a284f173`)
- docs: comprehensive deployment guide — railway env vars, cors, rebuild logs phase 40-41 (`8d0c4f91`)
- feat(deploy): guard against vite dev server on railway — prevent OOM exit 137 (`a3915a7a`)
- feat(deploy): railway healthcheck hardening — lock root start to web-only, add smoke test, service-specific scripts (`1e0cc228`)
- chore: remove hardcoded credentials from apply-migration.js, add to .gitignore (`db7bb785`)
- fix(deploy): use serve for web production, move tsx to api dependencies (`7fe5b417`)
- chore: remove global railway.toml for service-specific dashboard config (`a8597112`)
- fix: vite preview healthcheck port — explicit preview.port block for railway (`5a0955c5`)
- fix: use direct web start command in railway deploy, skip turbo rebuild (`2c6711dd`)
- fix: pin node.js to v22 via .node-version for railway/nixpacks (`6ef87c7a`)
- fix: phase-39 railway deployment OOM fix — vite preview in production (`985485cb`)
- docs: update README with project overview (`6e00fb65`)
- docs: add phase-37 database legacy parity audit log (`fbb63855`)
- feat: phase-38 database legacy parity remediation (`6931fe93`)

## 2026-05-24

- docs: fix AGENTS.md phase numbering (35=monitoring visual, 36=dashboard post-login) (`5cea7024`)
- feat(monitoring): unauthorized & visual parity fix (`80d1c68e`)
- feat(phase-35): dashboard post-login legacy parity (`8c3029b2`)
- feat(phase-34): monitoring & activity logs legacy parity (`09815371`)
- feat(phase-33): access approval & access group legacy parity hardening (`038d3d8f`)
- fix: fail-closed sidak period delete + docs phase 32 (`e1ff69da`)
- phase 31: dashboard user management legacy parity (`6fb0264a`)
- phase 30: sidak input stability & qa baseline recovery (`6968bfad`)
- feat: sidak agents load-more copy parity (`ac93fd43`)
- feat: phase 28 sidak ranking fatal legacy parity (`f8bb3f16`)
- feat: phase 27 sidak agent detail temuan history parity (`a91007f1`)
- feat: phase 26 sidak parameter legacy parity (`223a34cd`)
- chore: reorder setPage declaration before useEffect in SidakAgentsPage (`01293494`)
- feat: add Telefun maintenance warning gate with legacy parity (`2f7bb241`)

## 2026-05-23

- chore: commit pending sidak phases + docs update (`de8c41c9`)
- feat: multi-service separation for agent detail page (`1a3033d4`)
- docs: update test count, add phase 23 progress, update relevant files (`cad6c92f`)
- feat: profiler parity fixes + ui bug fixes + docs update (`69b986b0`)

## 2026-05-22

- feat: Telefun settings CRUD + UI overhaul (`0b60eec2`)
- feat: phase 22 telefun parity + prettier formatting & code refactor (`2e95ce89`)
- feat: role hardening + AI logging enhancement + showArchived filter (`067d2d1d`)
- fix: harden telefun replay and profiler integrity (`9593d960`)
- docs: update documentation for AI failure logging, MV, soft-delete exclusion + new migrations (`353c7e65`)

## 2026-05-21

- feat: hardening P0 — migration idempotency + API role enforcement + RLS gaps (`a9dad903`)
- docs: perbaiki path plan ke subfolder html/ dan markdown/ (`6ae02602`)
- docs: pertegas plan wajib di folder plan/, bukan di folder lain (`50271415`)
- docs: wajibkan referensi Superpowers Skills di setiap task (selain context7) (`cbefcb1f`)
- feat: add ESLint 9 flat config with typescript-eslint + react-hooks + react-refresh (`161bb699`)
- refactor: centralize auth profile fetching with fetchAuthProfile utility (`e18156cd`)
- feat: complete 5 frontend checklist items (change reason, preview, upload validation, telefun CRUD, DOCX export) (`f6ac3823`)
- docs: add Spec-Driven Development & dual-format plan rules to AGENTS.md and GEMINI.md (`c11fd12e`)
- fix: namespace PDKT settings under settings.pdkt to prevent overwriting KETIK settings (`b354240e`)
- KETIK UI rewrite, alert→notify sweep, project docs (`723cbe50`)
- Phase 19: Frontend checklist fixes (P0-P2) (`0bfeae90`)

## 2026-05-20

- fix: align KETIK duration with legacy (5/10/15 + custom); complete PDKT carbon copy parity (`97a4dd12`)
- test: add pdkt mailbox evaluation ux tests (`9260c09d`)
- feat: align pdkt mailbox evaluation ux with legacy (`5ae477aa`)
- feat: full KETIK carbon copy parity with legacy module (`b4875f11`)
- feat: centralize pdkt settings and session config (`c4d9041b`)
- feat: align pdkt ai generation with legacy (`b3e69f0d`)
- fix: align pdkt mailbox rpc contract (`508fdc33`)
- docs: map pdkt carbon copy gaps (`ec2af1cc`)
- feat: sync auth profile schema and role handling (`9d91c27d`)

## 2026-05-19

- db: scaffold carbon copy parity schema and rpcs (`26af6496`)
- feat: replicate admin user and group management features, add docs (`9cda42e1`)
- docs: update AGENTS.md, GEMINI.md + add phase-14 testing log (`e8af2974`)
- feat: add frontend component + hook tests (vitest + testing-library + jsdom) (`e16e3782`)
- feat: add vitest + 62 unit tests for scoring, sidak-service, profiler-service (`3dcfe6a7`)
- docs: update AGENTS.md, GEMINI.md + add phase-12 (polish) and phase-13 (perf) logs (`c7097f48`)
- perf: code splitting + lazy loading — reduce main bundle 79% (`a1735a22`)
- fix: Polish & QA — loading states, empty states, error handling, remove fake drag handle (`40cc4af4`)
- docs: update AGENTS.md + add phase-11 log for SIDAK Reports (`71d963ff`)
- feat: add SIDAK Reports module (data + AI) (`ecb63806`)
- chore: env config fixes + migration reorder (`5e76b4ed`)
- feat: frontend matching + profiler module (`0863ace4`)
- chore: add .vscode/, *.log, .DS_Store to gitignore (`95fbba3a`)
- Complete full rebuild: SIDAK Core, KETIK, PDKT, AI Monitoring, Excel Upload, Telefun WS, Hardening, Deployment (`15c248ce`)
- feat(web): implement dashboard layout and routing (`e95dd747`)
- feat(web): add dashboard route (`4987de5c`)
- feat(web): add landing page route (`db229205`)
- feat(web): setup root route (`0602901d`)
- feat(web): add DashboardLayout component (`3854f88c`)
- docs: synchronize documentation and plans with context7 requirement (`54bd04fe`)
- feat(web): implement auth store and supabase client (`39f29282`)
- feat(api): implement auth middleware and supabase admin client (`d295160a`)
- docs: create project-specific AGENTS.md synchronized with GEMINI.md (`c1a074a4`)
- docs: add PRD, specs, and implementation plans (`fbabd007`)
- feat: scaffold vite web with hono rpc client (`e4ad56fa`)
- feat: scaffold hono api with rpc export (`827ad900`)
- feat: add shared types package (`1e7d6c2f`)
- chore: initialize monorepo foundation (`7e4cea0d`)
- Initial commit (`1f070d14`)
