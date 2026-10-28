# Telefun merge verification: post-hold audio observation

## Requirement

During the local merge gate, the existing hermetic browser E2E for resuming AI audio after hold failed with a zero analyser reading. Preserve the original audible-signal threshold and hold assertions while ensuring the test observes the scheduled 0.4-second audio response even when browser instrumentation is delayed.

## Design

The failing run scheduled the response at audio time 5.936 s for 0.4 s; diagnostic measurement began at audio time 6.448 s, after the response had ended. This establishes a missed observation window, not whether a physical speaker is audible. Reuse the existing audio-thread render probe from the consecutive-turn E2E, wait until its captured frames cover the scheduled response, and measure the 3 kHz marker within that response. Extract their shared frequency measurement to one test helper. Retain the 0.02 signal threshold, existing hold-silence assertion, speaker connection check, and local fail-closed fixture.

## Tasklist

- [x] Preserve the initial failing trace and reproduce the timing mismatch in a diagnostic E2E.
- [x] Confirm the revised observation rejects a silent follow-up control. After extracting the helper, the control still failed at the signal assertion with RMS 0 against the 0.02 threshold.
- [x] Verify the real post-hold response and focused related browser E2E on the merged snapshot. After extracting the helper, both the consecutive-turn and post-hold Playwright cases passed against the disposable local Vite server.
- [x] Run applicable checks serially: `pnpm typecheck --concurrency=1 --cache=local:rw`, `pnpm lint --concurrency=1 --cache=local:rw`, and `pnpm build --concurrency=1 --cache=local:rw` passed; lint reported 74 warnings and no errors. The build used loopback-only test environment values.
- [x] Run `node scripts/check-changelog.mjs origin/main`, `node scripts/check-migration-rollbacks.mjs origin/main`, and `git diff --check`; preserve diagnostic traces outside the repository. Repeat the gates after committing this test-only change.
