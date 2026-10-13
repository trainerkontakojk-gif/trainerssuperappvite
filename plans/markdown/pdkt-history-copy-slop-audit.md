# PDKT UI audit: copy + AI slop (read-only)

Worktree: `.claude/worktrees/pdkt-usage-popover` (branch `feat/pdkt-slop-copy-history`, base `5429428`).
All paths below are relative to `apps/web/src/` unless they start with `apps/`, `packages/` or `docs/`.
Excluded: `routes/pdkt/components/HistoryModal.tsx`, `routes/pdkt/history.tsx` (being rewritten). The only thing other files take from `HistoryModal.tsx` is the `SessionHistory` type; no strings are reused.
Sources read: `PRODUCT.md`, `DESIGN.md`, `docs/design.md` (§1–§8), `plans/markdown/pdkt-stages-redesign.md`, `plans/markdown/pdkt-history-copy-slop.md`.
I could not open the approved mockup (claude.ai Design artifact "Redesign PDKT"). Items that may be deliberate mockup choices are marked **verify against mockup**.

Priority: **P1** = user-visible and wrong, misleading, leaking, or blocking. **P2** = confusing or inconsistent. **P3** = polish.

---

## 0. PDKT glossary (one term per concept)

| Concept                                                       | Use                                                                                                             | Do not use                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Module name                                                   | **PDKT** (always uppercase)                                                                                     | Pdkt, pdkt                                         |
| The module / workspace                                        | **simulasi** (only for "Simulasi PDKT", "Mulai simulasi", "Simulasi email konsumen")                            | —                                                  |
| One email worked from creation to review                      | **sesi**                                                                                                        | simulasi, latihan (as a count)                     |
| Practicing as an activity                                     | **latihan** ("Progres latihan", "Riwayat latihan", "Latihan lagi")                                              | —                                                  |
| The three stages                                              | **Pahami, Tanggapi, Telaah** (capitalized as stage names); "tahap"                                              | step, langkah                                      |
| AI review of a reply                                          | **telaah / menelaah / ditelaah**; states: _Sedang ditelaah_, _Sudah ditelaah_, _Belum ditelaah_, _Telaah gagal_ | penilaian, dinilai, nilai (verb), evaluasi, review |
| The 0–100 number                                              | **skor**                                                                                                        | nilai, score                                       |
| Scored criteria                                               | **aspek**                                                                                                       | dimensi, kriteria                                  |
| Inbound email                                                 | **email konsumen**                                                                                              | email kasus, surel, inbound                        |
| The agent's text                                              | **balasan**                                                                                                     | respons, jawaban, reply                            |
| Email list                                                    | **kotak masuk**                                                                                                 | mailbox, inbox                                     |
| Unanswered state                                              | **Belum dibalas**                                                                                               | Menunggu balasan                                   |
| Expected answer (trainer-only)                                | **kunci jawaban**                                                                                               | jawaban yang diharapkan, jawaban benar             |
| Consumer persona                                              | **karakter konsumen**                                                                                           | tipe konsumen, karakteristik                       |
| Scenario                                                      | **skenario**                                                                                                    | case                                               |
| Email written by the trainer, identical for every participant | **email tetap** ("Ditulis sendiri" as a mode label)                                                             | template, templat, Template tetap                  |
| Email generated per session                                   | **Dibuat AI**                                                                                                   | AI generation                                      |
| Who the session counts for / who ran it                       | **peserta** / **pelaksana**                                                                                     | target, user, role                                 |
| Attachment                                                    | **lampiran**                                                                                                    | file, attachment                                   |
| Unsaved local text                                            | **draf**                                                                                                        | draft                                              |
| AI cost                                                       | **pemakaian AI**, **permintaan AI**                                                                             | panggilan, token, biaya sesi                       |
| Edit action                                                   | **Ubah**                                                                                                        | Edit                                               |
| Aspect labels                                                 | **Arah penerima · Kelengkapan jawaban · Kejelasan · Ejaan · Struktur balasan**                                  | Arah Penerima · Kualitas OJK · Typo · Template     |
| Ellipsis                                                      | **…** (one character)                                                                                           | ...                                                |
| Error sentence                                                | "{Objek} belum bisa {dimuat/disimpan/dihapus}. {Langkah pemulihan}." + **Coba lagi**                            | Gagal X!, raw server text                          |
| Missing subject                                               | **Tanpa subjek** (one constant, no parentheses)                                                                 | (Tanpa subjek), Tanpa Subjek                       |

Confirm "Kelengkapan jawaban" with the trainers before shipping it. "Kualitas OJK" may be a term from the QA form. Either way it needs a label that says what is actually scored: "kronologi, solusi, dan batas waktu".

---

## A. Copywriting findings

### P1

**A1. Mailbox load error is Title Case, shows the raw error, and traps the user** (`routes/pdkt/simulation.tsx:1045-1067`)

- Current: `Gagal Memuat Email` / `{error}` / `Coba Lagi`. `error` comes straight from `useApi` → `fetchApi`, so the agent can see "API tidak tersedia. Pastikan VITE_API_URL sudah benar dan ALLOWED_ORIGINS mencakup URL aplikasi ini." or "API Error" (`hooks/useApi.ts:26-35`). This branch renders without `PdktWorkspaceHeader`, inside the `fixed inset-0 z-[100]` layer (`index.tsx:524`), so there is no way back to the landing page.
- Why: developer jargon in front of agents; it does not name the problem or the way out; it is a dead end.
- Proposed: wrap the branch in the same `<main>` with `<PdktWorkspaceHeader mode="inbox" onBack={onBack} />`. Copy: title **"Kotak masuk belum bisa dimuat"**, body **"Periksa koneksi Anda, lalu coba lagi. Email yang sudah ada tidak hilang."**, button **"Coba lagi"**. Never render `{error}`; log it instead.

