import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { fakeBackend } from './fake-backend';
const PAGE = pathToFileURL(fileURLToPath(new URL('../../index.html', import.meta.url))).href;
test('keys: paste, test, survive lock, clear', async ({ page, context }) => {
  await fakeBackend(context);
  const hits: string[] = [];
  for (const host of ['api.cerebras.ai', 'api.meta.ai', 'api.groq.com'])
    await context.route(`https://${host}/**`, async route => {
      hits.push(route.request().url() + ' ' + route.request().headers().authorization);
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
      });
    });
  const errs: string[] = [];
  page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(PAGE);
  await page.getByLabel('Username').fill('Owner');
  await page.getByLabel('Password').fill('e2e only 7Q');
  await page.getByRole('button', { name: 'Create admin' }).click();
  await page.getByRole('main', { name: 'Brain view' }).waitFor({ timeout: 30000 });
  for (const [label, key, word] of [
    ['Cerebras (free) key', 'csk-abc123', 'Cerebras'],
    ['Muse (Meta) key', 'meta-key-xyz', 'Muse'],
  ] as const) {
    const box = page.getByLabel(label);
    await box.fill(key);
    const card = page.locator('.company-key-card', { has: box });
    await expect(card.locator('.pill')).toHaveText('Key set');
    await card.getByRole('button', { name: 'Test' }).click();
    await expect(page.getByText(new RegExp(`Connected to ${word}`)).first()).toBeVisible({ timeout: 15000 });
  }
  expect(hits.some(h => h.includes('cerebras') && h.endsWith('Bearer csk-abc123'))).toBe(true);
  expect(hits.some(h => h.includes('meta.ai') && h.endsWith('Bearer meta-key-xyz'))).toBe(true);
  // lock, sign in: keys come back from the encrypted vault
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByLabel('Username').fill('Owner');
  await page.getByLabel('Password').fill('e2e only 7Q');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('main', { name: 'Brain view' }).waitFor({ timeout: 30000 });
  const c = page.locator('.company-key-card', { has: page.getByLabel('Cerebras (free) key') });
  await expect(c.locator('.pill')).toHaveText('Key set');
  // clear empties it
  await c.getByRole('button', { name: 'Clear' }).click();
  await expect(c.locator('.pill')).toHaveText('Not set');
  await expect(page.getByLabel('Cerebras (free) key')).toHaveValue('');
  expect(errs.filter(e => !/policy-check/.test(e))).toEqual([]);
});
