# Kegiatan image optimization

Lane C — behavior change across `apps/api` (upload pipeline) and `apps/web` (public `/kegiatan` cards).

## Requirement

- `/kegiatan` loads slowly because card images are stored as uploaded: production
  samples are 1092–1792 px wide JPEGs of 330–620 KB, rendered in ~220–300 px cards.
- New uploads must be stored as WebP no wider than 800 px (no upscaling), EXIF
  orientation applied and metadata stripped, so each card image is tens of KB.
- Existing published images get a one-off reprocess script. Running it against
  production is a remote mutation and needs Fajar's explicit go-ahead per run.
- The first cards on `/kegiatan` must not be lazy-loaded (they are above the fold),
  and every card image declares intrinsic `width`/`height`.
- Validation messages (PNG/JPEG/WebP only, 5 MB max) stay unchanged.

## Design

- `apps/api/src/lib/trainer-activity-media.ts`: after the existing data-URL
  validation, run `sharp(bytes).autoOrient().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78 })`.
  The storage path stays content-addressed (`sha256(output).webp`). A decode
  failure maps to the existing friendly "Gambar tidak valid" validation error.
- `optimizeTrainerActivityImages()` in the same module backs the one-off script
  `apps/api/src/scripts/optimize-kegiatan-images.ts`: for rows whose `image_url`
  is a bucket object that is not yet `.webp`, download, optimize, upload, and
  point the row at the new object. Old objects are left in place so the change
  can be reverted by restoring `image_url`. Re-running changes nothing.
- `apps/web/src/routes/kegiatan.tsx`: the first 4 rendered cards use
  `loading="eager"` with `fetchPriority="high"`; the rest stay lazy. All images get
  `width={800} height={1000}` (the card's 4:5 box) and `decoding="async"`.

## Tasklist

- [x] RED: `apps/web/e2e/kegiatan-api.spec.ts` — a 1600×2000 PNG upload is stored
      as WebP ≤ 800 px wide and smaller than the input.
- [x] RED: `apps/web/e2e/kegiatan.spec.ts` — first 4 public cards are eager with
      width/height, the 5th is lazy.
- [x] GREEN: add `sharp` to `@trainers/api` and optimize in the upload helper.
- [x] GREEN: eager/size attributes on public cards.
- [x] Backfill script + package script.
- [x] Typecheck api/web, lint, `thermo-nuclear`, build, `git diff --check`.
- [ ] Ask Fajar before running the backfill against production.
