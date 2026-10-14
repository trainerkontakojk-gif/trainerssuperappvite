# PDKT — "Latihan lagi" untuk email tanpa atribusi peserta

Lanjutan dari [`pdkt-navigation-flow.md`](pdkt-navigation-flow.md) (F4/AC6). Lane B: satu modul, pola lokal, tanpa perubahan skema/RLS/kontrak API. Muat `trainers-superapp-tdd` sebelum mengedit. Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`.

Perubahan dari plan navigasi masih belum di-commit di working tree. Kerjakan di atasnya; jangan revert atau rapikan bagian lain.

## Requirement

### Masalah

Migration `supabase/migrations/20260910000000_simulation_subject_attribution.sql` menambah kolom atribusi peserta tanpa backfill. Akibatnya, semua email PDKT yang dibuat sebelum 2026-09-10 punya snapshot peserta `type: "unknown"` (lihat `parseSimulationSubjectSnapshot` di `packages/types/src/simulation-subject.ts`).

Implementasi AC6 di `apps/web/src/routes/pdkt/simulation.tsx` menghitung `repeatSubject` dari `selectedItem.simulationSubject`. Kalau hasilnya `null` (snapshot `unknown`, kosong, atau peserta terhapus), tombol "Latihan lagi" dinonaktifkan dengan pesan "…Kembali ke halaman awal PDKT untuk memilih peserta."

Untuk **agent** (role tanpa capability `simulation.subject.select`, lihat `packages/types/src/access.ts`), hal ini regresi:

- Agent tidak pernah punya pemilih peserta; subjeknya selalu `self`.
- Semua email lama agent sekarang tidak bisa "Latihan lagi", padahal sebelum perubahan navigasi tombolnya berfungsi.
- Pesan yang tampil menyuruh agent memilih peserta, padahal agent tidak bisa melakukannya.

### Acceptance criteria

1. Agent (role tanpa `simulation.subject.select`): "Latihan lagi" pada email dengan snapshot `unknown`, `null`/tidak ada, atau `participant` tanpa `participantId` tetap aktif. Request `POST /api/v1/pdkt/session/create` mengirim `simulationSubject: { type: "self" }`.
2. Agent dengan email snapshot `self`: perilaku tidak berubah (request `self`).
3. Trainer/admin: perilaku AC6 yang sudah ada tidak berubah:
   - snapshot `participant` dengan ID → request memakai peserta itu, bukan subjek ruang kerja;
   - snapshot `self` → request `self`;
   - snapshot `unknown` atau peserta terhapus → tombol nonaktif dengan pesan yang ada. Tidak ada fallback diam-diam ke `self` atau ke subjek ruang kerja.
4. Jalur "Buat email baru" via `CreateEmailModal` dari Telaah (saat skenario sesi sudah tidak aktif) mengikuti aturan yang sama untuk agent.
5. Semua test di `apps/web/e2e/pdkt-flow.spec.ts` tetap hijau.

### Di luar scope

- Backfill data atribusi di database.
- Perubahan backend. Backend tetap memvalidasi subjek; frontend hanya berhenti memblokir agent.
- Masalah navigasi lain dari review (tombol kembali yang mem-push, auto-select sekali, assertion Monitoring).

## Design

- `PdktSimulation` belum tahu role. Tambahkan prop `canPickParticipant: boolean` dan kirim dari `routes/pdkt/index.tsx`, yang sudah menghitung `can(profile?.role, "simulation.subject.select")`. Jangan membaca auth store kedua kali di `simulation.tsx`. Perbarui juga harness Vitest `apps/web/src/__tests__/helpers/PdktSimulationHarness.tsx` agar typecheck lulus (default `false` atau teruskan prop). Jangan menjalankan atau menambah unit test.
- Ubah perhitungan `repeatSubject`:

  ```ts
  const repeatSubject: SimulationSubjectSelection | null = !canPickParticipant
    ? { type: "self" }
    : reviewedSubject?.type === "self"
      ? { type: "self" }
      : reviewedSubject?.type === "participant" && reviewedSubject.participantId
        ? { type: "participant", participantId: reviewedSubject.participantId }
        : null;
  ```

  `practiceUnavailableReason` otomatis `undefined` untuk agent karena turunan dari `repeatSubject`. Pesan untuk trainer/admin tidak berubah.

- Satu primary path dan tanpa fallback tambahan. Fallback ke `self` hanya untuk role yang memang tidak bisa memilih peserta. Ini bukan menutupi kegagalan, karena untuk agent `self` adalah satu-satunya subjek yang sah.

## Tasklist

- [x] Drift-check: pastikan `repeatSubject`, `practiceUnavailableReason`, dan test `AC6 atribusi … tanpa ID tidak menjadi self` masih seperti yang dijelaskan di atas.
- [x] RED: di `apps/web/e2e/pdkt-flow.spec.ts`, tambah test hermetic untuk agent. Pakai `openHermeticShell(page, { path: "/pdkt?ruang=1", auth: { role: "agent" }, apiMocks: [...] })`; opsi `role` ada di `e2e/helpers/mockAuth.ts`. Ikuti pola test AC6 yang sudah ada (`mailboxItem(..., "replied", { history_id, simulationSubject })`, `CREATE_MOCKS`, `pdktNavigationMocks`). Ulangi untuk snapshot `unknown`, `null`, dan `participant` tanpa ID: tombol aktif, lalu body `session/create` berisi `{ type: "self" }`. Jalankan hanya test ini dan pastikan gagal karena tombol nonaktif, bukan karena fixture.
  - Satu run Playwright saja, jangan paralel:
    `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep "<nama test>"`
- [x] Pastikan test trainer yang sudah ada (`AC6 latihan lagi memakai peserta email X…` dan `AC6 atribusi … tanpa ID tidak menjadi self`) masih menjalankan role trainer (default `mockAuth`), sehingga AC3 tetap terjaga.
- [x] GREEN: implementasi sesuai Design.
- [x] Jalankan `pdkt-flow.spec.ts` penuh sekali sampai hijau.
- [x] `pnpm typecheck --concurrency=1`, `pnpm lint --concurrency=1`, `git diff --check`.
- [x] Tambahkan ringkasan dan bukti (perintah persis, exit code, jumlah lulus) di bagian Hasil di bawah. Jangan commit, push, atau buka PR tanpa izin Fajar.

## Hasil

Implementasi lokal selesai di atas working tree navigasi yang belum di-commit. Klasifikasi minimum bug fix mengikuti Lane C pada workflow kanonik (plan intake menyebut Lane B); scope tetap satu modul dan verifikasi mengikuti tasklist yang diminta.

### Perubahan

- `PdktSimulation` menerima `canPickParticipant` wajib dari landing. Tidak ada pembacaan auth store kedua.
- Guard `!canPickParticipant || reviewedSubject?.type === "self"` menetapkan `self` untuk role tanpa pemilih; mapping snapshot participant dan pesan nonaktif trainer/admin tetap sama.
- Harness fixture Vitest menerima flag opsional, default false. Tidak ada unit test baru dan tidak ada unit suite yang dijalankan.
- Tambahan 14 E2E mencakup snapshot unknown, null, properti hilang, peserta terhapus, self, dan participant dengan ID untuk agent; jalur skenario nonaktif; serta preservasi policy trainer/admin.
- Semua 50 E2E yang sudah ada dipertahankan verbatim; default mockAuth tetap trainer. `docs/modules.md` disinkronkan dengan pengecualian agent.

### Bukti

| Gate | Perintah | Hasil |
| --- | --- | --- |
| RED | `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep 'agent legacy langsung (unknown\|null\|participant-deleted)'` | Exit 1, 3 gagal tepat pada `toBeEnabled`: expected enabled, received disabled. Tidak ada kegagalan fixture/API. |
| GREEN penuh, satu run | `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts` | Exit 0, **64 passed (4.4m)**; 50 test lama + 14 test baru. |
| Root typecheck | `pnpm typecheck --concurrency=1` | Exit 0, 4/4 task sukses. Run awal menemukan TS2322 pada literal writingStyleMode fixture skenario nonaktif; diperbaiki dengan literal `"training" as const` tanpa perubahan nilai runtime. |
| Root lint | `pnpm lint --concurrency=1` | Exit 0, 4/4 task sukses; 0 error, warning existing tetap ada. |
| Diff final | `git diff --check` | Exit 0 setelah pengisian Hasil final. |

Review langsung dengan checklist thermo-nuclear: satu kondisi tambahan pada mapping yang ada, satu prop capability dari sumber yang sudah ada, tidak ada state/auth lookup/fallback tambahan, dan tidak ada perubahan backend atau kontrak API. Query Graphify dan live source dipakai untuk memeriksa pemanggil; source dan typecheck menjadi bukti utama. Cache Graphify final diperbarui sekali: `GRAPHIFY_MAX_WORKERS=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 graphify update .`, exit 0, 15.036 node / 28.221 edge / 1.013 komunitas. Cache tetap untracked/ignored; HTML dilewati otomatis karena ukuran graph.

Bukti E2E memakai Chromium lokal/hermetic, seluruh request API dimock, dan satu worker. Tidak ada backfill, perubahan Monitoring/navigasi lainnya, operasi remote, commit, push, atau PR. Build dan suite default tidak diulang dalam tindak lanjut ini, sesuai scope verifikasi plan.

