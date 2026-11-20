import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { AxeBuilder } from '@axe-core/playwright';
import { applyPatch } from 'diff';
import { chromium, type Locator, type Page } from 'playwright-core';
import type { Approval, Evidence, RunView } from '../src/contracts.ts';
import { propose } from '../src/server/agent.ts';
import { startApp } from '../src/server/app.ts';
import { collectFindings } from '../src/server/audit.ts';
import { buildPatch } from '../src/server/patch.ts';

const template = await readFile(new URL('../fixture/index.html', import.meta.url), 'utf8');
const baseline: Evidence = {
  scans: ['initial', 'expanded'].map((state) => ({
    state: state as 'initial' | 'expanded', rules: 2, affectedNodes: 2,
    violations: [
      { rule: 'label', targets: ['#email'], description: 'Missing label' },
      { rule: 'button-name', targets: ['#registration-info'], description: 'Missing name' },
    ],
  })),
  checks: ['pointer', 'email-name', 'info-name', 'details-focus', 'details-enter', 'details-space', 'registration', 'focus-visible']
    .map((id) => ({ id, label: id, passed: id === 'pointer' })),
};
const findings = collectFindings(baseline);
const signal = new AbortController().signal;

function approval(run: RunView): Approval {
  assert.ok(run.proposal);
  const { proposalId, revision, sourceHash, proposalHash } = run.proposal;
  return { proposalId, revision, sourceHash, proposalHash };
}

function serverApi(origin: string) {
  function post(path: string, body: unknown = {}, caller = origin) {
    return fetch(origin + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: caller }, body: JSON.stringify(body),
    });
  }
  const get = (path: string) => fetch(origin + path);
  const state = async (path: string): Promise<RunView> => (await get(path)).json();
  return { post, get, state };
}

async function untilSettled(state: () => Promise<RunView>, pending: RunView['status']) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await state();
    if (result.status !== pending) return result;
    await delay(50);
  }
  assert.fail('Run did not settle from ' + pending);
}

test('patches fixture source deterministically and rejects malformed or conflicting edits', async () => {
  const saved = await propose('saved', template, findings, signal);
  const patch = buildPatch(template, saved, findings);
  assert.match(patch.candidate, /<label for="email">Email address<\/label>/);
  assert.match(patch.candidate, /id="event-details"[^>]*type="button"[^>]*aria-expanded="false"/);
  assert.equal(applyPatch(template, patch.diff), patch.candidate);
  assert.equal(buildPatch(template, saved, findings).diff, patch.diff);
  assert.throws(() => buildPatch(template, { ...saved, operations: [saved.operations[0], saved.operations[0]] }, findings));
  assert.throws(() => buildPatch(template, { ...saved, operations: [{ ...saved.operations[0], labelText: '  ' }] }, findings));
  assert.throws(() => buildPatch(template, { ...saved, operations: [{ ...saved.operations[0], findingId: 'unknown' }] }, findings));
  assert.throws(() => buildPatch(template, { ...saved, operations: [{ ...saved.operations[2], buttonType: 'submit' }] }, findings));
  assert.throws(() => buildPatch(template, { ...saved, html: '<script></script>' }, findings));
  assert.throws(() => buildPatch(template.replace('id="registration"', 'id="email"'), saved, findings));
  const escaped = buildPatch(template, { ...saved, operations: [
    { ...saved.operations[0], labelText: '<script>malformed</script>' },
  ] }, findings);
  assert.match(escaped.candidate, /&lt;script&gt;malformed&lt;\/script&gt;/);
});

test('approvals are version-specific and single-use, including across reset during verification', { timeout: 20_000 }, async () => {
  let finishCandidate: ((evidence: Evidence) => void) | undefined;
  const app = await startApp({
    port: 0, previewPort: 0,
    audit: async (url) => url.endsWith('/original') ? baseline : new Promise((resolve) => { finishCandidate = resolve; }),
    repair: async (mode, source, available) => {
      if (mode === 'live') throw new DOMException('The provider timed out.', 'TimeoutError');
      return propose(mode, source, available, signal);
    },
  });
  try {
    const { post, get, state } = serverApi(app.dashboardOrigin);
    assert.equal((await post('/api/runs', {}, 'https://unrelated.example')).status, 403);
    const created: RunView = await (await post('/api/runs')).json();
    const path = '/api/runs/' + created.id;
    await untilSettled(() => state(path), 'auditing');
    assert.equal((await post(path + '/proposals', { source: 'live' })).status, 422);
    assert.equal((await state(path)).status, 'baseline-ready');

    const first: RunView = await (await post(path + '/proposals', { source: 'saved' })).json();
    const second: RunView = await (await post(path + '/proposals', { source: 'saved' })).json();
    assert.equal(approval(second).revision, approval(first).revision + 1);
    assert.equal((await post(path + '/apply', approval(first))).status, 409);
    assert.equal((await post(path + '/apply', { ...approval(second), sourceHash: '0'.repeat(64) })).status, 409);
    assert.equal((await post(path + '/apply', { ...approval(second), proposalHash: '0'.repeat(64) })).status, 409);
    assert.equal((await get(path + '/patch')).status, 409);
    const concurrent = await Promise.all([post(path + '/apply', approval(second)), post(path + '/apply', approval(second))]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [202, 409]);
    const applying = await state(path);
    assert.equal(applying.status, 'verifying');
    assert.ok(applying.candidateUrl);
    const reset: RunView = await (await post('/api/reset')).json();
    finishCandidate?.(baseline);
    await untilSettled(() => state('/api/runs/' + reset.id), 'auditing');
    assert.equal((await get(path)).status, 404);
    assert.equal((await fetch(applying.candidateUrl)).status, 404);
    assert.equal((await fetch(applying.originalUrl)).status, 404);
    assert.equal(await (await fetch(reset.originalUrl)).text(), template);
    assert.equal((await state('/api/runs/' + reset.id)).proposal, undefined);
  } finally {
    await app.close();
  }
});

