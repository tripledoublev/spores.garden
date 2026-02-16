# NSID Migration Plan: `garden.spores.*` -> `coop.hypha.spores.*`

This document defines a safe, resumable migration strategy for moving spores.garden records from the current namespace to a new namespace.

## Goal

- Keep existing gardens working during transition.
- Migrate each user's own records when they are authenticated.
- End in a state where new writes use only `coop.hypha.spores.*`.

## Constraints

- The app can only write to the logged-in user's repo.
- Lexicons are immutable by NSID identity; changing NSID means creating new lexicons and new records.
- Migration must be idempotent and safe to resume after interruption.

## Collection Mapping

Site-level:
- `garden.spores.site.config` -> `coop.hypha.spores.site.config`
- `garden.spores.site.layout` -> `coop.hypha.spores.site.layout`
- `garden.spores.site.section` -> `coop.hypha.spores.site.section`
- `garden.spores.site.profile` -> `coop.hypha.spores.site.profile`

Content:
- `garden.spores.content.text` -> `coop.hypha.spores.content.text`
- `garden.spores.content.image` -> `coop.hypha.spores.content.image`

Social:
- `garden.spores.social.flower` -> `coop.hypha.spores.social.flower`
- `garden.spores.social.takenFlower` -> `coop.hypha.spores.social.takenFlower`

Items:
- `garden.spores.item.specialSpore` -> `coop.hypha.spores.item.specialSpore`

## Runtime Policy by Phase

Phase 0 (pre-cutover):
- Read old only.
- Write old only.

Phase 1 (migration rollout):
- Read old and new.
- Write new only.
- Migrate owner repo records on authenticated sessions.

Phase 2 (stabilization):
- Read old and new (old as fallback only).
- Write new only.

Phase 3 (sunset):
- Read new only (after announced cutoff).
- Write new only.

## Migration Trigger

Run migration only when all are true:
- user is logged in
- viewed garden owner DID equals current DID
- migration marker shows not completed for this DID

Suggested marker record:
- `coop.hypha.spores.site.config` field: `nsidMigrationVersion: 1`

## One-Time Migration Algorithm

1. Load old records from owner repo for all mapped collections.
2. Upsert content/profile/site records into new collections:
   - preserve rkey when meaningful (`self` records)
   - preserve data payload and timestamps where possible
3. Migrate section records:
   - if section contains refs/URIs using old collections, rewrite to new collection NSIDs
   - keep section rkeys stable where possible
4. Migrate layout record:
   - rewrite section URIs from old section collection to new section collection
5. Migrate social/item records in owner's repo:
   - copy forward with same payload
6. Set migration marker (`nsidMigrationVersion: 1`) in new config record.
7. Keep old records in place during stabilization window.

## URI Rewrite Rules

Any `at://did/collection/rkey` that points to old spores collections must be rewritten to corresponding new collection while preserving DID and rkey.

Rewrite applies to:
- section `ref`
- section `records[]`
- layout `sections[]`
- any future fields storing spores AT-URIs

## Idempotency Rules

- Use upsert semantics for `self` records (`putRecord`).
- For collection records, check existence before creating duplicates when practical.
- If marker exists and equals current version, skip migration.
- Migration can be re-run safely; each step should be deterministic.

## Failure and Recovery

- If migration fails mid-run, do not set marker.
- On next owner session, retry from start.
- Log step-level errors with collection/rkey context.
- Continue rendering from old data while migration incomplete.

## Rollback

During stabilization:
- app still supports reading old namespace
- if severe issues occur, temporarily switch write path back to old namespace via feature flag
- do not delete old records until migration has been stable for a defined window

## Suggested Implementation Order

1. Add new lexicons and publish them.
2. Add namespace-aware constants and mapping helpers.
3. Implement read-old/read-new in loaders.
4. Implement write-new paths.
5. Implement owner migration routine + marker.
6. Add telemetry/logging around migration outcomes.
7. Announce and later enforce old namespace sunset.

## Test Checklist

- New user creates garden entirely in new namespace.
- Existing user migrates once and marker is set.
- Existing user with partial migration resumes successfully.
- Section/layout URI rewrites are correct.
- App remains functional if migration is interrupted.
- Read fallback still works for non-migrated users.
