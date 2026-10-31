import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { fakeBackend } from './fake-backend';

const PAGE = pathToFileURL(fileURLToPath(new URL('../../index.html', import.meta.url))).href;

test('built page: set up admin, draw brain, pass System check, lock', async ({ page, context }, info) => {
  await fakeBackend(context);
  const problems: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('example.com/brain-policy-check'))
      problems.push('console: ' + m.text());
  });
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', e =>
      console.error('CSP blocked ' + e.violatedDirective + ' ' + e.blockedURI),
    ),
  );

  await page.goto(PAGE);
  await expect(page.getByRole('heading', { name: 'Set up Brain' })).toBeAttached();

  // first run: an adult creates the admin (a throwaway passcode that exists only in this test browser)
  const pass = 'e2e only 7Q';
  await page.getByLabel('Username').fill('Owner');
  await page.getByLabel('Password').fill(pass);
  await page.getByRole('button', { name: 'Create admin' }).click();

  const stage = page.getByRole('main', { name: 'Brain view' });
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500); // let the brain settle for the picture
  await info.attach('brain.png', { body: await stage.screenshot(), contentType: 'image/png' });

  // one page: no view switch, no tabs, the live chat beside the brain and the admin panel along the bottom
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Live chat' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Admin panel' })).toBeVisible();

  // no key yet: the task box stays usable (so a key can be pasted into it) but nothing is sent to the team
  await expect(page.getByLabel('OpenAI key')).toBeVisible();
  const task = page.getByLabel('Task for the team');
  await expect(task).toBeEnabled();
  await expect(task).toHaveAttribute('placeholder', 'Paste an API key here to save it');
  const modelCalls: string[] = [];
  page.on('request', r => {
    if (/openai\.com|anthropic\.com|googleapis\.com|x\.ai/.test(r.url())) modelCalls.push(r.url());
  });
  await task.fill('summarise the plan');
  await expect(task).toHaveValue('summarise the plan');
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await task.press('Enter');
  await expect(task).toHaveValue('summarise the plan'); // not sent: the draft stays put
  await expect(task).toHaveAttribute('placeholder', 'Paste an API key here to save it');
  expect(modelCalls, 'no model requests without a key').toEqual([]);
  await task.fill('');

  // Brain's own System check: shaders, drawing, encryption, policy, storage
  await page.getByRole('button', { name: 'Run system check' }).click();
  const checks = page.locator('ul.checks li');
  await expect(checks.first()).toBeVisible({ timeout: 30_000 });
  const rows = await checks.allInnerTexts();
  await info.attach('system-check.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  const failed = await page.locator('ul.checks li.fail').allInnerTexts();
  expect(failed, 'System check failures').toEqual([]);

  // lock, then sign back in with the same passcode
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Brain' })).toBeAttached();
  // admin sign-in only: no way to register from the sign-in screen
  await expect(page.getByText('Admin sign-in only.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register as admin' })).toHaveCount(0);
  await page.getByLabel('Username').fill('Owner');
  await page.getByLabel('Password').fill(pass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(stage).toBeVisible({ timeout: 30_000 });

  // Orbit and zoom the real WebGL canvas.
  const canvas = stage.locator('canvas');
  await canvas.hover();
  await page.mouse.wheel(0, -120);
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
  }
  // the Accounts card adds admins only (no role choice): add a spare admin and sign in with it in a second tab
  await expect(page.getByRole('combobox', { name: 'Role' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Spare');
  await page.getByPlaceholder(/Password \(6/).fill('fake spare passcode');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByText('Added Spare.', { exact: true })).toBeVisible();
  const spare = await context.newPage();
  await spare.goto(PAGE);
  await expect(spare.getByRole('heading', { name: 'Sign in to Brain' })).toBeAttached();
  await spare.getByLabel('Username').fill('Spare');
  await spare.getByLabel('Password').fill('fake spare passcode');
  await spare.getByRole('button', { name: 'Sign in' }).click();
  await expect(spare.getByRole('main', { name: 'Brain view' })).toBeVisible({ timeout: 30_000 });
  await expect(spare.getByRole('region', { name: 'Admin panel' })).toBeVisible();
  // GitHub's runners draw the 3D brain in software, a few frames a second. Both windows share one CPU,
  // so close the first window (all its errors are already collected) and give the phone steps room.
  await page.close();
  await spare.setViewportSize({ width: 390, height: 844 });
  await expect(spare.getByRole('main', { name: 'Brain view' })).toBeVisible({ timeout: 30_000 });
  await info.attach('phone-spare-admin.png', {
    body: await spare.screenshot({ timeout: 30_000 }),
    contentType: 'image/png',
  });
  expect(await spare.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await spare.close();

  expect(problems, 'console errors, page errors or blocked content').toEqual([]);
});
