# Telefun Telaah: download each recording once

- **Status:** Done 2026-10-19 (Fajar asked why Supabase egress reached 91% of the Free quota; the coordinator picked the defaults).
- **Lane:** C (frontend behavior change across a hook, a component and E2E; no API, schema or contract change).

## Requirement

Opening the Telefun Telaah page pulled the combined recording from Supabase Storage at least twice: `decodeEnvelope` fetched it whole for the waveform, then the `<audio>` element streamed it again with range requests (and again after seeks). Each visit also got a new signed URL, so the browser could not reuse its cache. Production logs showed one 14 MB recording costing ~133 MB of storage egress on 2026-10-17.

**Acceptance:** opening Telaah, playing and seeking downloads the combined recording once and the agent-only recording once. An expired first link is replaced once; a recording that still fails shows "Rekaman belum bisa dimuat." with Coba lagi.

## Design

`useTelefunRecordingUrl` downloads the server recording once into a `blob:` URL and returns that as the source. The waveform decode, the player, seeking and the download button all read the local copy. The download requests one new signed link if the first answers non-OK, then fails. The object URL is revoked on cleanup. Local-only recordings (no server path) are unchanged. Playback now starts after the file has downloaded; the waveform already needed the whole file.

## Tasklist

- [x] RED: `telefun-flow.spec.ts` "rekaman diunduh sekali per halaman" failed with `full: 2`.
- [x] GREEN: same spec passes (`full: 1, agent: 1`); the expired-link spec now asserts one replacement, no new link after load, and Coba lagi on repeated failure.
- [x] Regression: `telefun-flow`, `telefun-history`, `monitoring-sesi` specs; web `tsc --noEmit`.
