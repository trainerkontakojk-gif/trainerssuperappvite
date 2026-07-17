# Agent Context Workflow — Kebijakan Kanonik

Dokumen ini mendefinisikan urutan wajib, hierarki sumber kebenaran, aturan konflik, dan checklist yang harus diikuti oleh AI agent sebelum dan selama implementasi.

---

## 1. Mandatory Context Discovery Sequence

Setiap agent **WAJIB** melakukan urutan berikut sebelum memulai implementasi:

1. **Baca instruction hierarchy yang applicable** — system/platform/developer/repo/user/task sesuai konteks agent host.
2. **Baca task user terbaru dan spec/plan yang sudah disetujui** — pastikan tidak ada instruksi baru yang override.
3. **Gunakan Wiki hanya untuk discovery/navigation** — jangan jadikan Wiki sebagai source of truth.
4. **Baca dokumen kanonik yang relevan di `docs/`** — arsitektur, database, auth, design guidelines, dll.
5. **Inspeksi kode aktual** — types, schema, migration, config, test files, dan git working tree (`git status`, `git diff`).
6. **Bandingkan semua sumber** — catat discrepancies antara docs, kode, dan Wiki. Jika konflik behavior-affecting dan stale side tidak jelas, tanyakan. Jika requirement dan evidence membuat stale side unambiguous, fix dan sync.
7. **Implementasi** — test-first untuk behavior/business/security/API/schema changes; risk-based untuk docs/config-only (tidak wajib test produk).
8. **Update docs lalu Wiki** — setiap perubahan behavior terdokumentasi di `docs/` dulu, baru sync ke Wiki jika summary/navigasi/public contract Wiki terpengaruh.

> **Jangan pernah mengimplementasikan secara mekanis dari plan yang sudah stale.** Jika ada indikasi bahwa plan tidak sinkron dengan repo atau user memberikan instruksi baru, re-evaluasi dulu. Klarifikasi hanya jika masih ada material ambiguity atau scope conflict setelah re-evaluasi.

---

## 2. Source-of-Truth: Role-Based Matrix

Sumber kebenaran bersifat **role-based**, bukan rank numerik kaku:

| Peran                       | Sumber                                                                     | Penjelasan                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow**                | Instruction hierarchy (system → platform → developer → repo → user → task) | Runtime instruction yang mengatur how agent behaves. Hierarki dihormati sesuai agent host. User latest instruction hanya override user task/plan lama — tidak override safety, repo guardrails, atau higher-priority instructions. |
| **Intended behavior**       | Approved requirement / spec                                                | Apa yang seharusnya dibangun — source of truth untuk tujuan.                                                                                                                                                                       |
| **Implementation reality**  | Code, schema, test, runtime behavior                                       | Apa yang benar-benar berjalan di repo.                                                                                                                                                                                             |
| **Architecture / contract** | Canonical docs (`docs/`)                                                   | Arsitektur yang disepakati, kontrak API, database schema, guardrails.                                                                                                                                                              |
| **Discovery**               | Wiki                                                                       | Navigasi dan orientasi saja. Bukan referensi yang bisa diandalkan untuk kebenaran teknis.                                                                                                                                          |
| **External reference**      | Official docs / Context7 / API reference                                   | Dokumentasi eksternal untuk library dan service.                                                                                                                                                                                   |

---

## 3. Conflict Rules

Jangan pernah memilih secara diam-diam. Setiap konflik harus diidentifikasi dan ditindaklanjuti:

| Konflik                     | Resolusi                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wiki vs docs**            | `docs/` yang benar. Update Wiki untuk sinkron.                                                                                                                                           |
| **docs vs implementasi**    | Identifikasi mana yang stale. Jika requirement dan evidence membuat stale side jelas, fix dan sync tanpa bertanya. Tanyakan ke user hanya jika ada material ambiguity atau scope change. |
| **Plan vs repo saat ini**   | Plan mungkin sudah obsolete. Revisi/clarify plan sebelum lanjut.                                                                                                                         |
| **User latest vs old plan** | User latest menang hanya jika tidak bertentangan dengan higher-priority instructions, safety, atau repo guardrails. Update plan jika perlu.                                              |
| **Dua docs bertentangan**   | Gunakan canonical role + requirement/evidence saat tidak ambigu; tanya hanya jika material ambiguity.                                                                                    |

