# Mobile usability for the public landing and Kegiatan pages

## Requirement

- Every program filter must be reachable on narrow viewports, and changing it must update the URL and results. Posters must show their full artwork and keep the Drive action visible.
- The shared sign-in dialog must fit short screens, allow its contents to scroll, and support a named dialog, contained focus, Escape dismissal, and focus return.
- Landing module previews and footer links must remain readable on short screens. Telefun's illustration must finish its motion and display a static state when reduced motion is requested.
- Reserve card image space and give elevated fetch priority to at most the leading image candidate.

## Design

Lane C public UI behavior. Keep the existing content, theme, auth requests, route contracts and Drive destinations. Apply the Chrome Modern Web Guidance layout, dialog, motion and image priority guides and the Impeccable adaptation checks. Constrain the filter grid track, show uncropped posters, and put the Drive action in the card copy. Use a native modal with scrollable contents. Adapt the story stage to the available viewport height.

The original Kegiatan plan's horizontally scrollable filters remain the intent. Its crop rule and the later first-four image priority rule are superseded by this plan. The documented landing motion limit and static reduced-motion state apply to the demo clock as well.

## Tasklist

- [x] Add focused hermetic Playwright coverage and record RED.
- [x] Implement the responsive filter, media, dialog, and landing changes.
- [x] Run focused browser regression, visual checks, Impeccable, and the code quality gate.
- [x] Run web checks and prepare the change for integration.

## Verification

- RED reproduced the unreachable filter, poster cropping, excess image priority, unnamed dialog and query loss, clipped and obscured landing scenes, and the continuously updating Telefun clock. A follow-up RED also caught form data carrying across sign-in modes while reviewing the native dialog.
- The three-spec browser regression had 30 passes and two failures. The follow-up corrected a sticky-stage selector conflict and tested focus isolation against the background page. The next focused run passed 11/11, including the added 390 × 844 preview case. The final dialog run passed 4/4, including the form reset.
- Inspected local Chromium screenshots for mobile filters, native sign-in, and the landing example at 320 and 390 px. Existing axe coverage passed in both themes. Impeccable flagged four uses of Inter, the typeface specified by the design system.
- Web typecheck, lint, build, and `git diff --check` exited 0. Lint reported 76 warnings and no errors. Its one warning in a changed source file refers to the existing auth request cleanup.

```sh
E2E_SCREENSHOT=on pnpm --dir apps/web exec playwright test e2e/kegiatan.spec.ts e2e/landing-auth.spec.ts e2e/landing-split-flap.spec.ts --reporter=line --workers=1
E2E_SCREENSHOT=on pnpm --dir apps/web exec playwright test e2e/kegiatan.spec.ts e2e/landing-auth.spec.ts e2e/landing-split-flap.spec.ts -g 'mobile bisa menggulir|dialog Masuk di layar pendek|panggung KETIK menampilkan|tautan footer menampilkan|timer contoh Telefun|papan modul dan footer mendarat|WCAG 2.1 A/AA' --reporter=line --workers=1 --output=/tmp/trainers-public-mobile-evidence
E2E_SCREENSHOT=on pnpm --dir apps/web exec playwright test e2e/landing-auth.spec.ts e2e/kegiatan.spec.ts e2e/landing-split-flap.spec.ts -g 'dialog Masuk|beralih mode masuk|tombol tamu membuka' --reporter=line --workers=1 --output=/tmp/trainers-public-mobile-auth-evidence
pnpm --filter @trainers/web typecheck
pnpm --filter @trainers/web lint
pnpm --filter @trainers/web build
git diff --check
```
