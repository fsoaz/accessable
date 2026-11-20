# Local API contract

The dashboard API uses the loopback origin `http://127.0.0.1:3410`. Every POST requires the dashboard's exact `Host` and `Origin`, plus `Content-Type: application/json`. Mutation bodies use strict schemas. Responses use `Cache-Control: no-store`.

| Method and path | Request | Success behavior |
| --- | --- | --- |
| `GET /api/session` | — | `200` with the active run or `null`, plus the original template URL |
| `POST /api/runs` | `{}` | `202` with a new run and started baseline checks |
| `GET /api/runs/:id` | — | `200` with the active run's status and available evidence |
| `POST /api/runs/:id/proposals` | `{"source":"live"}` or `{"source":"saved"}` | `201` with the reviewed diff, edit descriptions, and approval identifiers |
| `POST /api/runs/:id/apply` | `proposalId`, `revision`, `sourceHash`, and `proposalHash` | `202` with approval consumed and verification started |
| `GET /api/runs/:id/patch` | — | `200` with the exact reviewed unified diff as an attachment once verified |
| `POST /api/reset` | `{}` | `202` with a fresh run and started baseline checks |

## State and errors

- Poll the run while its status is `auditing`, `proposing`, or `verifying`. A completed baseline reaches `baseline-ready`. A generated proposal reaches `proposal-ready`. Verification ends in `verified`, `failed`, or `inconclusive`.
- Errors return JSON with an `error` message. Invalid JSON or schema returns `400`. A rejected mutation origin or content type returns `403`. Unknown or invalidated runs return `404`. A run-state conflict, stale approval, consumed approval, or gated download returns `409`. Proposal generation or validation can return `422`, after which the prior run state is restored.
- Only one run is active. Creating another through `POST /api/runs` returns `409` until the operator uses reset. After unsuccessful verification, generate and approve a fresh proposal revision to retry.

Preview URLs refer to the original snapshot or an approved candidate on the read-only preview server. Use the URLs returned by the API. Reset expires URLs from the prior run. [Route implementation](../../src/server/app.ts) · [Shared types](../../src/contracts.ts)
