import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const PAGE = pathToFileURL(fileURLToPath(new URL('../../index.html', import.meta.url))).href;

test('built page: set up admin, draw brain, pass System check, lock', async ({ page }, info) => {
  const problems: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error') problems.push('console: ' + m.text());
  });
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', e =>
      console.error('CSP blocked ' + e.violatedDirective + ' ' + e.blockedURI),
    ),
  );

  await page.goto(PAGE);
  await expect(page.getByRole('heading', { name: 'Set up Brain' })).toBeVisible();

  // first run: an adult creates the admin (a throwaway passcode that exists only in this test browser)
  const pass = 'e2e only 7Q';
  await page.getByLabel('Name').fill('Owner');
  await page.getByLabel(/^Passcode/).fill(pass);
  await page.getByLabel('Repeat passcode').fill(pass);
  await page.getByLabel('Month').selectOption({ label: 'January' });
  await page.getByLabel('Day').fill('1');
  await page.getByLabel('Year').fill('1990');
  await page.getByRole('button', { name: 'Create admin' }).click();

  const stage = page.getByRole('main', { name: 'Brain view' });
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500); // let the brain settle for the picture
  await info.attach('brain.png', { body: await stage.screenshot(), contentType: 'image/png' });

  // no key yet: the real-AI guide is shown and nothing can be sent
  await expect(page.getByRole('region', { name: 'Connect real AI' })).toBeVisible();
  await expect(page.getByLabel('Task for the team')).toBeDisabled();

  // Brain's own System check: shaders, drawing, encryption, policy, storage
  await page.getByRole('tab', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Run system check' }).click();
  const checks = page.locator('ul.checks li');
  await expect(checks.first()).toBeVisible({ timeout: 30_000 });
  const rows = await checks.allInnerTexts();
  await info.attach('system-check.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  const failed = await page.locator('ul.checks li.fail').allInnerTexts();
  expect(failed, 'System check failures').toEqual([]);

  // lock, then sign back in with the same passcode
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByRole('heading', { name: 'Restricted system' })).toBeVisible();
  await page.getByLabel('Name').fill('Owner');
  await page.getByLabel('Passcode').fill(pass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(stage).toBeVisible({ timeout: 30_000 });

  expect(problems, 'console errors, page errors or blocked content').toEqual([]);
});
