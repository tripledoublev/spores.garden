# Repository Guidelines

## Project Structure & Module Organization
This is a static, browser-run app built around AT Protocol data. Key paths:
- `index.html` loads the app and pulls in `src/main.ts`.
- `src/` contains all runtime code, using ES modules and TypeScript.
  - `src/components/` custom elements (site-app.ts, site-editor.ts, section-block.ts, etc.) that render the UI.
  - `src/layouts/` layout renderers used by sections.
  - `src/themes/` theme presets and the theme engine.
  - `src/editor/` edit-mode UI helpers.
  - `src/records/` record shaping and mapping utilities.
- `lexicons/` AT Protocol schemas used by the app.
- `client-metadata.json` OAuth client metadata.
- `spec.md` describes product behavior, layouts, and themes.

## Build, Test, and Development Commands
Run everything with npm (Vite handles dev/build):
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server.
- `npm run build` builds production assets to `dist/`.
- `npm run preview` serves the production build locally.
- `npm start` is an alias for `dev`.
Local dev expects `http://127.0.0.1:5174?did=did:plc:your-did-here` (see `spec.md`).

## Coding Style & Naming Conventions
- Indentation: 2 spaces; use semicolons.
- Modules: ES module syntax (`import`/`export`), `type: "module"` in `package.json`.
- Files: lowercase kebab-case (e.g., `site-app.ts`, `section-block.ts`).
- Custom elements: hyphenated names (e.g., `<site-app>`, `<section-block>`).
- Constants: `UPPER_SNAKE_CASE`; functions/vars: `camelCase`.
No formatter or linter is configured; keep style consistent with existing files.

## Testing Guidelines
No test framework or test directory is configured. If you add tests, document the
runner and add a `test` script in `package.json`. Prefer colocated tests like
`src/**/__tests__` or a top-level `tests/` folder.

## Commit & Pull Request Guidelines
There is no Git history yet, so no commit convention is established. Use clear,
imperative messages (e.g., `Add OAuth error handling`). For PRs, include:
- A brief description of the change and rationale.
- Any relevant configuration changes (e.g., `client-metadata.json`).
- Screenshots or GIFs for UI changes when applicable.

## Configuration & Security Notes
- OAuth metadata lives in `client-metadata.json`; keep redirect URIs aligned with
  `src/oauth.ts` and local dev assumptions.
- AT Protocol lexicons are in `lexicons/`; update these alongside any schema changes.
