# Telefun waveform under production CSP

## Requirement

Resolve the user's report that the deployed Telaah waveform still appears flat
in Chrome and Firefox. Reproduce the production failure locally before editing
runtime configuration; retain one server download per recording track.

## Design

- The player consumes a local blob URL. Waveform analysis and download use
  `fetch(blobUrl)`, which is subject to `connect-src`, unlike audio playback.
- Reuse the exact `connect-src` directive from `vercel.json` in the existing
  hermetic E2E. Apply only this directive to the local HTML response because
  Vite's development bootstrap differs from the production script policy.
- RED reproduced waveform status `unavailable` instead of `ready` under the
  deployed policy. Adding only `blob:` to `connect-src` made all four focused
  browser scenarios pass, including waveform, download, and exact track counts.
  Existing remote origins and all other directives remain unchanged.
- This is Lane D: production security-header configuration and release.
  No database, provider, backend, or audio download strategy change is needed.
- Prior browser tests covered WAV without deployment headers; production bundle
  checks proved the visual code was served but did not prove audio analysis.

## Tasklist

1. Reproduce RED with the deployed connect policy and mocked local audio.
2. Apply the smallest confirmed fix and verify GREEN, download counts, playback,
   Hold, transcript navigation, and desktop/mobile screenshots.
3. Review the narrow policy change, update canonical deployment documentation,
   and run root typecheck, lint, build, and diff checks serially.
4. Commit the correction with a changelog entry, push `main`, and verify Vercel's
   production deployment and actual response header.
