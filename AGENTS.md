# Repository Guidelines

## Project Structure

AccessAble audits and repairs a bundled event registration page, then verifies the approved patch in Chromium. The React dashboard lives in `src/ui/`, the Node API, patcher, and verification harness in `src/server/`, and shared types in `src/contracts.ts`. The demo HTML, CSS, and JavaScript live in `fixture/`. The optional eve agent lives in `agent/`. Tests live in `test/`, and product, API, and verification notes are under `docs/`.

## Build, Test, and Development

Use Node.js 24 or newer and npm.

- `npm ci` installs dependencies from the lockfile.
- `npx playwright-core install chromium` installs the browser used for verification.
- `npm run dev` type-checks, builds, and starts the dashboard at `http://127.0.0.1:3410`.
- `npm run build` runs the TypeScript checker and bundles the dashboard with Vite.
- `npm test` builds the app and runs the Node test suite.
- `npm run agent` starts the optional eve service. Follow the [live setup](README.md#live-proposals) for credentials. Saved replay works without a key.

## Coding Style

Use two-space indentation, single quotes, and semicolons in TypeScript and JavaScript. Use PascalCase for React components and shared types, camelCase for functions and variables, and explicit `.ts` or `.tsx` extensions on local TypeScript imports. Keep fixture IDs stable for audit-to-source mapping. The build enforces TypeScript checks. There is no configured formatter or linter.

## Testing

Name test files `*.test.ts` and use descriptive `node:test` cases. Use Playwright and axe to verify browser behavior. Keep axe rule counts distinct from keyboard outcomes, and exercise both initial and expanded page states when changing the repair flow. Cover exact approval, replay, and reset when changing run state. The automated suite runs without live AI credentials.

## Commits and Pull Requests

Follow the existing `feat: add …` style with a short, imperative summary. In a pull request, explain the behavior change, link the relevant issue if one exists, and record the tests run. Include before-and-after screenshots for visible dashboard changes.
