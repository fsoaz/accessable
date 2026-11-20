import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Page } from 'playwright-core';
import type { Evidence, Finding, Scan } from '../contracts.ts';

const viewport = { width: 1024, height: 768 };
const timeout = 4_000;

async function scan(page: Page, state: Scan['state']): Promise<Scan> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return {
    state,
    rules: result.violations.length,
    affectedNodes: result.violations.reduce((total, rule) => total + rule.nodes.length, 0),
    violations: result.violations.map((rule) => ({
      rule: rule.id,
      description: rule.help,
      targets: rule.nodes.map((node) => node.target.join(' ')),
    })),
  };
}

async function interactionChecks(page: Page, evidence: Evidence) {
  function record(id: string, label: string, passed: boolean) {
    evidence.checks.push({ id, label, passed });
  }

  const details = page.locator('#event-details');
  const panel = page.locator('#details-panel');
  const email = page.locator('#email');
  const info = page.locator('#registration-info');
  const reserve = page.getByRole('button', { name: 'Reserve a spot', exact: true });
  record('email-name', 'Email has a visible associated label', await page.getByText('Email address', { exact: true }).count() === 1
    && await page.locator('label[for="email"]').isVisible()
    && await page.getByRole('textbox', { name: 'Email address', exact: true }).count() === 1);
  record('info-name', 'Information button announces its action',
    await page.getByRole('button', { name: 'View registration information', exact: true }).count() === 1);

  await page.keyboard.press('Tab');
  const infoFocused = await info.evaluate(hasVisibleFocus);
  await page.keyboard.press('Tab');
  const detailsFocused = await details.evaluate((element) => element === document.activeElement);
  record('details-focus', 'Tab reaches Show event details', detailsFocused);
  const detailsVisible = await details.evaluate(hasVisibleFocus);
  await page.keyboard.press('Enter');
  const entered = detailsFocused && await panel.isVisible() && await details.getAttribute('aria-expanded') === 'true';
  record('details-enter', 'Enter opens details and announces expanded state', entered);
  await page.keyboard.press('Space');
  const toggledWithSpace = detailsFocused && await panel.isHidden() && await details.getAttribute('aria-expanded') === 'false';
  if (toggledWithSpace) await page.keyboard.press('Space');
  record('details-space', 'Space closes and reopens details with the correct state',
    toggledWithSpace && await panel.isVisible() && await details.getAttribute('aria-expanded') === 'true');

  if (detailsFocused) await page.keyboard.press('Tab');
  const emailFocused = await email.evaluate((element) => element === document.activeElement);
  const emailVisible = await email.evaluate(hasVisibleFocus);
  if (emailFocused) await page.keyboard.type('demo@example.com');
  await page.keyboard.press('Tab');
  const submitFocused = await reserve.evaluate((element) => element === document.activeElement);
  const reserveVisible = await reserve.evaluate(hasVisibleFocus);
  const detailsRead = await page.getByRole('heading', { name: 'Workshop schedule' }).isVisible();
  if (detailsRead && submitFocused) await page.keyboard.press('Enter');
  record('registration', 'Follow details and register using only the keyboard',
    entered && detailsRead && emailFocused && submitFocused
    && (await page.locator('#confirmation').textContent())?.includes('You’re registered.') === true);
  record('focus-visible', 'Visible focus on the registration controls',
    infoFocused && detailsVisible && emailVisible && reserveVisible);
}

function hasVisibleFocus(element: Element) {
  const style = getComputedStyle(element);
  return element === document.activeElement && element.matches(':focus-visible')
    && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
}

export async function auditPage(url: string, signal: AbortSignal): Promise<Evidence> {
  const evidence: Evidence = { scans: [], checks: [] };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const stop = () => { void browser?.close().catch(() => undefined); };
  const timer = setTimeout(stop, 20_000);
  signal.addEventListener('abort', stop, { once: true });
  try {
    signal.throwIfAborted();
    browser = await chromium.launch({ timeout: 8_000 });
    signal.throwIfAborted();
    evidence.browser = browser.version();
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'en-US', serviceWorkers: 'block' });
    const origin = new URL(url).origin;
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    const open = async () => {
      const response = await page.goto(url);
      if (!response?.ok()) throw new Error('The preview did not load.');
      await page.locator('#event-details').waitFor();
    };

    await open();
    evidence.scans.push(await scan(page, 'initial'));
    await page.locator('#event-details').click();
    const pointer = await page.locator('#details-panel').isVisible();
    evidence.checks.push({ id: 'pointer', label: 'Pointer opens the event details', passed: pointer });
    if (pointer) evidence.scans.push(await scan(page, 'expanded'));

    await open();
    await interactionChecks(page, evidence);
  } catch {
    evidence.error = 'The browser checks did not finish. Run a fresh audit or review a new proposal and retry.';
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    await browser?.close().catch(() => undefined);
  }
  return evidence;
}

export function collectFindings(evidence: Evidence): Finding[] {
  const findings: Finding[] = [];
  for (const [rule, targetId, title, impact] of [
    ['label', 'email', 'Email field has no label', 'Screen reader users cannot identify what to enter.'],
    ['button-name', 'registration-info', 'Information button has no name', 'Screen reader users hear a button without its purpose.'],
  ] as const) {
    if (evidence.scans.some((item) => item.violations.some((violation) => violation.rule === rule && violation.targets.includes('#' + targetId)))) {
      findings.push({ id: rule + ':' + targetId, targetId, category: 'axe', title, impact });
    }
  }
  if (evidence.checks.some((check) => check.id === 'details-focus' && !check.passed)) {
    findings.push({
      id: 'keyboard:event-details', targetId: 'event-details', category: 'keyboard',
      title: 'Tab skips Show event details', impact: 'Keyboard users cannot open the workshop schedule.',
    });
  }
  return findings;
}

export function verificationStatus(evidence: Evidence) {
  if (evidence.error) return 'inconclusive';
  if (evidence.scans.some((item) => item.rules > 0) || evidence.checks.some((item) => !item.passed)) return 'failed';
  return evidence.scans.length === 2 && evidence.checks.length === 8 ? 'verified' : 'inconclusive';
}