**A2. A failed review shows raw backend/provider error text** (`components/PdktReviewStage.tsx:322-327`; source `apps/api/src/services/pdkt/evaluation-service.ts:953` stores `err.message`; `simulation.tsx:935`)

- Current: title `Penilaian gagal`, body `{error || "Terjadi gangguan saat menilai balasan."}`. `error` can be "Evaluation failed without message", "Failed to save evaluation results", "Evaluation is already in progress", "format output AI untuk email awal tidak valid.", or a provider error string.
- Why: English internals reach agents; the glossary term is _telaah_; the copy offers no reassurance that the reply is safe.
- Proposed: title **"Telaah gagal"**, body (fixed, never the raw error) **"AI belum bisa menelaah balasan ini. Balasan Anda tetap tersimpan. Coba lagi dalam beberapa saat."**, button **"Coba lagi"**. Retry failure (`simulation.tsx:935`): **"Telaah belum bisa diulang. Coba lagi dalam beberapa saat."** Backend follow-up, out of this scope: store an error code, not `err.message`.

**A3. The partial bulk-delete toast exposes record UUIDs** (`simulation.tsx:979-983`; strings from `apps/api/src/services/pdkt/mailbox-service.ts:600-633`)

- Current: `"{s} email berhasil dihapus, {f} gagal."` with description `result.errors[0]`, for example "Email dengan ID 3f2a…-… tidak diizinkan untuk dihapus oleh Anda."
- Why: internal ID leak; the description does not say which email or what to do.
- Proposed: drop `result.errors[0]`. Show **"{s} email dihapus. {f} email tidak bisa dihapus karena hanya pembuatnya, admin, atau trainer yang boleh menghapus."** When nothing failed: **"{n} email dihapus."** On total failure (`:995`, and `:1010` for single delete): **"Email belum bisa dihapus. Coba lagi."**

**A4. Reply-send errors show backend messages as-is** (`simulation.tsx:892-894`; strings in `apps/api/src/routes/pdkt/route-utils.ts:132-176`)

- Current: `notify.error(err?.message || "Gagal mengirim balasan.")`. Agents can see "Email mailbox tidak ditemukan.", "Idempotency key digunakan untuk target berbeda.", "Data mailbox tidak valid.", "Sesi Anda telah berakhir. Silakan login kembali."
- Why: jargon (mailbox, idempotency key, target, login); the message never says that the draft is safe.
- Proposed: map by `ApiError.code` in the frontend. Fallback **"Balasan belum terkirim. Draf Anda masih tersimpan di perangkat ini; coba kirim lagi."** NOT_FOUND: **"Email ini sudah dihapus dan tidak bisa dibalas."** UNAUTHORIZED: **"Sesi masuk Anda berakhir. Masuk lagi, lalu kirim ulang balasan."** Also fix the backend strings (outside the PDKT web scope): "Email mailbox" → "Email", "login" → "masuk", and the idempotency message → "Permintaan ganda terdeteksi. Muat ulang halaman."

**A5. Hero promise "Kasus selalu baru" is false** (`routes/pdkt/index.tsx:44-48`)

- Current: `"Kasus selalu baru"`, `"Tanpa bocoran jawaban"`, `"Ditelaah AI"`.
- Why: scenarios in "Saya tulis sendiri" mode send every participant the same email (`ScenarioModeField.tsx:13`). PRODUCT.md requires every claim to be defensible.
- Proposed: remove the list (see B3). If one line must stay, use **"Kunci jawaban tidak pernah ditampilkan ke peserta."** That claim is accurate.

**A6. Missing space renders as "PilihAcak"** (`components/settings/PdktConsumersTab.tsx:185-188`)

- Current JSX: `…berlaku untuk semua skenario. Pilih⏎<span>Acak</span> supaya…`. JSX drops the trailing newline, so the page shows "PilihAcak".
- Proposed: **"Sifat dan gaya bicara konsumen yang menulis email. Berlaku untuk semua skenario. Pilih {" "}<span>Acak</span> agar peserta tidak bisa menebak karakter berikutnya."** (add an explicit `{" "}`).

**A7. Aspect labels mix Title Case, English, and a vague term** (`lib/pdkt-dimensions.ts:7-13`; echoed in `components/PdktStageDemo.tsx:12-16`, `PdktReviewStage.tsx:246-248`)

- Current: `Arah Penerima`, `Kualitas OJK`, `Typo`, `Template`. Other-findings kinds: `Typo`, `Kejelasan`, `Isi`.
- Why: these labels appear on every Telaah screen and in "Fokus berikutnya". "Typo" and "Template" are English; "Kualitas OJK" does not say what is scored.
- Proposed: **Arah penerima · Kelengkapan jawaban · Kejelasan · Ejaan · Struktur balasan**. Other-findings kinds: **Ejaan · Kejelasan · Isi yang kurang**. Demo bars: **Kejelasan · Kelengkapan jawaban · Ejaan**. The labels are shared with monitoring (`routes/monitoring/components/PdktEvaluationPanel.tsx`), so update those E2E assertions in the same change.

**A8. One concept, four verbs: telaah / penilaian / nilai / evaluasi**
Replace each of these:

