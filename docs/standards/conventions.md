# Repository conventions

- Use Node 24 or newer, npm, and the checked-in lockfile. The local build runs TypeScript checks and bundles the React dashboard with Vite.
- Keep browser-facing types in `src/contracts.ts`, server logic in `src/server/`, and React components and styles in `src/ui/`. Keep the demo source and assets in `fixture/` and eve configuration in `agent/`.
- Use stable fixture IDs for source mapping and accessible roles and names to assert user-facing behavior. Generate the reviewed diff and candidate together from the same deterministic transformation.
- Keep credentials in local environment configuration. `.env.example` documents the variables, and the dashboard never receives the Gateway key.
- Keep setup and the operator demo in the README. Use `docs/context/` for product and architecture, `docs/standards/` for maintainer references, and `docs/execution/` for evidence and handoff notes.

[Setup and commands](../../README.md) · [Architecture](../context/architecture.md)
