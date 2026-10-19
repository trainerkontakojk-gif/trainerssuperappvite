# Performa gelombang 1: KETIK, PDKT, Telefun

Audit: /mnt/project-files/audit-performa/laporan.md (project files, 2026-10-19).

## Requirement

Remove the cheap, low-risk sources of waiting and Supabase egress found by the audit, with no schema or API-contract change.

1. PDKT: saving settings, creating an email and re-saving a failed mailbox draft do not reload the whole history list (history rows only appear on reply).
2. PDKT: opening the workspace with replied emails from other people does not trigger a mailbox + history reload when their already-finished evaluations are first read.
3. KETIK: starting a session does not wait for the monthly usage summary.
4. KETIK: the history search waits until typing pauses (300 ms) before querying.
5. KETIK: the chat screen stops re-rendering every second; it re-renders once when the session expires.
6. Telefun: recordings use a speech bitrate (32 kbps Opus) instead of the browser default (~128 kbps).
7. Moved to wave 2: the score response no longer waiting for the coaching summary needs a real-backend scoring E2E (local storage + faked Gemini), which belongs with the other Telefun post-call work.

## Design

- `usePdktEvaluations`: remember mailbox ids whose status was guessed ("processing") without a history row. The first poll answer for such an id only records the status; it does not count as "became terminal".
- PDKT `simulation.tsx` / `index.tsx`: drop `fetchHistory()` after settings save, session create and draft retry. Keep it after reply.
- KETIK `index.tsx`: start the usage baseline fetch and the session start together.
- KETIK `history.tsx`: debounce the query value passed to the page hook.
- KETIK `useServerKetikChat.ts`: replace the 1 s interval with one timeout at `expiresAt`.
- Telefun `liveSession.ts`: `audioBitsPerSecond: 32000` on both recorders.

## Tasklist

- [x] RED E2E for 1–4 and 6 (hermetic browser specs); 5 is guarded by an expiry E2E that passes before and after.
- [x] Implement 1–6.
- [x] GREEN focused E2E (pdkt-flow, ketik-flow, ketik-history-browser, telefun-call: 134 passed), web typecheck, eslint on changed files.
- [x] thermo-nuclear review, changelog, PR.

## Review notes (accepted P3)

- KETIK: the usage baseline now loads in the background. If it is slower than the agent's first reply, the end-of-session cost delta can miss that first call. The delta is informational only.
- KETIK: typing on page 2+ resets to page 1 immediately, so one page-1 fetch with the previous term can run before the debounced term.
