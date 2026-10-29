# Telefun nonverbal clips

Status per 2026-10-29: approved for playback integration. Fajar listened to and approved all 40 WAVs. They passed the generator's format, duration, byte-order, and total-size checks (1.82 MiB, below 3 MB). The review copy is in `~/Downloads/Telefun Sampel Suara/11 Klip final/`.

All files use mono PCM16 WAV at 24 kHz. Angry clips are limited to 1.2 seconds; sad clips are limited to 2.0 seconds. PCM is written little-endian as returned by the Interactions API. The generation script checks the RIFF format, duration, and little-endian versus big-endian zero-crossing rates. It validated all 40 files at 1.82 MiB total.

## Generated source

- Model: `gemini-3.8-flash-tts`.
- Endpoint: `POST /v1beta/interactions`, streaming audio response `audio/l16`, 24 kHz.
- Generated on: 2026-10-29.
- Angry style: `konsumen yang sedang kesal dan tidak sabar di telepon, tanpa kata`.
- Sad style: `orang yang menahan tangis, napas basah, sengau`.
- Tags: `sigh`, `groan`, `tsk`, `pff`, `heavy breath` (stored as `exhale`), `sob`, and `whimper`.
- Origin: one Gemini TTS request per generated variant, named `<voice>/<kind>-<variant>.wav`.
- Tool: `scripts/telefun/generate-nonverbal-clips.mjs`; it is run manually and is not wired to a package script, build, CI, or runtime.

## Reused approved sources

| Output | Source |
| --- | --- |
| `kore/{sigh,groan,tsk,pff,exhale}-{1,2}.wav` | `~/Downloads/Telefun Sampel Suara/7 Klip marah TTS + Live/Kore-{sigh,groan,tsk,pff,exhale}-r{1,2}.wav` |
| `kore/sniffle-{1,2}.wav` | `~/Downloads/Telefun Sampel Suara/6 Sniffle TTS/Kore-2-r{1,2}.wav` |
| `kore/sob-1.wav` | `~/Downloads/Telefun Sampel Suara/5 Klip tangis TTS + Live/clip-Kore-sob.wav`; trimmed to 2.0 seconds with an 80 ms fade-out |
| `kore/whimper-1.wav` | `~/Downloads/Telefun Sampel Suara/5 Klip tangis TTS + Live/clip-Kore-whimper.wav`; silence trimmed and capped at 2.0 seconds |
| `algieba/sniffle-{1,2}.wav` | `~/Downloads/Telefun Sampel Suara/9 Live sedih - kandidat suara/sniffle-Algieba-r{1,2}.wav` |

The approved-source recordings were copied from Fajar's prior listening set. The copied PCM payloads remain unchanged except for the two Kore crying clips described above.
