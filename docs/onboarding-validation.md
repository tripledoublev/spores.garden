# Onboarding Validation With Real Account Data

Use this workflow to validate first-time onboarding while preserving your existing garden data.

## Prerequisites

- Set env vars:
  - `ATPROTO_IDENTIFIER`
  - `ATPROTO_APP_PASSWORD`
- Optional:
  - `ATPROTO_PDS_URL`
  - `ATPROTO_REPO_DID`

## 1) Backup Current Garden Records

```bash
npm run garden:backup
```

This creates a JSON backup file under `backups/` by default.

## 2) Preview Reset (Safe Dry Run)

```bash
npm run garden:reset -- --dry-run
```

Review the record counts that would be deleted.

## 3) Reset Garden Records

```bash
npm run garden:reset -- --yes
```

This deletes records in both namespaces for spores.garden collections:
- `garden.spores.*`
- `coop.hypha.spores.*`

## 4) Validate Onboarding Flow

- Open the app as your account.
- Confirm new-user onboarding/welcome flow appears as expected.
- Complete key onboarding actions.

## 5) Restore Your Previous Records

```bash
npm run garden:restore -- --from backups/<backup-file>.json
```

## 6) Verify Restore

- Reload your garden route.
- Confirm title/sections/profile/content/spore state is back.
- Optionally run:

```bash
npm run garden:backup
```

and compare record counts with your original backup.

## Notes

- `reset` is destructive and requires `--yes` unless running with `--dry-run`.
- `restore` uses upsert semantics (`putRecord`) with original collection + rkey from backup.
