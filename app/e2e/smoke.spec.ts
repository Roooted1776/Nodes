import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { fakeBackend } from './fake-backend';

const PAGE = pathToFileURL(fileURLToPath(new URL('../../index.html', import.meta.url))).href;

test('built page: set up admin, draw brain, pass System check, lock', async ({ page, context }, info) => {
  const backend = await fakeBackend(context);
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

  // Perspective selection stays explicit; station selection opens and focuses its real panel entry.
  const views = page.getByRole('navigation', { name: 'View', exact: true });
  await views.getByRole('button', { name: 'Team diagram' }).click();
  await expect(views.getByRole('button', { name: 'Team diagram' })).toHaveAttribute('aria-pressed', 'true');
  await views.getByRole('button', { name: '3D Brain' }).click();
  await expect(views.getByRole('button', { name: '3D Brain' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('button.agent-tag').filter({ hasText: 'Claude' }).click({ force: true });
  const agentEntry = page.locator('[data-scene-entry="agent:claude"]');
  await expect(agentEntry).toBeFocused();
  await expect(agentEntry).toHaveClass(/scene-halo/);
  await expect(page.getByRole('tab', { name: 'Live chat' })).toHaveAttribute('aria-selected', 'true');

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
  await expect(page.getByRole('heading', { name: 'Sign in to Brain' })).toBeAttached();
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
  await page.getByRole('tab', { name: 'Memory' }).click();
  await page.getByRole('button', { name: /Add a note to memory/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('Browser verification note');
  await page.getByLabel('Note', { exact: true }).fill('Fake test data only.');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => JSON.stringify(backend.getEnvelope())).not.toContain('Browser verification note');
  await page.getByRole('button', { name: /Browser verification note/ }).click();
  await expect(page.getByText('Fake test data only.', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Live chat' }).click();
  const memoryLabel = page.locator('.mem-tag').filter({ hasText: 'Browser verification note' });
  await expect(memoryLabel).toBeVisible();
  await page.waitForTimeout(2500); // allow the selected-memory camera target to settle before aiming at the dot
  const memoryBox = await memoryLabel.evaluate(el => {
    // The title is translated upward; its parent stays centered on the actual 3D dot.
    const box = el.parentElement!.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  if (!memoryBox) throw new Error('Memory label has no scene position');
  await page.mouse.click(memoryBox.x + memoryBox.width / 2, memoryBox.y + memoryBox.height / 2);
  await expect(page.locator('.detail')).toBeFocused();
  await expect(page.locator('.detail')).toHaveClass(/scene-halo/);
  await expect(page.getByRole('tab', { name: 'Memory', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Admin' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Guest');
  await page.getByPlaceholder(/Password \(6/).fill('fake viewer passcode');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByText('Added Guest.', { exact: true })).toBeVisible();
  const viewer = await context.newPage();
  await viewer.goto(PAGE);
  await expect(viewer.getByRole('heading', { name: 'Sign in to Brain' })).toBeAttached();
  await viewer.getByLabel('Username').fill('Guest');
  await viewer.getByLabel('Password').fill('fake viewer passcode');
  await viewer.getByRole('button', { name: 'Sign in' }).click();
  await expect(viewer.getByRole('main', { name: 'Brain view' })).toBeVisible({ timeout: 30_000 });
  await expect(viewer.getByRole('tab', { name: 'Admin' })).toHaveCount(0);
  await expect(viewer.getByLabel('Task for the team')).toHaveCount(0);
  await viewer.getByRole('tab', { name: 'Memory' }).click();
  await expect(viewer.getByRole('button', { name: /Browser verification note/ })).toBeVisible();
  await expect(viewer.getByRole('button', { name: /Add a note/ })).toHaveCount(0);
  await viewer.getByRole('tab', { name: 'Live chat' }).click();
  // Verify the real same-browser transport with explicitly fake test text, without AI calls.
  await page.evaluate(() => {
    const ch = new BroadcastChannel('brain.live.v1');
    ch.postMessage({
      t: 'msg',
      m: { id: 12345, from: 'grokbot', tag: 'fake test only', text: 'Fake transport verification only' },
    });
    ch.close();
  });
  await expect(viewer.getByText('Fake transport verification only', { exact: true })).toBeVisible();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await expect(viewer.getByRole('main', { name: 'Brain view' })).toBeVisible();
  await info.attach('phone-viewer.png', { body: await viewer.screenshot(), contentType: 'image/png' });
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.close();

  expect(problems, 'console errors, page errors or blocked content').toEqual([]);
});
