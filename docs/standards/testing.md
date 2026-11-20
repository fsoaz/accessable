# Testing AccessAble

Install the pinned Chromium build with `npx playwright-core install chromium`, then use `npm test` to type-check, build, and exercise the app. The suite opens local loopback servers and launches Chromium. Saved replay tests require no AI credentials. [Test suite](../../test/accessable.test.ts)

## Browser verification

Use a fresh Chromium context per variant, with the same 1024 × 768 viewport, locale, fixture data, axe tags, and keyboard sequence. Scan the initial page and the expanded details state. Use pointer activation to reach the expanded state on both variants, then reload before keyboard checks. Count failing rules and the sum of affected nodes across those rules per state. Report keyboard findings independently.

| Check | Expected original | Expected repaired |
| --- | --- | --- |
| Axe in both states | Missing email label and information button name | Zero violations in each scan |
| Accessible names | Email label and information button name checks fail | Visible “Email address” label and named information button |
| Details focus and activation | Tab skips details | Tab reaches details with visible focus, and Enter and Space operate it |
| Pointer activation | Details opens | Details still opens |
| Keyboard registration | Sequence stops at the inaccessible details step | Details opens, email can be entered, and submission reaches confirmation |

Verification passes when both scans and all eight recorded browser checks complete and pass. An unmet expectation produces `failed`. A crash, timeout, or incomplete run without a definitive failure produces `inconclusive`. In both cases, preserve available evidence and keep patch download gated. [Audit harness](../../src/server/audit.ts)

Exercise changes to approval and reset with stale and concurrent requests. The end-to-end replay also checks keyboard-triggered download, registration in the sandboxed preview, and two consecutive runs in the same server process. [Latest evidence](../execution/test_evidence.md)
