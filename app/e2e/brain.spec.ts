import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { fakeBackend } from './fake-backend';
const PAGE = pathToFileURL(fileURLToPath(new URL('../../index.html', import.meta.url))).href;
test('brain end to end', async ({ page, context }) => {
  test.setTimeout(180000);
  await fakeBackend(context);
  const log: string[] = [];
  let webTools = 0;
  await context.route('https://api.openai.com/**', async route => {
    const b = route.request().postDataJSON();
    const sys = b.input[0].content as string,
      user = b.input[1].content as string;
    if (b.tools?.[0]?.type === 'web_search') webTools++;
    let text: string;
    if (sys.includes('You are Perplexity, the search specialist')) {
      log.push(
        'SEARCH PROMPT HAS MEMORY: ' +
          user.includes('BRAIN CONTEXT') +
          ' | web tool: ' +
          (b.tools?.[0]?.type || 'none'),
      );
      text = 'Brain launches next week. Sources: https://example.com/launch';
    } else if (sys.includes('You are Dream')) {
      log.push('DREAM PROMPT:\n' + user.slice(0, 600));
      text = JSON.stringify({
        summaries: [{ cite: 1, text: 'Team planned a launch checklist.' }],
        pages: [
          {
            op: 'create',
            type: 'workstream',
            title: 'Launch checklist',
            note: 'Steps to launch [[Brain]] safely [cite:1].',
            cites: [1],
          },
          {
            op: 'update',
            type: 'concept',
            title: 'Ship small',
            note: 'Ship in small, tested steps. [cite:1]',
            cites: [1],
          },
        ],
      });
    } else if (sys.includes('File what the team should remember')) {
      text = JSON.stringify({
        memories: [{ type: 'concept', title: 'Ship small', note: 'Small tested steps beat big launches.' }],
      });
    } else {
      const who = (sys.match(/You are ([^(]+) \(/) || [])[1];
      log.push(
        'BOT ' +
          who +
          ' | banter rule: ' +
          sys.includes('Banter') +
          ' | index in prompt: ' +
          user.includes('BRAIN INDEX'),
      );
      text = `${who}: nice one team, here is my part on the launch.`;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ output_text: text, usage: { input_tokens: 10, output_tokens: 5 } }),
    });
  });
  await page.goto(PAGE);
  await page.getByLabel('Username').fill('Owner');
  await page.getByLabel('Password').fill('e2e only 7Q');
  await page.getByRole('button', { name: 'Create admin' }).click();
  await page.getByRole('main', { name: 'Brain view' }).waitFor({ timeout: 30000 });
  await page.getByLabel('OpenAI key').fill('sk-test123');
  await page.getByLabel('Task for the team').fill('Plan the Brain launch');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Grok Bot filed \d+ memor/).first()).toBeVisible({ timeout: 90000 });
  const chat = await page.getByRole('region', { name: 'Live chat' }).innerText();
  console.log('CHAT REPLIES:', (chat.match(/nice one team/g) || []).length);
  await page.getByRole('button', { name: 'Dream now' }).click();
  await expect(page.getByText(/Dream filed \d+ page/).first()).toBeVisible({ timeout: 30000 });
  console.log('STATUS:', await page.locator('.key-status').innerText());
  console.log(
    'MEMORY CARD:',
    await page.locator('.card2', { hasText: 'Dream now' }).locator('.mini').first().innerText(),
  );
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByLabel('Username').fill('Owner');
  await page.getByLabel('Password').fill('e2e only 7Q');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('main', { name: 'Brain view' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log(
    'AFTER RELOAD:',
    await page.locator('.card2', { hasText: 'Dream now' }).locator('.mini').first().innerText(),
  );
  await page.getByLabel('Search', { exact: true }).fill('when does the brain launch ship small');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/Search answered by OpenAI\./).first()).toBeVisible({ timeout: 30000 });
  const link = page.getByRole('link', { name: 'https://example.com/launch' });
  console.log('SEARCH LINK CLICKABLE:', await link.getAttribute('href'), await link.getAttribute('target'));
  console.log('MEMORY HIT SHOWN:', await page.locator('.key-status').innerText());
  console.log(
    'INBOX AFTER SEARCH:',
    await page.locator('.card2', { hasText: 'Dream now' }).locator('.mini').first().innerText(),
  );
  console.log('WEB SEARCH TOOL ON BOT CALLS:', webTools);
  console.log(log.join('\n'));
  await page.screenshot({ path: '/tmp/brain-e2e.png' });
});
