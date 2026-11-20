# Review notes

The six changes from the technical plan review are reflected in the MVP.

| Review item | Implementation |
| --- | --- |
| Axe and keyboard evidence | Counts are computed from axe results. The details focus failure is reported independently. |
| Version-specific approval | Apply checks proposal ID, revision, and both hashes, then consumes approval before starting browser work. |
| Deterministic operations | Strict Zod operations map eligible findings to parser-based edits. The review diff is generated from the stored candidate. |
| Verification matrix | Original and candidate use the same browser settings and exercise the initial and expanded states. Failed and partial outcomes retain evidence. |
| Agent adapter | Live eve inference and saved replay return the same locally validated proposal type. The dashboard API exposes its own run state. |
| Reset and preview isolation | Reset expires old run URLs, aborts in-flight work, and starts a fresh baseline. The original and candidate use a dedicated preview origin. |

The remaining verification gap is a credentialed live AI request. That check is tracked in the [current task](current_task.md). [Architecture](../context/architecture.md) · [Tests](test_evidence.md)
