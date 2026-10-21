# KETIK — lampiran gambar dikirim proaktif

Lane C (behavior change, cross-file: prompt policy, consumer prompt, session generation).

## Requirement

Decision (Fajar, 2026-10-21): the consumer sends a scenario attachment proactively as soon as the topic it shows comes up, without waiting for the agent to ask, and the backend guards the AI's compliance.

- The consumer prompt no longer contradicts itself: evidence is removed from "BUKA INFORMASI BERTAHAP"; attachments follow "KAPAN MENGIRIM LAMPIRAN" only.
- "KAPAN MENGIRIM LAMPIRAN" says: when you tell what an attachment shows, or the agent asks about it or asks for proof, send it in that same reply without waiting to be asked.
- Backend guard after generation, before persisting: when the reply carries no `[SEND_IMAGE]` and an unsent attachment applies, append one tag:
  - the latest agent messages ask for proof (bukti, foto, gambar, tangkapan layar, screenshot, lampiran) → the unsent attachment whose description best matches those messages, else the first unsent one without description (a described attachment that matches nothing is never sent by the guard);
  - the consumer reply shares at least two significant words with an unsent attachment description → that attachment.
- At most one tag added per reply; an attachment already sent in the chat is never re-added; a closing reply (no text) is untouched.

## Design

- `apps/api/src/services/ketik/prompt-policy.ts`: rewrite the "KAPAN MENGIRIM LAMPIRAN" rules; add `ensureKetikAttachmentParts(parts, { imageCount, imageAlts, chatHistory })`.
- `apps/api/src/services/ketik/consumer-response.ts`: drop "bukti" from gradual disclosure and point attachments to their own rule.
- `apps/api/src/services/ketik/server-sessions.ts`: run the guard on the split parts in `generateServerConsumerMessages`. A fourth part is avoided by appending the tag to the last part when three parts exist.

## Tasklist

- [x] RED: extend `apps/web/e2e/ketik-consumer-prompt-api.spec.ts` (prompt rules, proof request, topic match, no resend).
- [x] GREEN: prompt + guard.
- [x] thermo-nuclear review, api typecheck/lint, `git diff --check`, changelog.
