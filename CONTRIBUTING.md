# Contributing

## Setup

```bash
npm install
npm run dev
```

Optional local config:

```bash
cp .env.example .env.local
```

## Quality Gates

Before opening a PR:

```bash
npm run typecheck:strict
npm run test:run
npm run build
```

Optional browser smoke tests:

```bash
npm run test:e2e
```

If Playwright is not installed yet, run:

```bash
npm install --save-dev @playwright/test
npm run e2e:install-browsers
```

Or run everything at once:

```bash
npm run check
```

## Branch + PR Workflow

- Branch from `main`.
- Keep each branch focused to one change set.
- Use clear, imperative commit messages.
- Open PRs against `main` and request review before merge.
- Use `.github/pull_request_template.md` when opening PRs.

## Code Style

- TypeScript ES modules.
- 2-space indentation and semicolons.
- Kebab-case filenames in `src/`.
- Keep UI behavior changes covered by tests where practical.

## Documentation

Update docs together with behavior changes:

- `readme.md` for user-facing behavior and commands.
- `docs/` for implementation details and migration plans.
- `docs/architecture.md` for module and system-boundary changes.
- `SECURITY.md` when vulnerability process or security contact changes.
- `CODE_OF_CONDUCT.md` when community/reporting process changes.
