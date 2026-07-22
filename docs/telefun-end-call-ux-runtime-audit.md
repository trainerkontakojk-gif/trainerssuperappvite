# Audit Runtime End-Call UX — Telefun

**Auditor:** Hermes Agent
**Tanggal:** 2026-07-21
**Metode:** Karpathy-style — evidence-first, surgical, minimum klaim
**Metodologi:** Analisis kode statis (source-level). Tidak ada live-browser test, tidak ada eksekusi AI/build/network generation.
**Status:** **READ-ONLY** — dokumentasi audit saja. Tidak mengubah kode aplikasi, test, Gbrain, Wiki, atau file lain.
**Scope:** Runtime end-call UX pada modul Telefun — alur dari klik "End Call" hingga navigasi kembali ke home. Meliputi komponen frontend (`PhoneInterface.tsx`, `index.tsx`) dan service (`liveSession.ts`, `sessionFinalizer.ts`). Tidak mencakup proxy WebSocket backend (`apps/telefun`), scoring worker, atau deployment.

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Alur Runtime Aktual](#2-alur-runtime-aktual)
3. [Tabel Temuan Terprioritas](#3-tabel-temuan-terprioritas)
4. [Detail Temuan](#4-detail-temuan)
5. [Hal yang Sudah Baik](#5-hal-yang-sudah-baik)
6. [Discrepancy: Dokumentasi vs Runtime](#6-discrepancy-dokumentasi-vs-runtime)
7. [Ringkasan Gbrain yang Dibaca](#7-ringkasan-gbrain-yang-dibaca)
8. [Rekomendasi Surgical (Karpathy-style)](#8-rekomendasi-surgical-karpathy-style)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Test Matrix](#10-test-matrix)
11. [Scope File Implementasi Potensial](#11-scope-file-implementasi-potensial)

---

## 1. Executive Summary

Audit ini menganalisis alur runtime end-call pada modul Telefun — dari pengguna menekan tombol "Akhiri Panggilan" hingga UI kembali ke layar home. **7 temuan** diidentifikasi (3 High, 2 Medium, 2 Low) setelah verifikasi terhadap source code aktual.

### Semua Temuan Sekilas

| ID | Temuan | Prioritas | Severity |
|----|--------|-----------|----------|
| **H1** | Halaman simulasi menunggu `finalizeTelefunSession` (termasuk scoring) sebelum pulang ke home | P1 High | Blocking UX — pengguna menunggu scoring selesai |
| **H2** | OpenAI `response.cancel` tidak dikirim saat disconnect | P1 High | Potensi audio AI terputus paksa tanpa sinyal ke provider |
| **H3** | Risiko audio AI residual terdengar selama drain WebSocket | P1 High | Audio AI bisa tetap dimainkan selama ~5s drain window |
| **M1** | `recordingFinalizationPromise` tidak memiliki timeout — disconnect bisa menggantung | P2 Medium | Jika callback hangs, pengguna tidak bisa kembali ke home |
| **M2** | UX indikator "Mengakhiri..." tidak memadai, terutama di mobile | P2 Medium | Label `hidden md:block` — tidak terlihat di layar kecil |
| **L1** | Forced 500ms delay pada emit recording (hardcoded `setTimeout`) | P3 Low | 500ms tambahan minimum pada setiap end-call |
| **L2** | Tidak ada status visual `isDisconnecting` pada status card | P3 Low | User hanya melihat button disabled tanpa penjelasan kontekstual |

### Ringkasan Discrepancy Utama

Dokumentasi `docs/telefun.md:250-261` mendeskripsikan scoring sebagai proses **background** (worker terpisah), tetapi implementasi runtime di `sessionFinalizer.ts:242-257` menjalankan scoring secara **blocking** di critical path sebelum navigasi home.

---

## 2. Alur Runtime Aktual

Berikut alur lengkap dari klik "End Call" hingga home, berdasarkan verifikasi source code.

```
┌─ User klik "End Call" ──────────────────────────────────────────┐
│ PhoneInterface.tsx:395-430 (handleEndCall)                       │
│                                                                  │
│ ① set isDisconnecting = true, isDisconnectingRef = true         │
│ ② stopHoldMusic(), close uiAudioContext                         │
│ ③ await sessionRef.current.disconnect(reason)                   │
│    └→ liveSession.ts:1023 (disconnect)                          │
│       └→ liveSession.ts:1032 (performDisconnect)                │
│          • intentionalClose = true                               │
│          • clearSetupTimeout(), stopStalledWatchdog()            │
│          • clearAiPlayback("disconnect")  ← stop AI audio       │
│          • stopRecordingOnce()                                   │
│          • Kirim stream-end + session-end ke WS                  │
│          • Drain WebSocket (5s timeout)                          │
│          • Close WebSocket                                       │
│          • cleanupAudio()                                        │
│          • ⏳ await recordingFinalizationPromise                 │
│            └→ stopRecording() [1092]                             │
│               • stop MediaRecorders                              │
│               • Buat Promise baru (tanpa timeout)                │
│               • setTimeout 500ms → emitRecording()               │
│                 └→ buildSessionMetrics(), createBlobs            │
│                 └→ await onRecordingComplete(...)                │
│                   └→ PhoneInterface.tsx:280 (callback)           │
│                     └→ await onRecordingReadyRef.current(...)   │
│                       └→ index.tsx:265 (handleRecordingReady)   │
│                         └→ await finalizeTelefunSession(...)     │
│                           ├ Upload recording (blocking)          │
│                           ├ Patch session (blocking)             │
│                           ├ Remux (blocking)                     │
│                           ├ ⚠ SCORE SESSION (blocking)          │
│                           └ Patch score/feedback                 │
│                         └→ setReviewRecord, setIsReviewOpen(true)│
│                         └→ finally: setView("home")  ← HOME     │
│                 └→ resolveRecordingFinalization()                │
│ ④ await onEndSessionRef.current(reason)     [PhoneInterface:426]│
│    └→ index.tsx:249 (handleEndSession)                           │
│       • setView("home") ← navigasi duplikat (already from above)│
│       • setActiveSessionConfig(null), setActiveAccessToken(null) │
└──────────────────────────────────────────────────────────────────┘
```

**Poin penting dalam alur:**
- `performDisconnect` (langkah ③) dan `handleRecordingReady` (di dalam `onRecordingComplete`) berjalan secara **serial** — `performDisconnect` menunggu `recordingFinalizationPromise` yang di-resolve setelah `onRecordingComplete` selesai.
- Scoring terjadi **sebelum** `setView("home")` pada `index.tsx:382` — artinya pengguna menunggu scoring selesai di halaman simulasi.
- Fungsi `handleEndSession` (langkah ④) dipanggil setelah disconnect selesai, tetapi navigasi home sudah terjadi dari `handleRecordingReady`.

---

## 3. Tabel Temuan Terprioritas

| ID | Temuan | Prioritas | Dampak | File:Line | Kategori |
|----|--------|-----------|--------|-----------|----------|
| H1 | `finalizeTelefunSession` termasuk scoring blocking sebelum home | **P1 High** | Pengguna menunggu scoring (2-5s+) tanpa feedback di halaman simulasi | `index.tsx:265-385`, `sessionFinalizer.ts:242-257` | Blokir UX |
| H2 | `response.cancel` tidak dikirim saat disconnect — OpenAI transport | **P1 High** | Provider tidak mendapat sinyal cancel → audio residual, biaya token sia-sia | `liveSession.ts:1032-1083` (khususnya 1035-1039) | Protokol |
| H3 | Audio AI bisa tetap diputar selama drain WebSocket (~5s) | **P1 High** | Audio AI terdengar setelah user klik end-call karena `playPcm` tidak cek `intentionalClose` | `liveSession.ts:766-822`, `236-249`, `351-365` | Audio/Runtime |
| M1 | `recordingFinalizationPromise` tanpa timeout — disconnect bisa menggantung | **P2 Medium** | Jika `onRecordingComplete` callback error/hang, pengguna tidak bisa kembali ke home | `liveSession.ts:1083`, `1104-1106` | Robustness |
| M2 | Label "Mengakhiri..." `hidden md:block` — tidak terlihat di mobile | **P2 Medium** | Pengguna mobile tidak mendapat indikasi visual bahwa proses end-call sedang berlangsung | `PhoneInterface.tsx:736-742` | UX/Aksesibilitas |
| L1 | Forced 500ms delay `setTimeout` sebelum `emitRecording` | **P3 Low** | Tambahan 500ms pada setiap end-call tanpa alasan teknis yang jelas | `liveSession.ts:1108-1110` | Performa |
| L2 | Status card tidak memiliki state `isDisconnecting` | **P3 Low** | Pengguna hanya melihat button disabled tanpa konteks "Mengakhiri panggilan..." di area status | `PhoneInterface.tsx:499-532` | UX |

---

## 4. Detail Temuan

### H1 — Halaman Simulasi Menunggu Scoring Sebelum Home (P1 High)

**Lokasi:** `apps/web/src/routes/telefun/index.tsx:265-385` dan `apps/web/src/routes/telefun/sessionFinalizer.ts:242-257`

**Deskripsi:**
Ketika pengguna mengakhiri panggilan, alur berikut terjadi:
1. `PhoneInterface.tsx:280-309` — callback `onRecordingComplete` memanggil `onRecordingReadyRef.current(...)`.
2. `index.tsx:265-385` — `handleRecordingReady` menunggu `await finalizeTelefunSession(...)` (baris 316).
3. `sessionFinalizer.ts:242-257` — di dalam `finalizeTelefunSession`, scoring dijalankan dengan **`await deps.scoreSession(params.sessionId)`** (baris 248).
4. Baru setelah semua selesai, `setView("home")` di `index.tsx:382` dieksekusi.

**Bukti:**
```typescript
// index.tsx:316-326 — finalizeTelefunSession di-await sebelum setView("home")
const { record, scoringStatus, saveFailed, uploadFailed } =
  await finalizeTelefunSession({ ... });

// index.tsx:379-385 — finally block, setelah await finalizeTelefunSession
} finally {
  setActiveSessionId(null);
  setActiveScenario(null);
  setView("home");              // ← Home baru tercapai setelah scoring selesai
  setActiveSessionConfig(null);
  setActiveAccessToken(null);
}
```

```typescript
// sessionFinalizer.ts:242-257 — scoring blocking di critical path
// 7. Score session (only if agent recording existed)
if (agentRecordingPath) {
  try {
    const scoring = await deps.scoreSession(params.sessionId);  // ← BLOCKING
    score = scoring.score;
    feedback = scoring.feedback;
    voiceAssessment = scoring.assessment;
    status.scoringStatus = "succeeded";
  } catch (err) {
    status.scoringStatus = "failed";
  }
}
```

**Dampak:** Pengguna melihat halaman simulasi dalam state "selesai" tetapi tidak bisa meninggalkannya selama scoring berlangsung (bisa 2-10 detik tergantung provider dan jaringan). Tidak ada indikator loading/status bahwa scoring sedang berjalan.

---

### H2 — OpenAI `response.cancel` Tidak Dikirim Saat Disconnect (P1 High)

**Lokasi:** `apps/web/src/routes/telefun/services/liveSession.ts:1032-1083`

**Deskripsi:**
Saat disconnect untuk transport OpenAI (`openai-audio`), `performDisconnect` tidak mengirim `response.cancel` ke provider. Alurnya:
1. Baris 1035-1036: `intentionalClose = true` (guard di-set).
2. Baris 1039: `clearAiPlayback("disconnect")` — hanya `stopActiveSources()` + `setIsAiSpeaking(false)`, TIDAK mengirim `response.cancel`.
3. Baris 1046-1052: Kirim `buildAudioStreamEndMessage()` dan `buildSessionEndRequest(reason)` — ini pesan protokol Telefun, bukan `response.cancel` OpenAI.
4. Baris 1054-1070: Drain WebSocket menunggu `session_end_complete`.
5. Baris 1075: WS di-close.

Meskipun ada fungsi `buildOpenAiResponseCancel()` (di `liveProtocol/openai.ts:44`) dan digunakan di interruption handler (liveSession.ts:515), fungsi tersebut **tidak dipanggil** dalam `performDisconnect`. Setelah `intentionalClose = true`, fungsi `sendOpenAiEvent` (line 909-917) juga memblokir pengiriman event lebih lanjut.

**Bukti:**
```typescript
// liveSession.ts:909-917 — sendOpenAiEvent diblokir oleh intentionalClose
private sendOpenAiEvent(event: unknown) {
  if (
    !this.intentionalClose &&        // ← Guard: blokir setelah disconnect
    this.hasConfigured &&
    this.ws?.readyState === WebSocket.OPEN
  ) {
    this.ws.send(JSON.stringify(event));
  }
}

// liveSession.ts:1032-1083 — performDisconnect tidak memanggil response.cancel
private async performDisconnect(...): Promise<void> {
  if (this.intentionalClose) return;
  this.intentionalClose = true;
  this.clearSetupTimeout();
  this.stopStalledWatchdog();
  this.clearAiPlayback("disconnect");  // ← Tidak kirim response.cancel
  this.stopRecordingOnce();
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    // Kirim stream-end + session-end → pesan protokol Telefun, BUKAN response.cancel
    this.ws.send(JSON.stringify(buildAudioStreamEndMessage()));
    this.ws.send(JSON.stringify(buildSessionEndRequest(reason)));
    // drain + close...
  }
}
```

```typescript
// liveProtocol/openai.ts:44 — response.cancel sudah ada implementasinya
return { type: "response.cancel" as const };
```

**Dampak:** Provider OpenAI tidak mendapat sinyal `response.cancel` → potensi:
- Response AI terus berjalan (menghabiskan token/quota).
- Audio residual dari server tetap dikirim ke WebSocket (tapi sudah di-drain, jadi mungkin tertahan di proxy).
- Perilaku tidak sinkron antara client dan provider.

---

### H3 — Risiko Audio AI Selama Drain WebSocket (P1 High)

**Lokasi:** `apps/web/src/routes/telefun/services/liveSession.ts:766-822` (`playPcm`), `236-249` (`onmessage`), `351-365` (`handleJsonMessage`)

**Deskripsi:**
Selama periode drain WebSocket (hingga 5 detik, liveSession.ts:1054), fungsi `onmessage` (baris 236) masih aktif menerima dan merutekan pesan dari WebSocket:
- Binary → `playPcm` (baris 238-241): memproses dan memainkan audio PCM tanpa memeriksa `intentionalClose`.
- JSON → `handleJsonMessage` (baris 244-245): dapat memicu `setIsAiSpeaking(true)` (baris 356) dan `playPcm` (baris 365).

Fungsi `playPcm` (baris 766-822) memiliki guard yang hanya memeriksa `!this.audioContext || !this.recordingDestination || this.isHeld` — **tidak ada pengecekan `this.intentionalClose`**. Audio yang sudah masuk buffer bisa tetap diputar.

**Bukti:**
```typescript
// liveSession.ts:766-771 — playPcm tidak cek intentionalClose
private playPcm(
  data: Uint8Array,
  sampleRate = 24000,
  openAiOwner?: OpenAiPlaybackOwner,
) {
  if (!this.audioContext || !this.recordingDestination || this.isHeld) return;
  // ↑ Tidak ada cek intentionalClose! Audio tetap diproses.
```

```typescript
// liveSession.ts:236-249 — onmessage masih aktif menerima data selama drain
this.ws.onmessage = async (event) => {
  if (event.data instanceof ArrayBuffer) {
    this.playPcm(         // ← Binary audio tetap diputar selama drain
      new Uint8Array(event.data),
      this.audioConfiguration.outputSampleRateHz,
    );
  } else {
    const msg = JSON.parse(event.data);
    this.handleJsonMessage(msg);  // ← JSON tetap diproses
  }
};
```

```typescript
// liveSession.ts:351-365 — handleJsonMessage bisa memicu AI speaking selama drain
if (msg.serverContent?.modelTurn?.parts) {
  this.setIsAiSpeaking(true);       // ← Masih bisa set speaking
}
const chunks = extractGeminiInlineAudioChunks(msg, ...);
for (const chunk of chunks) {
  this.playPcm(chunk.data, chunk.sampleRate);  // ← Audio diputar
}
```

**Dampak:** Pengguna yang sudah klik "End Call" masih bisa mendengar suara AI (atau potongan suara) selama drain WebSocket hingga 5 detik. Ini menciptakan pengalaman yang membingungkan — audio AI terdengar setelah tombol end-call ditekan.

---

### M1 — Ketiadaan Timeout Recording Finalization (P2 Medium)

**Lokasi:** `apps/web/src/routes/telefun/services/liveSession.ts:1083`, `1104-1106`

**Deskripsi:**
Di baris 1083, `performDisconnect` menunggu `recordingFinalizationPromise`:
```typescript
await this.recordingFinalizationPromise.catch(() => {});
```

Promise ini dibuat di `stopRecording()` (baris 1104-1106):
```typescript
this.recordingFinalizationPromise = new Promise<void>((resolve) => {
  this.resolveRecordingFinalization = resolve;
});
```

Promise ini hanya di-resolve setelah `emitRecording()` selesai (baris 1151-1153). Tidak ada timeout wrapper — jika `onRecordingComplete` callback di `emitRecording()` mengalami error/hang, `performDisconnect` akan menggantung selamanya.

Bandingkan dengan `LiveSessionDrain` (`liveSessionDrain.ts:14-17`) yang memiliki mekanisme timeout 5 detik bawaan.

**Dampak:** Skenario error di `onRecordingComplete` (misalnya network timeout di `handleRecordingReady` → `finalizeTelefunSession`) dapat mengakibatkan:
- Halaman simulasi terkunci (tidak bisa navigasi home).
- Pengguna harus me-refresh browser.
- `disconnectPromise` cached selamanya — instance session tidak bisa di-reconnect.

---

### M2 — UX Indikator End-Call Tidak Memadai (Mobile) (P2 Medium)

**Lokasi:** `apps/web/src/routes/telefun/components/PhoneInterface.tsx:736-742`

**Deskripsi:**
Label teks "Mengakhiri..." yang muncul saat `isDisconnecting` menggunakan class `hidden md:block`:

```typescript
// PhoneInterface.tsx:736-742
<span
  className={`text-[10px] uppercase font-bold tracking-wider hidden md:block ${
    isDisconnecting ? "text-red-400" : "text-red-500/70"
  }`}
>
  {isDisconnecting ? "Mengakhiri..." : "Hangup"}
</span>
```

`hidden md:block` berarti teks ini **hanya terlihat di layar ukuran medium ke atas (≥768px)**. Di perangkat mobile, pengguna hanya melihat:
- Tombol merah `PhoneOff` yang di-disable (`opacity-50`, `cursor-not-allowed`).
- Tidak ada teks yang menjelaskan bahwa proses end-call sedang berlangsung.

**Dampak:** Pengguna mobile tidak mendapat informasi yang cukup tentang status sistem. Mereka mungkin mengira tombol rusak atau aplikasi freeze, lalu mencoba klik ulang (meski ada guard `endCallStartedRef`).

---

### L1 — Forced 500ms Delay (P3 Low)

**Lokasi:** `apps/web/src/routes/telefun/services/liveSession.ts:1108-1110`

**Deskripsi:**
Di `stopRecording()`, `emitRecording()` dipanggil melalui `setTimeout` 500ms:
```typescript
setTimeout(() => {
  this.emitRecording();
}, 500);
```

Tidak ada komentar atau dokumentasi yang menjelaskan alasan 500ms. Tidak ada mekanisme untuk mempercepat (misalnya jika recording sudah siap lebih awal). Ini menambah 500ms minimum pada setiap alur end-call.

**Dampak:** Setiap sesi Telefun mendapat tambahan latency 500ms pada end-call. Jika 500ms adalah margin keamanan untuk memastikan blob recording final, seharusnya dijadikan timeout maksimum (bukan fixed delay).

---

### L2 — Status Card Tidak Memiliki State `isDisconnecting` (P3 Low)

**Lokasi:** `apps/web/src/routes/telefun/components/PhoneInterface.tsx:499-532`

**Deskripsi:**
Blok conditional status card (baris 499-532) hanya mencakup state: `isOnHold`, `isRinging`, `Tersambung` (dengan sub-state `isAiSpeaking`), dan error. **Tidak ada kondisi untuk `isDisconnecting`**. Saat `isDisconnecting = true`, status card masih menampilkan state "Tersambung" yang terakhir.

**Bukti:**
```typescript
// PhoneInterface.tsx:499-532 — tidak ada kondisi isDisconnecting
let statusText = "Menghubungkan...";
// ... hanya mencakup isOnHold, isRinging, Tersambung, error
if (isOnHold) { ... }
else if (isRinging) { ... }
else if (connectionState === "Tersambung") { ... }
else if (connectionState.startsWith("Error") || error) { ... }
```

**Dampak:** Selama proses end-call (bisa memakan waktu 5-15 detik karena upload + scoring), status card menampilkan informasi yang tidak akurat — mengatakan "Konsumen sedang berbicara..." atau "menunggu respon" padahal end-call sedang berlangsung.

---

## 5. Hal yang Sudah Baik

Beberapa aspek yang sudah diimplementasikan dengan baik dalam alur end-call:

| Aspek | File:Line | Detail |
|-------|-----------|--------|
| **Guard double-execution** | `PhoneInterface.tsx:398-399` | `endCallStartedRef.current` mencegah `handleEndCall` dipanggil dua kali — konkurensi aman. |
| **Idempotent disconnect** | `liveSession.ts:1026-1028` | `disconnectPromise` caching memastikan `performDisconnect` hanya dijalankan sekali. |
| **Drain WebSocket timeout** | `liveSession.ts:1054`, `liveSessionDrain.ts:14-17` | Drain memiliki mekanisme timeout 5s — tidak menggantung selamanya. |
| **Recording finalization chaining** | `liveSession.ts:1083` | Promise-based: `performDisconnect` menunggu recording selesai sebelum resolve. |
| **`intentionalClose` guard** | `liveSession.ts:121, 1035-1036` | Flag mencegah banyak operasi berjalan setelah disconnect dimulai. |
| **`hasStoppedRecording` guard** | `liveSession.ts:1086-1088` | Mencegah double-stop recording. |
| **`isDisconnecting` untuk UI** | `PhoneInterface.tsx:400, 720-731` | Tombol end-call di-disable + class visual (opacity, cursor) saat disconnecting. |
| **Error handling di finalize** | `sessionFinalizer.ts:202-203, 253-255, 360-365` | Setiap langkah (patch, upload, scoring) punya try/catch dengan fallback. |
| **Fallback session creation** | `index.tsx:277-308` | Jika `activeSessionId` hilang, session dibuat ulang sebagai fallback. |
| **Optimistic record ID** | `index.tsx:311-312` | Record ID di-cache untuk menghindari duplikasi di history. |

---

## 6. Discrepancy: Dokumentasi vs Runtime

**Sumber dokumentasi:** `docs/telefun.md:250-261`

Dokumentasi menyebutkan alur scoring sebagai proses **background**:

```
6. SCORING (background):          ← docs/telefun.md:255
   a. Worker ambil session → analisis voice quality (AI)
   b. Hitung hold assessment
   c. Simpan score, feedback, voice assessment
```

**Realisasi runtime** (`sessionFinalizer.ts:242-257`):

```typescript
// 7. Score session (only if agent recording existed)
if (agentRecordingPath) {
  try {
    const scoring = await deps.scoreSession(params.sessionId);  // ← BLOCKING
    // ...
  } catch (err) {
    status.scoringStatus = "failed";
  }
}
```

Scoring dijalankan **secara synchronous (blocking)** dalam `finalizeTelefunSession` yang dipanggil dari `handleRecordingReady` (`index.tsx:316`). Pengguna tidak bisa navigasi ke home sebelum scoring selesai.

**Rekomendasi:** Jika scoring dimaksudkan sebagai background worker (sesuai docs), maka `scoreSession` seharusnya dipanggil secara fire-and-forget atau dipindahkan ke worker terpisah. Jika scoring harus tetap blocking (karena diperlukan untuk review), dokumentasi perlu diperbarui.

> **Catatan:** Ada kemungkinan dokumentasi `docs/telefun.md:255` merujuk pada worker scoring di `apps/api/src/workers/telefun-scoring-worker.ts` yang menangani scoring untuk sesi yang di-recall dari history. Namun untuk sesi real-time yang baru selesai, scoring tetap blocking di endpoint API (`apps/api/src/services/telefun-scoring-service.ts`).

---

## 7. Ringkasan Gbrain yang Dibaca

Tiga halaman Gbrain berikut telah dibaca untuk konteks audit ini:

| Halaman Gbrain | Ringkasan Konten | Relevansi dengan Audit |
|----------------|------------------|------------------------|
| **`telefun/bug-bounty`** | Laporan bug bounty Telefun — 10 temuan (3 🔴 4 🟡 3 🟢), status **Hardened & Audited**. Mencakup temuan terkait disconnect, WebSocket, dan audio. | Audit ini mengkonfirmasi bahwa beberapa temuan bug bounty terkait end-call masih belum sepenuhnya terselesaikan (terutama audio AI selama drain). |
| **`telefun/provider-matched-scoring`** | Implementasi provider-matched scoring — sesi OpenAI dievaluasi via endpoint internal OpenAI, sesi Gemini via Gemini 3.5 Flash. Menggunakan `TELEFUN_INTERNAL_TOKEN` untuk auth. | Menjelaskan bahwa scoring menggunakan endpoint internal yang synchronous — bukan background worker murni. |
| **`telefun/gpt-realtime-plan`** | Rencana implementasi GPT Realtime 2.1 — dual provider voice, runtime prompt contract, pricing. | Memberikan konteks mengapa `response.cancel` penting untuk OpenAI transport — protokol realtime memerlukan sinyal eksplisit. |

---

## 8. Rekomendasi Surgical (Karpathy-style)

Berikut rekomendasi berbasis bukti — **minimum scope, tidak ada speculative refactor**. Setiap rekomendasi terikat langsung pada temuan.

### Rekomendasi H1 — Pindahkan Scoring ke Post-Navigasi (P1 High)

```
Temuan:    Halaman simulasi menunggu scoring sebelum home.
Prinsip:   Jangan blokir navigasi pengguna untuk proses yang tidak memerlukan interaksi.
Rekomendasi: Pisahkan scoring dari critical path navigasi.
```

**Surgical fix di `index.tsx`:**

Di `handleRecordingReady` (`index.tsx:265`), setelah `finalizeTelefunSession` menyelesaikan upload dan patch session, pindahkan navigasi home **sebelum** scoring. Atau ekstrak scoring dari `finalizeTelefunSession` dan panggil secara terpisah.

**Approach A (minimal):** Tambahkan `setView("home")` di awal `handleRecordingReady` setelah upload berhasil, sebelum scoring. Simpan `scoringStatus` untuk ditampilkan nanti.

**Approach B (lebih bersih):** Pisahkan `finalizeTelefunSession` menjadi dua langkah:
1. `saveSessionData()` — upload, patch, remux (blocking, diperlukan).
2. `triggerScoring()` — fire-and-forget (tidak blocking).

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/index.tsx` — restruktur `handleRecordingReady`.
- `apps/web/src/routes/telefun/sessionFinalizer.ts` — (opsional) ekstrak scoring.

**Bukan scope:**
- Tidak mengubah arsitektur scoring worker di `apps/api`.
- Tidak mengubah mekanisme remux atau upload.

### Rekomendasi H2 — Kirim `response.cancel` Sebelum Disconnect (P1 High)

```
Temuan:    OpenAI response.cancel tidak dikirim saat disconnect.
Prinsip:   Beri sinyal eksplisit ke provider sebelum menutup koneksi.
Rekomendasi: Kirim response.cancel di performDisconnect sebelum drain (khusus OpenAI transport).
```

**Surgical fix di `liveSession.ts`:**

Tambahkan pengiriman `buildOpenAiResponseCancel()` di `performDisconnect` (sebelum baris 1044), khusus untuk transport `openai-audio`:

```typescript
// Di performDisconnect, setelah baris 1039 (clearAiPlayback), sebelum drain
// Kirim response.cancel jika OpenAI transport
if (this.hasConfigured && this.config.telefunTransport === "openai-audio") {
  this.ws?.send(JSON.stringify(buildOpenAiResponseCancel()));
}
```

Atau, jangan set `intentionalClose = true` terlalu awal — biarkan `sendOpenAiEvent` (yang memiliki guard `!this.intentionalClose`) bisa mengirim cancel terlebih dahulu.

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/services/liveSession.ts` — tambahkan `response.cancel` di `performDisconnect`.

**Bukan scope:**
- Tidak mengubah mekanisme `sendOpenAiEvent` guard secara global.
- Tidak menambah state machine baru.

### Rekomendasi H3 — Guard `intentionalClose` di `playPcm` (P1 High)

```
Temuan:    Audio AI bisa diputar selama drain WebSocket.
Prinsip:   Jika user sudah klik end-call, jangan mainkan audio apapun.
Rekomendasi: Tambahkan guard intentionalClose di playPcm.
```

**Surgical fix di `liveSession.ts:766-771`:**

```typescript
private playPcm(data: Uint8Array, sampleRate = 24000, openAiOwner?: OpenAiPlaybackOwner) {
  if (!this.audioContext || !this.recordingDestination || this.isHeld || this.intentionalClose) return;
  //                                                                   ^^^^^^^^^^^^^^^^^^^^ tambahan
  // ... existing code ...
}
```

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/services/liveSession.ts` — guard di `playPcm`.

**Bukan scope:**
- Tidak mengubah drain mechanism.
- Tidak menutup WebSocket lebih awal.
- Tidak mengubah `handleJsonMessage`.

### Rekomendasi M1 — Tambahkan Timeout pada Recording Finalization (P2 Medium)

```
Temuan:    recordingFinalizationPromise tanpa timeout.
Prinsip:   Setiap async wait harus punya batas waktu.
Rekomendasi: Bungkus recordingFinalizationPromise dengan timeout (mirip LiveSessionDrain).
```

**Surgical fix di `liveSession.ts:1083`:**

```typescript
// Ganti:
await this.recordingFinalizationPromise.catch(() => {});

// Menjadi:
await Promise.race([
  this.recordingFinalizationPromise.catch(() => {}),
  new Promise<void>((resolve) => setTimeout(resolve, 10000)), // 10s safety timeout
]);
```

Atau gunakan class `LiveSessionDrain` yang sudah ada (reuse pattern).

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/services/liveSession.ts` — race promise di baris 1083.

**Bukan scope:**
- Tidak mengubah `stopRecording()` atau `emitRecording()`.
- Tidak menambah dependencies baru.

### Rekomendasi M2 — Tampilkan Label "Mengakhiri..." di Mobile (P2 Medium)

```
Temuan:    Label end-call hidden di mobile.
Prinsip:   Informasi status harus tersedia di semua ukuran layar.
Rekomendasi: Hapus hidden md:block, gunakan class responsive yang lebih inklusif.
```

**Surgical fix di `PhoneInterface.tsx:736-742`:**

```typescript
// Ganti:
className={`text-[10px] uppercase font-bold tracking-wider hidden md:block ${...}`}

// Menjadi:
className={`text-[10px] uppercase font-bold tracking-wider block ${...}`}
```

Atau gunakan ukuran teks lebih kecil di mobile dan normal di desktop:
```typescript
className={`text-[8px] md:text-[10px] uppercase font-bold tracking-wider block ${...}`}
```

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/components/PhoneInterface.tsx` — class span.

**Bukan scope:**
- Tidak mengubah layout tombol.
- Tidak menambah komponen baru.

### Rekomendasi L1 — Dokumentasikan atau Kurangi 500ms Delay (P3 Low)

```
Temuan:    Forced 500ms delay pada emitRecording.
Prinsip:   Setiap hardcoded delay harus memiliki alasan dan batas, bukan fixed wait.
Rekomendasi: Tambahkan komentar yang menjelaskan alasan 500ms, atau gunakan race pattern.
```

**Surgical fix di `liveSession.ts:1108-1110`:**

```typescript
// Opsi A: Tambahkan komentar
// Beri waktu 500ms agar MediaRecorder.onstop selesai memfinalisasi blob.
// Lihat: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop
setTimeout(() => { this.emitRecording(); }, 500);

// Opsi B: Gunakan race (jika blob siap lebih awal dari 500ms, segera emit)
// Namun ini memerlukan mekanisme deteksi "blob ready" dari MediaRecorder.
```

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/services/liveSession.ts` — komentar atau optimasi.

**Bukan scope:**
- Tidak mengubah mekanisme recording.
- Tidak menambah event listener baru.

### Rekomendasi L2 — Tambahkan Status `isDisconnecting` ke Status Card (P3 Low)

```
Temuan:    Status card tidak mencakup state isDisconnecting.
Prinsip:   Status UI harus mencerminkan state aktual sistem.
Rekomendasi: Tambahkan kondisi isDisconnecting ke blok statusText.
```

**Surgical fix di `PhoneInterface.tsx:499-532`:**

```typescript
// Tambahkan setelah blok error atau sebelum blok isOnHold:
if (isDisconnecting) {
  statusText = "Mengakhiri panggilan...";
  statusBg = "bg-red-900/40";
  statusTextColor = "text-red-400";
  statusBorder = "border-red-500/30";
}
```

**File yang perlu diubah:**
- `apps/web/src/routes/telefun/components/PhoneInterface.tsx` — blok conditional status.

**Bukan scope:**
- Tidak mengubah logika end-call.
- Tidak menambah komponen baru.

---

## 9. Acceptance Criteria

Setelah rekomendasi diterapkan, kriteria berikut harus terpenuhi:

| ID | Kriteria | Terkait |
|----|----------|---------|
| AC1 | Pengguna dapat kembali ke home **tanpa menunggu scoring** selesai | H1 |
| AC2 | OpenAI `response.cancel` dikirim ke provider sebelum WebSocket ditutup (khusus `openai-audio` transport) | H2 |
| AC3 | Tidak ada audio AI yang terdengar setelah tombol End Call diklik (selama drain window) | H3 |
| AC4 | Jika `onRecordingComplete` hang/gagal, disconnect tetap selesai dalam ≤10 detik | M1 |
| AC5 | Label "Mengakhiri..." terlihat di semua ukuran layar (mobile & desktop) | M2 |
| AC6 | 500ms delay memiliki komentar dokumentasi atau dioptimasi dengan race pattern | L1 |
| AC7 | Status card menampilkan "Mengakhiri panggilan..." saat `isDisconnecting = true` | L2 |
| AC8 | Semua acceptance criteria di atas diverifikasi dengan **unit test** (bukan manual/live-browser) | Seluruhnya |

---

## 10. Test Matrix

Matriks pengujian untuk setiap temuan. Test harus ditulis sebelum implementasi (TDD — RED/GREEN).

### H1 — Scoring Post-Navigasi

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-H1.1 | End call → finalize sukses (tanpa scoring blocking) | `setView("home")` dipanggil sebelum scoring resolve | Unit (index.tsx) |
| T-H1.2 | End call → scoring gagal | Home tetap tercapai, `scoringStatus = "failed"` | Unit (index.tsx) |
| T-H1.3 | End call → scoring lambat (>3s) | Tidak delay navigasi home | Unit (sessionFinalizer.ts) |

### H2 — OpenAI response.cancel

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-H2.1 | Disconnect dengan `openai-audio` transport | `response.cancel` dikirim via WS sebelum drain | Unit (liveSession.test.ts) |
| T-H2.2 | Disconnect dengan `gemini-live` transport | `response.cancel` **tidak** dikirim | Unit (liveSession.test.ts) |
| T-H2.3 | Double disconnect | `response.cancel` hanya dikirim sekali | Unit (liveSession.test.ts) |

### H3 — Guard Audio AI Selama Drain

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-H3.1 | PCM data diterima setelah `intentionalClose = true` | `playPcm` return early (no audio) | Unit (liveSession.test.ts) |
| T-H3.2 | JSON `modelTurn` diterima setelah `intentionalClose = true` | `playPcm` tidak dipanggil | Unit (liveSession.test.ts) |
| T-H3.3 | Audio sudah di buffer sebelum disconnect | Audio tidak diputar (atau dihentikan) | Unit (liveSession.test.ts) |

### M1 — Timeout Recording Finalization

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-M1.1 | `onRecordingComplete` hang >10s | Disconnect tetap resolve | Unit (liveSession.test.ts) |
| T-M1.2 | `onRecordingComplete` error | Disconnect resolve, error tercatat | Unit (liveSession.test.ts) |
| T-M1.3 | `onRecordingComplete` sukses <10s | Disconnect resolve dengan normal | Unit (liveSession.test.ts) |

### M2 — Label Mobile

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-M2.1 | `isDisconnecting = true`, viewport ≤767px | Teks "Mengakhiri..." visible | Unit/Component (PhoneInterface.test.tsx) |
| T-M2.2 | `isDisconnecting = false`, viewport ≤767px | Teks "Hangup" visible | Unit/Component |

### L1 — 500ms Delay

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-L1.1 | `stopRecording()` dipanggil | Ada komentar yang menjelaskan delay | Code review |
| T-L1.2 | (Opsional) Blob ready <500ms | `emitRecording()` tidak menunggu 500ms penuh | Unit (liveSession.test.ts) |

### L2 — Status Card

| Test Case | Input | Expected | Level |
|-----------|-------|----------|-------|
| T-L2.1 | `isDisconnecting = true` | `statusText` = "Mengakhiri panggilan..." | Unit/Component (PhoneInterface.test.tsx) |
| T-L2.2 | `isDisconnecting = true` kemudian `false` | Status kembali ke state sebelumnya | Unit/Component |

---

## 11. Scope File Implementasi Potensial

Berdasarkan rekomendasi surgical di atas, berikut daftar file yang **berpotensi** diubah — dengan catatan bahwa audit ini adalah READ-ONLY dan tidak mengubah file apapun.

| File | Perubahan Potensial | Risiko |
|------|---------------------|--------|
| `apps/web/src/routes/telefun/index.tsx` | Restruktur `handleRecordingReady` — pindahkan navigasi home sebelum/tanpa menunggu scoring | **Sedang** — Perlu test ulang alur finalisasi dan review |
| `apps/web/src/routes/telefun/sessionFinalizer.ts` | Opsional: ekstrak scoring dari `finalizeTelefunSession` | **Sedang** — API return type berubah |
| `apps/web/src/routes/telefun/services/liveSession.ts` | 4 area: (1) tambah `response.cancel` di `performDisconnect`, (2) guard `intentionalClose` di `playPcm`, (3) timeout `recordingFinalizationPromise`, (4) dokumentasi 500ms | **Rendah** — Masing-masing perubahan surgical dan terisolasi |
| `apps/web/src/routes/telefun/components/PhoneInterface.tsx` | 2 area: (1) hapus `hidden md:block`, (2) tambah kondisi `isDisconnecting` di status card | **Rendah** — Hanya perubahan class CSS dan conditional rendering |

**File yang TIDAK masuk scope:**
- `apps/telefun/` (backend proxy) — tidak ada perubahan di service Telefun.
- `apps/api/` — tidak ada perubahan di scoring worker atau service API.
- `packages/types/` — tidak ada perubahan tipe data.
- `docs/telefun.md` — update dokumentasi terpisah, bukan bagian dari audit.
- `docs/pdkt-system-prompt-audit.md` — file audit PDKT yang sudah ada, harus tetap untouched.

**Prioritas implementasi:** H1 → H2 → H3 → M1 → M2 → L2 → L1

---

*Dokumen ini adalah audit read-only. Tidak ada perubahan kode yang dilakukan.*
*Audit berdasarkan komit source code per 21 Juli 2026.*
