# Verification evidence

`npm test` passed all four tests on Node 26.13.1. The command type-checked the TypeScript, built the Vite dashboard, and ran the Playwright suite with Chromium 159.0.8154.6. [Test suite](../../test/accessable.test.ts) · [Pinned dependencies](../../package-lock.json)

## Measured replay results

| Page state | Original failing rules | Repaired failing rules | Original affected nodes | Repaired affected nodes |
| --- | ---: | ---: | ---: | ---: |
| Initial | 2 | 0 | 2 | 0 |
| Details expanded | 2 | 0 | 2 | 0 |

The original triggered axe's `label` and `button-name` rules in both states. In the separate keyboard checks, Tab skipped “Show event details” on the original. All eight repaired-page browser checks passed. The end-to-end test also used the keyboard to register inside the repaired preview and trigger the patch download.

## Coverage

- Confirmed a deterministic diff and matching candidate HTML. Rejected invalid operations, duplicate targets and fixture IDs, and arbitrary HTML payloads.
- Rejected stale, mismatched, and reused approvals. Two concurrent apply requests produced one accepted approval and one conflict.
- Simulated a provider timeout and used saved replay. Failed and incomplete verification preserved the original preview and gated the download. Reset during verification expired the prior run and its preview URLs.
- Completed two saved replay runs in the same server process. Confirmed the downloaded diff reproduces the served candidate, checked the dashboard with axe separately from its preview frames, and observed no uncaught page errors.

## Live agent

The local eve server reported ready and exposed the configured `openai/gpt-5.4-mini` model to the local client during the implementation smoke test. A successful Gateway-backed model call remains unverified because no Gateway credential was configured. [Live setup](../../README.md#live-proposals)