| File:line                              | Current                                                    | Proposed                                                                       |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `MailboxSidebar.tsx:88`                | Penilaian gagal                                            | Telaah gagal                                                                   |
| `MailboxSidebar.tsx:110`               | Dibalas · belum dinilai                                    | Dibalas · belum ditelaah                                                       |
| `MailboxSidebar.tsx:118`               | Sedang dinilai AI…                                         | Sedang ditelaah…                                                               |
| `PdktReviewStage.tsx:323`              | Penilaian gagal                                            | Telaah gagal                                                                   |
| `PdktReviewStage.tsx:344`              | Penilaian belum dimulai.                                   | Telaah belum dimulai. (+ button, see A15)                                      |
| `PdktReviewStage.tsx:355`              | Sedang dinilai AI…                                         | Sedang ditelaah AI…                                                            |
| `PdktReviewStage.tsx:357`              | Halaman ini diperbarui otomatis setelah penilaian selesai. | Hasil telaah muncul di sini begitu selesai. Anda boleh kembali ke kotak masuk. |
| `ReplyComposer.tsx:169-170`            | …tidak bisa diubah dan langsung dinilai AI.                | Setelah dikirim, balasan tidak bisa diubah dan langsung ditelaah AI.           |
| `ReplyComposer.tsx:187`                | Kirim dan nilai                                            | Kirim balasan                                                                  |
| `simulation.tsx:890`                   | Balasan terkirim. AI sedang menilai.                       | Balasan terkirim. AI sedang menelaah.                                          |
| `simulation.tsx:935`                   | Gagal memulai ulang evaluasi.                              | see A2                                                                         |
| `index.tsx:277`, `UsagePopover.tsx:28` | Penilaian AI                                               | Telaah balasan                                                                 |
| `settings/PdktSystemTab.tsx:63-64`     | …membuat email serta menilai balasan.                      | …membuat email konsumen dan menelaah balasan.                                  |

**A9. "Masih dihitung" can stay on screen forever** (`index.tsx:313-314`, `:253-254`; `UsagePopover.tsx:174-187`)

- Current: `handleConfirmSubject` sets `sessionDeltaPending=true` as soon as the kotak masuk opens. It only becomes false after reply/telaah activity, and `computeUsageDeltaNow` returns early without clearing it when the baseline fetch failed. If the user opens the kotak masuk and leaves, the popover keeps saying "Pemakaian sesi terakhir masih dihitung."
- Why: this status is false. "Sesi" here means a visit to the kotak masuk, not the glossary's "one email".
- Proposed: set pending only inside `onBeforeActivity`, and clear it in every exit path. Copy: **"Pemakaian terakhir di kotak masuk masih dihitung…"** / **"Kunjungan terakhir ke kotak masuk memakai {Rp X} ({n} permintaan AI)."**

**A10. The reset confirmation hides what is reset and that it saves immediately** (`components/settings/usePdktSettingsDraft.ts:334-336`)

- Current: `"Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang."`
- Why: the reset also restores the model, writing style, identity, and image toggle, and it is saved to the server at once. Every other change waits for **Simpan**. "Mereset" is Indonglish.
- Proposed (ConfirmDialog, see B1): title **"Pulihkan pengaturan bawaan?"**, description **"Skenario, karakter konsumen, identitas konsumen, gaya tulisan, dan model AI kembali ke bawaan dan langsung disimpan. Skenario dan karakter buatan Anda akan hilang."**, confirm **"Pulihkan bawaan"**.

**A11. Raw English difficulty values** (`PdktConsumersTab.tsx:207-213`)

- Current: a badge shows `Easy` / `Medium` / `Hard`, while the form select (`:116-118`) shows `Mudah (Sopan)` / `Menengah (Netral)` / `Sulit (Marah/Kritis)`.
- Proposed: one map, `{ Easy: "Mudah", Medium: "Sedang", Hard: "Sulit" }`, used in both places. Select options: **"Mudah: konsumen sopan"**, **"Sedang: nada netral"**, **"Sulit: marah atau kritis"**.

### P2

**A12. The participant header leaks the role key and "record" jargon** (`components/PdktWorkspaceHeader.tsx:26-30`; `lib/simulation-subject-display.ts:4,22,37`; also `utils/landingSummary.ts:81-87,159-161`)

- Current: `Pelaksana: Budi (trainer)`; `Target tidak tercatat — sesi lama`; `Nama (record peserta tidak lagi tersedia)`.
- Proposed: use `normalizeRoleLabel(creator.role)` from `lib/app-config.ts:144`, giving **"Budi · Trainer"**. The shared helper is frozen by the history plan, so add a PDKT wrapper in `utils/` that replaces the marker with **"(data peserta sudah dihapus)"** and passes `unknownLabel: "Tidak tercatat"` everywhere. This matches the new history page copy.

**A13. The scenario editor names the wrong grader** (`settings/scenarios/ScenarioEditor.tsx:298`)

- Current: `"Kepada siapa konsumen sebenarnya meminta jawaban? Inilah yang dinilai QA pada aspek Arah Penerima. Peserta tidak melihat pilihan ini."`
- Proposed: **"Kepada siapa konsumen sebenarnya meminta jawaban? AI menelaah ini pada aspek Arah penerima. Peserta tidak melihat pilihan ini."**

**A14. Landing summary labels contradict each other** (`components/PdktLandingOverview.tsx`)

