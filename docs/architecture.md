# Architecture Overview

This document describes the runtime architecture of spores.garden and the core module boundaries.

## System Model

spores.garden is a static browser app that renders a personal site from AT Protocol records.

High-level data path:

1. User opens a route (`/`, `/@handle`, or `/did:plc:...`).
2. App resolves identity (handle -> DID when needed).
3. App loads site config/layout/section records from owner repo.
4. App loads referenced content records and renders layouts.
5. Owner can edit and save updates back to their own repo.

## Runtime Modules

- `src/main.ts`
  - App bootstrap and global initialization.
- `src/components/`
  - Web components and UI coordination (`site-app`, editor flows, section rendering).
- `src/config.ts`
  - Config loading/saving orchestration and owner checks.
  - Calls migration and section persistence helpers.
- `src/config/nsid.ts`
  - Namespace constants and migration read/write policy.
- `src/config/nsid-migration.ts`
  - Owner-only NSID migration implementation.
- `src/config/section-persistence.ts`
  - Section normalization and record payload rewrite helpers.
- `src/records/`
  - Record loading and field extraction from arbitrary lexicons.
- `src/layouts/`
  - Layout renderers (`post`, `image`, `leaflet`, `smoke-signal`, etc.).
- `src/themes/`
  - Theme generation and font mapping.
- `src/oauth.ts`
  - Auth/session lifecycle and signed ATProto requests.
- `src/at-client.ts`
  - API wrapper for record and identity operations.

## Data Ownership and Trust

- User-owned site data is stored in ATProto records in the user PDS.
- The app is a view/editor layer and does not own canonical content.
- Backlink/social features rely on indexed records from supporting services.
- Special spore mechanics include integrity checks and timestamp guardrails.

## NSID Migration Design

- Source namespace: `garden.spores.*`
- Target namespace: `coop.hypha.spores.*`
- Runtime policy is controlled in `src/config/nsid.ts`.
- Owner migration is idempotent and parity-based (old/new collection presence + rkey coverage).
- During rollout, reads support fallback while writes target the new namespace.

See `docs/nsid-migration.md` for rollout phases and launch specifics.

## Build and Quality Gates

- Build: `npm run build`
- Type checks: `npm run typecheck:strict`
- Unit tests: `npm run test:run`
- Browser smoke tests: `npm run test:e2e`
- Full gate: `npm run check`

## Operational Docs

- Release checklist: `docs/release-checklist.md`
- Launch runbook: `docs/launch.md`
- Rollback/incident playbook: `docs/rollback-playbook.md`
