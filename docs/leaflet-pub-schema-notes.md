# Leaflet.pub Schema Notes

This note explains how the `leaflet` layout currently maps `leaflet.pub`-style records into spores.garden sections.

## Current Mapping Strategy

- Rendering is handled by `src/layouts/leaflet.ts`.
- The layout uses tolerant field extraction so records with partial/mixed structures still render.
- Content is normalized into a small display model (title, body, author metadata, timestamps, media when present).

## Practical Compatibility Rules

- Unknown fields are ignored.
- Missing optional fields should not hard-fail rendering.
- Record-level fallback behavior is preferred over strict schema rejection in the UI layer.
- Lexicon-level validation remains the source of truth for write-time constraints.

## Known Constraints

- The layout is intentionally read-focused and permissive.
- Rich/edge field variants may render as simplified text if no dedicated UI mapping exists.
- When `leaflet.pub` evolves, extraction logic in `src/records/field-extractor.ts` and `src/layouts/leaflet.ts` should be updated together.

## Maintenance Notes

- Add test coverage for any new field mapping in:
  - `src/layouts/leaflet.test.ts`
  - `src/records/field-extractor.test.ts` (if extraction behavior changes)
- Keep this document aligned with behavior changes to avoid schema drift in docs.