- `:134` `Menunggu balasan` → **"Belum dibalas"**. This matches the section title (`:175`) and the mailbox filter.
- `:142` `Semua email sudah dibalas` also appears when the kotak masuk is empty → **"Tidak ada email yang belum dibalas"**.
- `:154` `Dari 1 sesi terakhir yang sudah ditelaah` → when `sessions === 1`: **"Dari sesi terakhir yang sudah ditelaah"**.
- `:163` `Hasilnya muncul otomatis di riwayat` is inaccurate; results appear in Telaah and in the table below → **"Hasilnya tampil di Hasil telaah terbaru."**
- `:258` `nilai paling rendah ada di aspek` → **"skor terendah ada di aspek"**.
- `:280-289` `Pelajari catatan AI di sesi terakhir…` / `Lihat catatan AI` opens the latest session, which is not necessarily the weakest one → **"Buka telaah terakhir untuk melihat catatan aspek ini."** / **"Buka telaah terakhir"**.

**A15. Telaah stage wording** (`PdktReviewStage.tsx`)

- `:341-346` `not_started` shows a sentence with no action → add a **"Mulai telaah"** button that calls `onRetry`.
- `:121` `Berdampak ke: {aspek}` → **"Aspek: {aspek}"**.
- `:164` `Dikerjakan dalam` → **"Waktu pengerjaan"**.
- `:260` `Yang perlu diperbaiki` overlaps with `Perbaiki ini dulu` (`:112`) → **"Catatan pada balasan"**.
- `:390`, `PdktReplyStage.tsx:32`, `EmailDetailPane.tsx:77`, `MailboxSidebar.tsx:308` `(Tanpa subjek)`; `simulation.tsx:676` `Tanpa Subjek` → one shared constant, **"Tanpa subjek"**.
- `simulation.tsx:1180` `Latihan lagi dengan skenario serupa` reuses the _same_ scenario → **"Latihan lagi dengan skenario ini"**.

**A16. Cost toast: success styling, pipe separators, and it fires twice** (`index.tsx:262-279`; triggered from `simulation.tsx:889` and again at `:574`)

- Current: `notify.success("Biaya sesi ini: +Rp1,2 rb | Simulasi Rp… | Penilaian AI Rp…")`, after the reply _and_ again when the telaah completes.
- Proposed: fire once, after the telaah completes, as `notify.info("Pemakaian AI: +Rp1,2 rb", "Pembuatan email Rp… · Telaah balasan Rp…")`. Ask Fajar whether agents should see cost toasts at all.

**A17. Usage popover jargon** (`components/UsagePopover.tsx`)

- `:137` `{n} panggilan` → **"{n} permintaan AI"**; `:182` `({n} panggilan AI)` → **"({n} permintaan AI)"**.
- `:191` `Estimasi dari jumlah token AI.` → **"Perkiraan biaya dari pemakaian AI."**
- `:20` `Membuat email kasus` → **"Membuat email konsumen"**; `:21` `Membuat template email` → **"Menyiapkan email skenario"**.
- `:27-28` `Simulasi` / `Penilaian AI` → **"Pembuatan email"** / **"Telaah balasan"**.

**A18. Mailbox-retry banner and toasts are Indonglish** (`simulation.tsx`)

- `:1282-1286` `Email belum tersimpan` / `{subject} — tidak ada AI generation ulang saat retry.` → title **"Email konsumen belum masuk ke kotak masuk"**, body **"{subjek}: simpan lagi tanpa membuat ulang email."**
- `:1304` `Coba simpan lagi` / `Menyimpan...` → **"Simpan lagi"** / **"Menyimpan…"**.
- `:845` `Email sudah dibuat, tetapi belum tersimpan. Draft aman dan siap dicoba lagi.` → **"Email konsumen sudah dibuat, tetapi belum masuk ke kotak masuk. Pilih Simpan lagi di bagian atas."**
- `:745` `Email berhasil disimpan ke mailbox.` → **"Email masuk ke kotak masuk."**
- `:750` `Draft email belum berhasil disimpan. Coba lagi.` (and the `err.message` passthrough on `:748`) → always show **"Email belum bisa disimpan. Coba lagi."**
- `:848` `Gagal memulai simulasi baru.` → **"Email konsumen belum bisa dibuat. Coba lagi dalam beberapa saat."**

**A19. The draft is saved only on this device but the copy says "otomatis"** (`ReplyComposer.tsx:134`)

- Current: `Draf tersimpan otomatis · N kata · N karakter`. The draft lives in `localStorage` only.
- Proposed: **"Draf disimpan di perangkat ini · {n} kata · {n} karakter"**.

**A20. Create-email modal** (`components/CreateEmailModal.tsx`)

- `:67` `Buat Email Baru` → **"Buat email baru"**.
- `:70-71` `Setiap skenario aktif dibuat sebagai email terpisah. Pilih satu skenario untuk memulai sesi.` → **"Pilih skenario. Email konsumen baru masuk ke kotak masuk Anda."**
- `:79` aria `Tutup buat email baru` → **"Tutup"**.
- `:127-131` badges `Template tetap` / `Template tersedia` / `Dibuat AI` → plain meta text **"Email tetap"** / **"Dibuat AI"**. Drop "Template tersedia"; it tells agents nothing.
- `:168` `Menghasilkan email...` → **"Membuat email konsumen…"**.
- Product question: `:134-136` shows `scenario.description` to whoever creates the email. In "Saya tulis sendiri" mode, `PdktScenariosTab.tsx:151-154` copies the start of the fixed email into `description`, so agents can read the case before starting. Confirm the intent with Fajar.

**A21. Creation mode has three label sets**

