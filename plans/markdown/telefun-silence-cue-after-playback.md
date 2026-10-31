# Telefun: jeda teguran agen diam dihitung dari akhir suara konsumen

## Requirement

- Teguran `[TELEFUN_CONTROL:AGENT_SILENT]` hanya terkirim setelah 5 detik hening
  yang benar-benar terdengar: dihitung dari akhir suara konsumen AI yang diputar
  di browser, atau dari akhir ucapan agen.
- `turnComplete` dari Gemini datang saat server selesai mengirim, sering kali
  sebelum audio yang mengantre selesai diputar. Titik itu tidak boleh menjadi
  awal jeda bila masih ada audio yang diputar.
- Perilaku lain tetap: satu teguran per jeda, tidak saat hold/mute, dan jeda baru
  setelah agen bicara lalu diam.

## Design

- `apps/web/src/routes/telefun/services/liveSession.ts`: pada `turnComplete`,
  panggil `markQuietSince` hanya bila antrean audio sudah kosong. Bila masih ada
  audio, `onended` sumber terakhir (yang menyelesaikan `pendingTurnCompletion`)
  memanggil `markQuietSince(Date.now())`.
- `AgentSilenceCueTimer` tidak berubah.

## Tasklist

- [x] RED: `apps/web/e2e/telefun-agent-silence.spec.ts` — audio konsumen panjang,
      jam maju 6 detik selama audio diputar; tidak boleh ada teguran sebelum
      5 detik setelah audio selesai.
- [x] GREEN: pindahkan titik awal jeda ke akhir pemutaran.
- [x] Spec silence penuh hijau, typecheck web, thermo-nuclear, CHANGELOG.
