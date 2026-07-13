# Telefun Auth, Scoring, dan Local History Hardening

## Scope

Perubahan ini menerapkan hasil validasi commit `728c31c2679268234e4b10908bef2e0aa189420f` untuk temuan #1, #2, #3, #8, dan #9. Temuan hold oscillator, keepalive, `nextStartTime`, `activeSessionConfig`, dan callback default dinyatakan invalid pada validasi dan tidak diubah.

## Perubahan

- Token Telefun dibaca sekali dari `localStorage.auth_token` di landing page, diteruskan melalui `PhoneInterface`, dan dipakai oleh `LiveSession.connect(accessToken)`.
- URL WebSocket tidak lagi memuat `token` atau `sessionId`. Frame pertama adalah `authenticate`; standalone server memiliki pre-auth gate, auth timeout 10 detik, guard auth paralel/duplikat, JWT verification, ownership check, dan response `auth_ok` sebelum Gemini dibuka.
- Finalizer mengembalikan `scoringStatus`: `succeeded` saat scoring berhasil, `failed` saat scoring sudah dicoba tetapi error, dan `skipped` saat agent recording path tidak tersedia. Score valid `0` tetap dipatch.
- Local history memvalidasi hasil parse sebagai array. JSON malformed/non-array memicu warning aman, tidak menghapus storage, dan tidak menghentikan merge history dari server.
- Audit pasca-implementasi menutup tiga gap: URL env legacy tidak lagi tercetak mentah, close saat auth gagal langsung membersihkan timer/audio secara idempotent, dan payload local history corrupt tidak ditimpa saat history server dimuat.
- Pre-auth state dipisahkan ke `TelefunAuthGate` agar invalid token, foreign session, auth paralel/duplikat, dan initialization error dapat diuji tanpa membuka Gemini.
- Final review memperketat recovery history: guard corrupt diinisialisasi sebelum request history server, dipertahankan selama component lifecycle sehingga finalization/delete/assessment otomatis tidak menimpa payload, clear-history eksplisit mereset guard, dan setiap elemen array divalidasi sebagai `CallRecord` sebelum merge.

## Verification

- Web focused Telefun suite: 51/51 passing.
- Standalone Telefun auth/protocol/close suite: 36/36 passing.
- Context7 lookup: `ws` `/websockets/ws/8_18_3`, untuk authentication boundary, connection/message lifecycle, dan heartbeat cleanup.
- Final gates selesai: `pnpm lint` exit 0 dengan 0 error (warning existing), `pnpm build` exit 0, `pnpm test:core` exit 0, dan `git diff --check` bersih.

## Deployment note

Web app dan standalone Telefun server harus dideploy atomik. Client versi baru tidak kompatibel dengan server yang masih mengharuskan query token, dan server versi baru tidak akan membuka Gemini untuk client yang belum mengirim auth frame.