---

## 4. Plan Evidence Checklist

Sebelum mulai coding, agent harus bisa menjawab ya untuk setiap item berikut (ataupun mencatat mengapa tidak relevan):

- [ ] **Docs read?** — Semua doc relevan di `docs/` sudah dibaca.
- [ ] **Symbols/files verified?** — Type defs, interfaces, schema, migration, test files sudah dicek.
- [ ] **Assumptions documented?** — Asumsi dan konflik yang ditemukan tercatat, termasuk keputusan yang diambil untuk resolve.
- [ ] **Tests/commands identified?** — Test tier dan command verifikasi sudah diketahui (pilih tier sesuai risk-based policy di AGENTS.md).
- [ ] **Docs/wiki sync planned?** — Rencana update docs dan Wiki sudah ditentukan.

---

## 5. When Wiki Update Is Required vs Not Required

### Required (Wiki harus diupdate)

- Perubahan API endpoint atau response shape, jika Wiki merangkum/mendokumentasikan area tersebut.
- Perubahan konfigurasi deployment, jika Wiki merangkum/mendokumentasikan area tersebut.
- Perubahan flow auth atau role, jika Wiki merangkum/mendokumentasikan area tersebut.
- Perubahan skema database (tabel, kolom, RLS), jika Wiki merangkum/mendokumentasikan area tersebut.
- Fitur baru yang signifikan, jika Wiki merangkum/mendokumentasikan area tersebut.
- Perubahan yang memengaruhi cara kontributor menggunakan repo (summary/navigation/public contract Wiki).

### Not Required (Wiki tidak perlu diupdate)

- Bug fix internal tanpa perubahan behavior terdokumentasi.
- Refactoring yang tidak mengubah API atau interface.
- Penambahan test tanpa perubahan dokumentasi.
- Perubahan internal implementation detail.
- Jika Wiki hanya me-link ke docs kanonik (tidak punya summary sendiri yang perlu diupdate).

> **Hindari stale duplicated summaries.** Jika Wiki berisi ringkasan duplikat, sinkronkan. Jika Wiki hanya berisi link ke docs kanonik tanpa konten independen, update Wiki tidak diperlukan.

---

## 6. Pre-Implementation Checklist

Sebelum menulis kode:

1. [ ] Context discovery sequence selesai.
2. [ ] Semua sumber dibaca dan dibandingkan.
3. [ ] Tidak ada konflik unresolved yang behavior-affecting.
4. [ ] Plan evidence checklist terpenuhi.
5. [ ] Git working tree bersih atau perubahan yang ada sudah dipahami.
6. [ ] Wiki sudah dicek untuk navigasi (bukan sebagai source of truth).
7. [ ] TDD/test approach sudah ditentukan (test-first untuk behavior, risk-based untuk docs-only).

---

## 7. Post-Implementation Checklist

Sebelum push, pilih test tier sesuai AGENTS.md risk-based policy:

1. [ ] Test lulus (pilih tier yang sesuai — tidak wajib `test:core` untuk docs-only).
2. [ ] Lint bersih (`pnpm lint`).
3. [ ] Build lulus (`pnpm build`).
4. [ ] `docs/` diupdate sesuai perubahan.
5. [ ] Wiki diupdate jika required (lihat section 5).
6. [ ] `git diff --check` — tidak ada whitespace error.
7. [ ] Tidak ada TODO/TBD/FIXME yang sengaja ditinggalkan.
8. [ ] Perubahan hanya menyentuh file yang direncanakan.

---

## 8. Referensi

- [AGENTS.md](../AGENTS.md) — Golden Rules, termasuk Rule #7 (Agent Workflow).
- [docs/README.md](README.md) — Indeks dokumentasi.
- [Wiki Contributing](https://github.com/trainerkontakojk-gif/trainerssuperappvite/wiki/Contributing) — Panduan kontribusi Wiki.