test('failed and incomplete verification preserve the original and gate downloads', { timeout: 20_000 }, async () => {
  let candidateResult = baseline;
  const app = await startApp({
    port: 0, previewPort: 0,
    audit: async (url) => url.endsWith('/original') ? baseline : candidateResult,
  });
  try {
    const { post, get, state } = serverApi(app.dashboardOrigin);
    const created: RunView = await (await post('/api/runs')).json();
    const path = '/api/runs/' + created.id;
    await untilSettled(() => state(path), 'auditing');
    for (const expected of ['failed', 'inconclusive']) {
      const proposal: RunView = await (await post(path + '/proposals', { source: 'saved' })).json();
      assert.equal((await post(path + '/apply', approval(proposal))).status, 202);
      const result = await untilSettled(() => state(path), 'verifying');
      assert.equal(result.status, expected);
      assert.equal(await (await fetch(result.originalUrl)).text(), template);
      assert.equal((await get(path + '/patch')).status, 409);
      assert.equal((await post(path + '/apply', approval(proposal))).status, 409);
      candidateResult = { scans: baseline.scans.slice(0, 1), checks: [], error: 'Browser timed out.' };
    }
  } finally {
    await app.close();
  }
});

async function activateByKeyboard(page: Page, control: Locator) {
  await control.waitFor({ timeout: 15_000 });
  for (let attempt = 0; attempt < 55; attempt++) {
    if (await control.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press('Tab');
  }
  assert.fail('Tab did not reach ' + await control.textContent());
}

test('dashboard verifies two real replay runs and patched iframe registration with keyboard only', { timeout: 60_000 }, async () => {
  const app = await startApp({ port: 0, previewPort: 0 });
  const browser = await chromium.launch().catch(async (error: unknown) => { await app.close(); throw error; });
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(app.dashboardOrigin);
    await activateByKeyboard(page, page.getByRole('button', { name: 'Run baseline audit' }));
    const { state } = serverApi(app.dashboardOrigin);
    for (let iteration = 0; iteration < 2; iteration++) {
      await page.getByText('Baseline ready', { exact: true }).waitFor();
      await activateByKeyboard(page, page.getByRole('button', { name: 'Use saved proposal' }));
      await page.getByText('Saved replay · Revision 1').waitFor();
      await activateByKeyboard(page, page.getByRole('button', { name: 'Approve and verify' }));
      const verified = page.getByText('Patch verified', { exact: true });
      await verified.waitFor({ timeout: 17_000 }).catch(async () => assert.fail(await page.locator('main').innerText()));
      const download = page.getByRole('link', { name: 'Download patch' });
      const patchPath = await download.getAttribute('href');
      assert.ok(patchPath);
      const result = await state(patchPath.replace(/\/patch$/, ''));
      assert.deepEqual(result.baseline?.scans.map((scan) => [scan.rules, scan.affectedNodes]), [[2, 2], [2, 2]]);
      assert.deepEqual(result.verification?.scans.map((scan) => [scan.rules, scan.affectedNodes]), [[0, 0], [0, 0]]);
      assert.ok(result.verification?.checks.every((check) => check.passed));
      assert.ok(result.candidateUrl);
      const downloaded = await (await fetch(app.dashboardOrigin + patchPath)).text();
      assert.equal(downloaded, result.proposal?.diff);
      assert.equal(applyPatch(template, downloaded), await (await fetch(result.candidateUrl)).text());
      if (iteration === 0) {
        const downloadEvent = page.waitForEvent('download');
        await activateByKeyboard(page, download);
        assert.equal((await downloadEvent).suggestedFilename(), 'accessable-registration.patch');
        const iframe = page.frameLocator('iframe[title="After applying event registration preview"]');
        await activateByKeyboard(page, iframe.getByRole('button', { name: 'Show event details' }));
        assert.equal(await iframe.getByRole('button', { name: 'Show event details' }).getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Tab');
        assert.equal(await iframe.getByRole('textbox', { name: 'Email address' }).evaluate((element) => document.activeElement === element), true);
        await page.keyboard.type('demo@example.com');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await iframe.getByText('You’re registered. See you at the workshop!').waitFor();
        await activateByKeyboard(page, page.getByRole('button', { name: 'Reset demo' }));
        assert.equal((await fetch(result.candidateUrl)).status, 404);
      }
    }
    const dashboardScan = await new AxeBuilder({ page }).include('main').exclude('iframe').analyze();
    assert.deepEqual(dashboardScan.violations.map((violation) => violation.id), []);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await app.close();
  }
});