- `ScenarioModeField.tsx:8,13` `AI, berbeda tiap sesi` / `Saya tulis sendiri`; `ScenarioList.tsx:181-182` `Tulis sendiri` / `Dibuat AI`; `CreateEmailModal` (A20).
- Proposed: mode options **"Dibuat AI tiap sesi"** / **"Ditulis sendiri (email tetap)"**; list and picker meta **"Dibuat AI"** / **"Email tetap"**.
- Also `ScenarioModeField.tsx:9` `…mengikuti arah balasan di bagian 2.` → **"…mengikuti Arah balasan di bawah."** (B13 removes the numbers).

**A22. Settings copy that is inaccurate or mismatched**

- `ScenarioList.tsx:71-72` `Kasus yang dipakai AI untuk membuat email konsumen. Hanya skenario aktif yang masuk ke sesi.` → **"Kasus yang menjadi dasar email konsumen. Hanya skenario aktif yang bisa dipilih saat membuat email."**
- `PdktIdentityTab.tsx:109` says `Pilih "Tidak disebut"`, but the option at `:132` is `Tidak menyebut nama` → make both **"Tidak disebut"**.
- `PdktConsumersTab.tsx:196-198` `Acak (Random)` / `Sistem memilih tipe konsumen secara acak untuk setiap sesi simulasi.` → **"Acak"** / **"Karakter dipilih acak di setiap sesi."**
- `PdktScenariosTab.tsx:109`, `PdktConsumersTab.tsx:43`: deletes only take effect after **Simpan** → description **"Perubahan berlaku setelah Anda memilih Simpan."** (see B1).

**A23. Consumer form: Title Case, English, and a stereotype** (`PdktConsumersTab.tsx`)

- `:79` `Edit Karakter` / `Tambah Karakter Baru` → **"Ubah karakter"** / **"Karakter baru"**.
- `:94` `Nama Karakter` → **"Nama karakter"**; `:98` placeholder `Contoh: Konsumen Milenial Galak` → **"Contoh: Konsumen yang menuntut jawaban cepat"**.
- `:105` `Tingkat Kesulitan` → **"Tingkat kesulitan"**; `:123` `Tone Bicara / Keyword` → **"Gaya bicara"**.
- `:140` `Deskripsi Karakteristik` → **"Deskripsi karakter"**.
- `:220-225` `Edit` (button, title, aria) → **"Ubah"**, to match `ScenarioList.tsx:194`.
- `:254` `Buat Karakteristik Baru` → **"Karakter baru"**.

**A24. Settings save toasts: exclamation marks, wrong causes, likely dead paths** (`usePdktSettingsDraft.ts`)

- `:197` → **"Skenario baru belum lengkap. Isi judul dan ringkasan masalah, atau pilih Batal."**
- `:213` `Isi body template email jika opsi template selalu digunakan aktif.` → **"Isi email tetap belum diisi."** The editor validation already covers this; the path is probably dead and can be removed.
- `:226` → **"Karakter baru belum lengkap. Isi nama dan deskripsi, atau pilih Batal."**
- `:276` `Gagal menyimpan! Ukuran data (gambar) terlalu besar untuk penyimpanan browser…` wraps a pure mapping function and blames browser storage, which is no longer used → delete the outer try/catch.
- `:268`, `:374` `Gagal menyimpan pengaturan.` → **"Pengaturan belum tersimpan. Coba lagi."**

**A25. Attachment toasts and labels** (`PdktScenariosTab.tsx:185-193,222,242`; `ScenarioAttachments.tsx:26-41`)

- `Ukuran PDF terlalu besar! Maksimal 2MB per PDF agar pengaturan dapat disimpan.` → **"PDF terlalu besar. Ukuran maksimal 2 MB."**
- The image variant → **"Gambar terlalu besar. Ukuran maksimal 500 KB."**
- `Gagal membaca file X.` → **"Berkas X tidak bisa dibaca. Pilih ulang berkasnya."**
- `Pilih Gambar / PDF` → **"Pilih gambar atau PDF"**.
- `500KB … 2MB` → **"500 KB … 2 MB"**.

**A26. Model picker shows irrelevant English descriptions and a redundant provider badge** (`PdktSystemTab.tsx:151-156`; descriptions from `packages/types/src/ai-models.ts:380-437`)

- Current: for example "Model Flash terbaru untuk reasoning, coding, workflow agentic, dan analisis multimodal.", "Model OpenAI untuk analisis dan generasi teks.", plus a `Gemini` / `OpenAI` badge next to "Gemini 3.8 Flash".
- Proposed: a PDKT-local description map, or no description; drop the provider badge; mark the default model with plain text **"Bawaan"**.

**A27. Fake sender identities use real public figures** (`routes/pdkt/pdktSettings.ts:52-104`)

- Current: `Iwan Fals`, `Reza Rahadian`, `Bambang Pamungkas`, `Dewi Lestari`, `Citra Kirana`, `Gilang Ramadhan`, `Indah Permatasari`, plus mocking addresses (`ratna.sari.cantik@…`). These appear as complainant names in emails.
- Why: PRODUCT.md requires sample data; real people should not be cast as complainants.
- Proposed: replace them with ordinary invented names and neutral addresses.

**A28. Delete button: accessible name and permission hint** (`EmailDetailPane.tsx:116-121`)

- Current: the disabled button gets `aria-label="Tidak memiliki izin menghapus"`. That drops the visible name "Hapus" (WCAG 2.5.3), and the `title` tooltip never shows on a disabled button.
- Proposed: keep the label **"Hapus email"**. Add visible helper text next to the button: **"Hanya pembuat email, admin, atau trainer yang bisa menghapus."**

