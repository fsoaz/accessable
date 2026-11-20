# AccessAble architecture

The React and TypeScript dashboard calls a local Node HTTP server on `127.0.0.1:3410`. A second loopback server on port `3411` serves read-only previews and bundled fixture assets. The optional eve process listens on port `3412` and is called by the server-side repair adapter. [HTTP server](../../src/server/app.ts) · [Dashboard](../../src/ui/main.tsx) · [Repair adapter](../../src/server/agent.ts)

## Run lifecycle

1. Snapshot the bundled HTML into the active in-memory run and hash its source. Playwright opens the original preview and records axe findings and interaction checks.
2. Pass eligible findings and relevant HTML snippets to eve, or load the saved proposal. Both paths use the same strict Zod schema and parser-based transformation.
3. Store the candidate HTML and its unified diff with a proposal ID, revision, source hash, and proposal hash. The proposal hash binds the identifiers, proposal contents, and candidate bytes.
4. Validate and consume the exact approval before verification starts. Playwright reads the stored candidate from a run-specific preview URL. Only verified runs can download the reviewed diff.
5. Reset invalidates the active run and its preview URLs, aborts ongoing work, and creates a fresh baseline. Results returning from an invalidated run are discarded.

## Boundaries

The repair operations cover a visible email label, an accessible name for the information button, and conversion of the details control to a native button. Application code owns the HTML edits and browser assertions. The fixture script preserves the toggle behavior and keeps `aria-expanded` in sync on the repaired control. [Patcher](../../src/server/patch.ts) · [Audit harness](../../src/server/audit.ts) · [Fixture script](../../fixture/fixture.js)

The dashboard requires its exact host and origin for JSON mutations. Preview iframes are sandboxed, and the preview server restricts embedding to the dashboard origin. Live inference uses server-side configuration. Run state is held in memory for a single local operator. [API contract](../standards/api_rules.md)
