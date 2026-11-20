# AccessAble

AccessAble audits a bundled event registration page, proposes a source patch, and checks the approved changes in Chromium. The workbench shows the original and repaired pages side by side, along with the reviewed diff and the measured results.

## Local setup

Use Node.js 24 or newer. The application and eve are tested with Node 26.

```sh
npm ci
npx playwright-core install chromium
npm run dev
```

Open **http://127.0.0.1:3410**. The dashboard and its read-only previews use loopback ports 3410 and 3411. The saved replay runs without AI credentials.

## Demo

1. Select **Run baseline audit**. The original has two axe rule violations in each scanned state. Its “Show event details” control is also skipped by Tab.
2. Select **Use saved proposal**, or **Generate live proposal** when configured. Review the source diff, then select **Approve and verify**.
3. Watch the axe counts go from two to zero in both states. In the repaired preview, Tab to “Show event details,” press Enter, then Tab to the email field. Enter an email, Tab to “Reserve a spot,” and press Enter to reach confirmation.
4. Download the verified patch. Select **Reset demo** to start from a fresh baseline.

Axe counts track distinct failing rules and the sum of affected nodes per rule. Keyboard checks use actual browser input. The results describe automated coverage for the built-in fixture.

## Live proposals

Copy `.env.example` to `.env`, enable `ACCESSABLE_EVE_URL`, and provide `AI_GATEWAY_API_KEY` and an AI Gateway model ID in `ACCESSABLE_MODEL`. Run `npm run agent` in a separate terminal, then start the dashboard. Eve listens at **http://127.0.0.1:3412**. Only the selected fixture snippets and findings go to the model. [AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok) · [Model catalog](https://vercel.com/ai-gateway/models)

## Verification

`npm test` type-checks and builds the app, tests patch and approval rules, and runs the dashboard through two saved replays in Chromium. The live provider is optional for the test suite.