**A29. Attachment failures are silent; English alt text** (`EmailAttachments.tsx:64-66`; `ScenarioImage.tsx:15,28`)

- When a popup is blocked or the PDF is broken, nothing happens → toast **"Lampiran PDF tidak bisa dibuka. Izinkan pop-up untuk situs ini, lalu coba lagi."**
- Default alt `Scenario image` → **"Lampiran"**; PDF aria-label `PDF` → **"Buka lampiran PDF {n}"**.

**A30. "Salin" fails silently** (`components/PdktEducationSections.tsx:35-42`, used in `PdktReviewStage.tsx:436`)

- Add `notify.error("Teks belum bisa disalin. Pilih teksnya lalu salin manual.")`.

**A31. Mailbox sidebar labels** (`MailboxSidebar.tsx`)

- `:195` `Baru` → **"Email baru"**.
- `:175` `Hapus {n}` → **"Hapus {n} email"**.
- `:278` `Tidak ada email yang cocok.` → for a filter with no search: **"Belum ada email di filter ini."**

### P3

- **A32** `index.tsx:401` kicker `PDKT · Simulasi email konsumen` and hero `:446-455` (`Hadapi email konsumen yang terasa seperti kasus sungguhan. Tanpa petunjuk jawaban: Anda yang membaca, menilai, dan menulis balasannya…`) read as marketing. Proposed h1 **"Simulasi email konsumen PDKT"**, one line **"Baca email konsumen, tulis balasan sendiri, lalu lihat telaah AI atas balasan Anda."** Verify against mockup.
- **A33** `index.tsx:469-478` `Atur skenario` duplicates `Pengaturan` (`:427-435`); both open the same dialog on the same tab. Keep one. Verify against mockup.
- **A34** Ellipsis drift: `SettingsModal.tsx:319`, `simulation.tsx:1304`, `CreateEmailModal.tsx:168`, `ScenarioEditor.tsx:419` use `...` → `…`.
- **A35** `ScenarioEditor.tsx:151` `Kasusnya` → **"Kasus"**. `replyDirections.ts:30` `Tembusan, tapi minta bantuan OJK` → **"Tembusan, tetapi meminta bantuan OJK"**. `ScenarioRecipientsField.tsx:124` `Jawaban benar` → **"Bentuk balasan"**, to avoid a third term next to "kunci jawaban".
- **A36** Placeholders that repeat the label: `ReplyComposer.tsx:126`, `ScenarioTemplateField.tsx:31,54` → remove.
- **A37** `ScenarioRecipientsField.tsx:190`, `ScenarioCreationValidation.ts:41` `Format email tidak valid.` → **"Alamat email tidak valid. Contoh: nama@perusahaan.co.id"**.
- **A38** `ExpectedAnswerAlignmentCard.tsx:11` (used by monitoring) `Kesesuaian dengan Jawaban yang Diharapkan` → **"Kesesuaian dengan kunci jawaban"**, matching `PdktReviewStage.tsx:152`.
- **A39** Loading `aria-label` on a plain `div` is not announced (`simulation.tsx:1019,1135`) → `role="status"` plus sr-only **"Memuat kotak masuk…"**.
- **A40** Default consumer types are duplicated in `index.tsx:52-95` and `simulation.tsx:39-82`, and they also ship from `apps/api/src/services/pdkt/catalog-service.ts`. `Bingung & Gaptek` is slangy; difficulty values are English. Proposed **"Bingung dan kurang paham teknologi"**; keep one source.
- **A41** Cross-module, shared: `components/simulation/SimulationSubjectPicker.tsx:138` `Target simulasi` → **"Peserta simulasi"**. Coordinate with KETIK/Telefun.
- **A42** Lock note in the settings sidebar (`SettingsModal.tsx:208-215`) is `hidden md:flex`, so phone users never see it. Show it under the tab strip on mobile.
- **A43** Not copy, but noticed: `simulation.tsx:1080` hard-codes `selectedModel: "gemini-3.8-flash"` instead of `DEFAULT_PDKT_MODEL_ID`, so the fallback settings can drift from the default.

---

## B. AI slop (visual/structural)

### P1

**B1. Eight `window.confirm` calls (fix).** `simulation.tsx:965,1000`; `SettingsModal.tsx:92`; `PdktScenariosTab.tsx:103,109`; `PdktConsumersTab.tsx:43,69`; `usePdktSettingsDraft.ts:334`.

- Problem: native, unstyled, not themeable, and banned by the same rule set as SIDAK (`docs/design.md` "Tidak ada `window.confirm`").
- Change: use the shared `components/ConfirmDialog.tsx` (moved from `components/sidak/`). It needs four optional props first:
  - `container`: the PDKT workspace is a `fixed z-[100]` layer, and `ReplyComposer.tsx:55-58` already had to portal into it.
  - `cancelLabel`.
  - `confirmVariant` (`"destructive" | "default"`).
  - `busyLabel`: it is hard-coded to "Menghapus…" today.
- Copy:
  - Delete email: **"Hapus email ini?"** / **"Email dihapus dari kotak masuk."** / **"Hapus email"**.
  - Bulk delete: **"Hapus {n} email?"**.
  - Unsaved changes: **"Tutup tanpa menyimpan?"** / **"Perubahan yang belum disimpan akan hilang."** / cancel **"Lanjut mengubah"**, confirm **"Buang perubahan"**.
  - Reset: see A10.

