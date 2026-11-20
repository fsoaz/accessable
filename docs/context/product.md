# AccessAble product

AccessAble helps frontend developers find accessibility barriers, review source changes, and verify the repaired experience in a browser. The hackathon MVP gives developers and demo reviewers one repeatable workflow on the bundled Fieldnotes event registration page.

## Demo workflow

1. Audit the original page. Inspect the missing email label, the unnamed information button, and the details control skipped by Tab.
2. Generate a live proposal or select the labeled saved replay. Review the proposed edits and unified HTML diff.
3. Approve the patch. Compare the original and repaired previews and inspect fresh Chromium results.
4. Complete the repaired registration flow with the keyboard, download the verified patch, and reset for another run.

Success means both scanned page states go from two failing axe rules to zero and a keyboard user can open the workshop details and reach registration confirmation. The dashboard reports axe counts and browser interaction outcomes independently. The results describe automated coverage for the bundled fixture. [Local setup and demo steps](../../README.md) · [Measured results](../execution/test_evidence.md)

## MVP scope

One local operator, one bundled page, and three repair operations. The demo registration displays a local confirmation. Arbitrary URLs, repository imports, multi-page crawling, generic source repair, and hosted deployment are outside the MVP.
