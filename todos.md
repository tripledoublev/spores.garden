# Issue #1 Follow-up Tasks

Source: https://github.com/hyphacoop/spores.garden/issues/1#issuecomment-3893885228

- [ ] `in-progress` Decide and execute NSID finalization strategy (`garden.spores.*` vs `coop.hypha.spores.*`) with migration plan.
- [x] `completed` Make `garden.spores.site.section` more idiomatic and less overloaded.
- [x] `completed` Remove dual-path content semantics and pick one canonical content path.
- [x] `completed` Complete ref-first migration and deprecate `collection` + `rkey` fields.
- [x] `completed` Finalize DID/handle URL canonicalization policy and normalize links.
- [x] `completed` Consider profile schema parity improvements (including pronouns decision).
- [x] `completed` Tighten `specialSpore` game integrity guardrails (timestamp validity window + cooldown + trust model docs).

## NSID Execution Checklist

Reference: `docs/nsid-migration.md`

- [ ] `in-progress` Add `coop.hypha.spores.*` lexicons mirroring current `garden.spores.*` schemas.
- [ ] `pending` Introduce namespace constants + collection mapping helpers (old->new, new->old) in runtime.
- [ ] `pending` Implement read strategy: prefer new namespace, fallback to old namespace.
- [ ] `pending` Implement write strategy: new namespace only.
- [ ] `pending` Add owner-only migration routine (logged-in owner gate + idempotent marker).
- [ ] `pending` Implement URI rewrite utility for section/layout refs and records arrays.
- [ ] `pending` Wire migration trigger into app startup for owner sessions.
- [ ] `pending` Add migration telemetry/logging and safe retry behavior.
- [ ] `pending` Add tests for new-user new-namespace path.
- [ ] `pending` Add tests for old-user migration + resume behavior.
- [ ] `pending` Add stabilization switch/flag for temporary rollback to old writes if needed.

## Implemented Branches (Unmerged)

- `feat/special-spore-integrity`
- `feat/url-handle-canonicalization`
- `feat/ref-first-section-migration`
- `feat/content-ref-canonical-path`
- `feat/profile-pronouns-parity`
- `feat/section-typed-payloads`
- `feat/nsid-finalization-strategy`