**B2. Difficulty badge text fails contrast (fix).** `PdktConsumersTab.tsx:24-33`.

- Problem: `text-[var(--chart-green)]` (#10b981 ≈ 2.5:1 on white) and `text-[var(--chart-amber)]` (#f59e0b ≈ 2.1:1). Arbitrary `[var()]` again.
- Change: drop the colored badge and render plain `text-xs text-fg2` "Sulit" after the title. If color must stay, use a 6px dot (`bg-chart-amber`) next to neutral text.

**B3. Hero checklist of trust bullets (fix).** `index.tsx:481-491`.

- Problem: three check-icon "benefits" on a module page, the textbook marketing tell, and one claim is false (A5).
- Change: delete the `<ul>` and `HERO_POINTS`.

### P2

**B4. Marketing hero on an operational module (verify against mockup).** `index.tsx:388-498`.

- Problems:
  - A kicker pill with an icon tile above the h1 (`:394-402`, eyebrow pattern, §8).
  - A two-tone 56px headline (`:442-450`, `lg:text-[3.5rem]`, the second line in the module color).
  - A two-CTA block (A33).
- Recommendation if the mockup allows:
  - Remove the pill.
  - h1 `font-display text-3xl font-bold tracking-tight`, single color.
  - One-line description and one primary CTA.
  - Nav buttons stay.

**B5. The stage demo carries template decoration (keep the demo, fix the details; verify).** `components/PdktStageDemo.tsx`. `docs/design.md` §6 explicitly allows the looping illustration with a pause button. Inside it:

- Fake window chrome "traffic-light" dots (`:40-44`) → remove.
- `01/02/03` monospace step numbers (`:7-9,70`) are numbered-section scaffolding and a monospace costume → remove; the stage labels are enough.
- A progress ring with "82" (`:167-192`, `.css:290-304`) is not what the real Telaah shows. The real screen shows a big score, "dari 100 · Baik", and a bar (`PdktReviewStage.tsx:83-107`). Render the demo the same way so it previews the product, and drop the ring.
- The "Email baru" pill with icon (`:99-102`) → plain muted text "Baru saja".
- Arbitrary colors `bg-[var(--chart-orange)]`, `border-[var(--chart-orange)]/40` (`:14,223,225`) → `bg-chart-orange`, `border-chart-orange/40`.

**B6. Three identical stat cards (verify against mockup).** `PdktLandingOverview.tsx:73-101,131-165`.

- Problem: three `rounded-xl` cards, each with a label, a 30px mono number, and a note. This is the hero-metric template and an identical card grid (§8). The new history page plan explicitly chose "ringkasan inline (teks, bukan kartu metrik)".
- Change: one bordered strip with `sm:divide-x divide-border` and three cells. Alternatively, an inline sentence: "3 email belum dibalas · skor rata-rata 78 dari 5 sesi · 1 sedang ditelaah".

**B7. Telaah is a stack of up to eight cards, one nested (verify against mockup).** `PdktReviewStage.tsx:42` (`card`), `Section` ×5, `<details>` ×2.

- Problems:
  - "Perbaiki ini dulu" (`:110`) is a tinted rounded box inside the ScoreSummary card: a nested card (§4, "always wrong").
  - "Cards jangan jadi default."
- Change: one surface per column. Separate sections with `border-t border-border pt-6` and `space-y-6`. Turn "Perbaiki ini dulu" into a heading plus text inside the same surface, with a 1px `border-chart-orange/40` frame at most, not a filled box. Keep the `<details>` blocks but without card styling (just `border-t`).

**B8. Ornamental pills and badges (fix).**

- `MailboxSidebar.tsx:103` `Skor N` bordered mono pill → plain `font-semibold tabular-nums text-foreground` "Skor 82".
- `PdktWorkspaceHeader.tsx:38` `ParticipantInfo` is a `rounded-full` bordered pill → plain text row `text-xs text-fg2` with `·` separators.
- `CreateEmailModal.tsx:121-132` `Badge` → meta text (A20).
- `PdktSystemTab.tsx:151-153` provider badge → remove (A26).
- `ScenarioRecipientsField.tsx:95-104` tag pills `Normatif` / `Jebakan` / `Substansi` → plain text after the title, `text-xs text-fg2`. The "Jebakan" accent can stay as the existing 6px dot used in `ScenarioList.tsx:26-30`.
- `index.tsx:420` the session-delta pill inside the "Pemakaian AI" button → plain `text-xs text-fg2` "+Rp1,2 rb" (verify against mockup).
- `PdktReviewStage.tsx:194` `Perlu perbaikan` pill → plain `text-xs font-semibold` text plus the orange bar that already signals it. P3.

**B9. Gray text on tinted error and selection surfaces (fix).**

- `simulation.tsx:1054,1284` and `PdktReviewStage.tsx:325`: `text-muted-foreground` inside `Alert variant="destructive"` (red tint) → `text-foreground`. `docs/design.md` §2 says no gray text on a colored background.
- `MailboxSidebar.tsx:347`: the selected row `bg-module-pdkt/10` keeps `text-muted-foreground` meta (#707070 on a purple tint is about 4.3:1) → `text-fg2` when selected.

**B10. Numbered section markers in the scenario editor (verify against mockup).** `ScenarioEditor.tsx:52-83`.

- Problem: filled `bg-primary` circles "1 / 2 / 3" before each h4 are default numbered scaffolding (§8). The text "bagian 2" (A21) depends on them.
- Change: plain `h4` headings separated by the existing dividers; refer to sections by name.

**B11. Decorative icon tiles and an inconsistent "add" pattern (fix).**

- `SettingsModal.tsx:140-145` a tinted icon tile beside the title → remove; title plus description are enough.
- `PdktConsumersTab.tsx:247-255` a big dashed "add" tile (`min-h-24 border-dashed`) → a header button "Karakter baru", the same pattern as `ScenarioList.tsx:75-78`.
- `PdktConsumersTab.tsx:192-245` an identical card grid of consumer types (title + badge + description + Pilih + Ubah/Hapus actions) → list rows like `ScenarioList`, with a radio for "Dipakai".

**B12. "Salin" button costume (fix).** `components/PdktEducationSections.tsx:44-47`.

- Problem: `font-bold uppercase tracking-wider` (a tracked uppercase micro label) plus hard-coded `text-emerald-500`.
- Change: `text-xs font-medium` in sentence case; check icon `text-chart-green`.

### P3

- **B13 Selection side-stripe (verify).** `MailboxSidebar.tsx:347` `shadow-[inset_2px_0_0_var(--module-pdkt)]` is a 2px side stripe (§8 bans >1px accent stripes on cards; this is a list row). Keep `aria-current` plus the tint plus `font-semibold`, and drop the stripe, or confirm the mockup has it.
- **B14 `<mark>` thick bottom border (flagged by the detector).** `PdktReviewStage.tsx:238` `rounded-sm border-b-2 border-chart-orange bg-chart-orange/15`. The marking is semantic, so keep it, but change the style to `bg-chart-orange/15 underline decoration-chart-orange decoration-2 underline-offset-4 [box-decoration-break:clone]`. That clears the detector and wraps cleanly across lines.
- **B15 Arbitrary `[var(--…)]` instead of token utilities.**
  - `ScenarioImage.tsx:47,65,68-69,79,95` (`bg-[var(--bg)]`, `border-[var(--border)]`, `text-[var(--fg)]`, `text-[var(--fg2)]`, `bg-[var(--surface)]`) → `bg-background`, `border-border`, `text-foreground`, `text-fg2`, `bg-card`.
  - `PdktLandingOverview.tsx:272` and `SettingsModal.tsx:299` `bg-[var(--chart-orange)]` → `bg-chart-orange`.
  - Keep the lightbox `bg-black/90`, `ring-white/10`, `text-white/80` (`EmailAttachments.tsx:100,108,117`); a dark scrim behind images is legitimate.
- **B16 Opacity-based text.** `text-foreground/80` / `/85` appears 33 times across the PDKT files in scope (for example `index.tsx:394,451,481`, `PdktLandingOverview.tsx:92,254,369`, `UsagePopover.tsx:175,216`, all settings descriptions) → `text-fg2`, the token defined for secondary text (`index.css:34`).
- **B17 Score typography is inconsistent.** Landing uses `font-mono` (`PdktLandingOverview.tsx:93,266,375`); Telaah uses `font-display text-5xl` (`PdktReviewStage.tsx:90`). Pick one: `font-display tabular-nums` for big scores, `tabular-nums` for table cells. Mono is allowed for scores by §3, but not for the demo step numbers (B5) or a 28px currency headline (`UsagePopover.tsx:133` → `font-display tabular-nums`).
- **B18 Redundant progress bars.** The bar under the Telaah big score (`PdktReviewStage.tsx:99-107`) restates the number → remove. Keep the per-aspect bars, the focus bar, and the usage share bars; they compare values.
- **B19 Radius and spacing scales drift between PDKT screens.**
  - Radius: `rounded-2xl` (demo), `rounded-xl` (cards, options, details), `rounded-lg`, `rounded-full` (stage nav, participant pill, pills).
  - Containers: `max-w-6xl` (landing), `max-w-[1200px]` (Telaah, `PdktReviewStage.tsx:384`), `max-w-[720px]` (Pahami).
  - Card padding: `p-5` (Telaah), `p-6` (focus card), `px-6 py-5` (Stat), `p-4` (settings).
  - Standardize: `rounded-xl` for surfaces, `rounded-lg` for controls; `max-w-6xl` for wide screens; `p-6` for surfaces (`docs/design.md` §4 table).
- **B20 11px labels.** `text-[11px]` (`PdktStageNav.tsx:38`, `PdktReviewStage.tsx:194,241`) and `text-xs` (= 11px here) on labels and `dt`s (`ReplyComposer.tsx:101-112`, `ScenarioModeField.tsx:38`) → `text-[12px]` for labels (§7).
- **B21 Double pulse.** `simulation.tsx:1020` adds `motion-safe:animate-pulse` to a container whose `Skeleton` children already pulse → remove it from the container.
- **B22 Shadows on segmented controls.** `shadow-sm` on active segments and tabs (`MailboxSidebar.tsx:259`, `ScenarioModeField.tsx:76`, `ScenarioList.tsx:110`, `SettingsModal.tsx:197`) → rely on `bg-background` plus `font-semibold`, or a 1px border. Low priority.

---

## Counts

|           | P1          | P2           | P3           | Total  |
| --------- | ----------- | ------------ | ------------ | ------ |
| A. Copy   | 11 (A1–A11) | 20 (A12–A31) | 12 (A32–A43) | 43     |
| B. Slop   | 3 (B1–B3)   | 9 (B4–B12)   | 10 (B13–B22) | 22     |
| **Total** | **14**      | **29**       | **22**       | **65** |

Verify against mockup: B4, B5, B6, B7, B10, B13, plus the session-delta pill in B8, A32, and A33.
