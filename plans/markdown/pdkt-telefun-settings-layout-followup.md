# PDKT and Telefun Settings Layout Follow-up

## Requirement

Give the PDKT scenario profile section a clear gap between the “Karakter dan Gaya Komunikasi” introduction and its fields. Keep the Telefun “Masalah” tab and its modal footer visible above the fixed mobile navigation. Preserve all labels, settings behavior, and save flow.

## Design

- Keep PDKT's current two-column field grid and 16px field spacing; use the documented 24px section-intro separation before the first field.
- Align Telefun's tab and scroll-content structure with PDKT so the dialog's flex sizing applies to the tab list and scroll region directly. Let the content region shrink within the dialog in both axes, and keep tab labels from shrinking.
- Keep the fixed mobile navigation below modal overlays so it cannot cover modal content or actions.
- Limit the change to the two reported settings layouts and their existing focused test suites.

## Tasklist

- [x] Add focused layout regression assertions to the existing PDKT and Telefun settings tests and confirm they fail before the fix.
- [x] Increase separation under the PDKT communication heading and flatten Telefun's extra tabs wrapper while keeping its saving state inert.
- [x] Add a regression assertion to the existing layout-scroll contract, confirm the mobile navigation currently shares the modal layer, then lower its layer.
- [x] Run the focused PDKT wizard, Telefun settings, and layout-scroll cases plus affected Web checks.
- [x] Review the responsive layout in the local production preview, self-review the diff, and run `git diff --check`.
