// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
vi.mock('../src/components/BrainScene', () => ({
  default: ({ locked }: { locked?: boolean }) => <div data-testid="brain" data-locked={String(!!locked)} />,
}));

const ADULT = { m: 'May', d: '17', y: '1980' };
const useStoreRef: () => any = () => ({ mem: { entries: [] } });
async function boot() {
  vi.resetModules();
  const React = await import('react');
  void React;
  const { default: App } = await import('../src/App');
  const auth = await import('../src/auth-store');
  const store = await import('../src/store');
  return { App, auth, store };
}
const dob = async (u: ReturnType<typeof userEvent.setup>, d = ADULT) => {
  await u.selectOptions(screen.getByLabelText('Month'), d.m);
  await u.type(screen.getByLabelText('Day'), d.d);
  await u.type(screen.getByLabelText('Year'), d.y);
};
async function makeAdmin(u: ReturnType<typeof userEvent.setup>) {
  await u.clear(screen.getByLabelText('Name'));
  await u.type(screen.getByLabelText('Name'), 'Owner');
  await u.type(screen.getByLabelText(/^Passcode/), 'correct horse battery');
  await u.type(screen.getByLabelText(/^Repeat passcode/), 'correct horse battery');
  await dob(u);
  await u.click(screen.getByRole('button', { name: 'Create admin' }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => cleanup());

describe('setup and login', () => {
  it('first run asks for an admin, refuses under 18, and makes no account', async () => {
    const { App } = await boot(),
      u = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Set up Brain' })).toBeTruthy();
    expect((await screen.findByTestId('brain')).dataset.locked).toBe('true');
    await u.type(screen.getByLabelText(/^Passcode/), 'correct horse battery');
    await u.type(screen.getByLabelText(/^Repeat passcode/), 'correct horse battery');
    await dob(u, { m: 'June', d: '1', y: '2012' });
    await u.click(screen.getByRole('button', { name: 'Create admin' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/adults only/i);
    expect(JSON.parse(localStorage.getItem('brain.auth.v1') || '{"users":[]}').users).toEqual([]);
    expect(await screen.findByText(/paused on this browser/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create admin' })).toBeNull(); // the form is gone for a day
  }, 20000);

  it('an adult creates the admin, lands on the brain home page, and can lock and sign back in', async () => {
    const { App } = await boot(),
      u = userEvent.setup();
    render(<App />);
    await makeAdmin(u);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    expect(document.querySelector('.who .role')!.textContent).toBe('Admin');
    expect(localStorage.getItem('brain.auth.v1')).not.toMatch(/correct horse|1980/);
    await u.click(screen.getByRole('button', { name: 'Lock' }));
    expect(await screen.findByRole('heading', { name: 'Restricted system' })).toBeTruthy();
    expect(useStoreRef().mem.entries).toEqual([]); // locking forgets the unlocked memory
    await u.type(screen.getByLabelText('Name'), 'owner');
    await u.type(screen.getByLabelText(/^Passcode/), 'not the passcode');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/wrong/i);
    await u.type(screen.getByLabelText(/^Passcode/), 'correct horse battery');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
  }, 30000);
});

describe('who can do what', () => {
  /** Accounts and an encrypted vault made the way the app makes them, then a real sign-in through the store. */
  async function asRole(role: 'admin' | 'viewer', seed?: object) {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    const { createUser, loadAuth } = await import('../src/lib/auth');
    const { newSecrets, encryptVault } = await import('../src/lib/vault');
    const { blankMem } = await import('../src/lib/memory');
    const db = loadAuth(localStorage),
      sec = await newSecrets(),
      dob = { y: 1980, m: 5, d: 17 },
      ctx = { now: Date.now(), iter: 1000, secrets: sec };
    const admin = await createUser(
      db,
      localStorage,
      { name: 'Owner', role: 'admin', passcode: 'correct horse battery', dob },
      { ...ctx, addedBy: null },
    );
    if (role === 'viewer')
      await createUser(
        db,
        localStorage,
        { name: 'Guest', role: 'viewer', passcode: 'visitor pass phrase', dob },
        { ...ctx, addedBy: admin.id },
      );
    localStorage.setItem(
      'brain.vault.v1',
      JSON.stringify(await encryptVault(sec, { mem: { ...blankMem(), ...seed }, keys: {} }, 1)),
    );
    const m = await boot();
    await act(async () => {
      await m.auth.useAuth
        .getState()
        .login(
          role === 'admin' ? 'Owner' : 'Guest',
          role === 'admin' ? 'correct horse battery' : 'visitor pass phrase',
        );
    });
    return { ...m, u: userEvent.setup() };
  }
  it('a viewer sees the live chat and memory but has no composer, no Admin tab and no way to add', async () => {
    const { u, App, store } = await asRole('viewer', {
      entries: [
        {
          id: 'e1',
          key: 'note:concept:a',
          type: 'concept',
          title: 'Plain words',
          note: 'Short sentences.',
          sources: [{ kind: 'file', label: 'Your note' }],
          links: [],
          strength: 2,
          seen: Date.now(),
          created: Date.now(),
          status: 'fresh',
          manual: true,
        },
      ],
      sessions: [],
    });
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    expect(document.querySelector('.who .role')!.textContent).toBe('Viewer');
    const tabs = screen.getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['Live chat', 'Memory']);
    expect(screen.queryByLabelText('Task for the team')).toBeNull();
    expect(screen.getByText(/Only admins can send tasks/i)).toBeTruthy();
    await u.click(screen.getByRole('tab', { name: 'Memory' }));
    expect(screen.queryByText(/Add a note to memory/)).toBeNull();
    await u.click(await screen.findByRole('button', { name: /Plain words/ }));
    expect(screen.getByText(/Read only/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    // even calling the store directly cannot change anything
    const s = store.useStore.getState();
    expect(s.note({ type: 'concept', title: 'Sneaky', note: 'x' })).toBeNull();
    s.remove('e1');
    s.erase();
    expect(store.useStore.getState().mem.entries.map(e => e.title)).toEqual(['Plain words']);
    expect(store.useStore.getState().status).toMatch(/Only admins/);
    expect(await s.send('hello')).toBeUndefined();
    expect(store.useStore.getState().calls).toBe(0);
    expect(await s.backup('a long passphrase')).toBe('');
    expect(localStorage.getItem('brain.vault.v1')).not.toContain('Plain words'); // memory is encrypted at rest
  }, 30000);

  it('an admin gets the composer, the Admin tab, note adding and account management', async () => {
    const { u, App } = await asRole('admin');
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Live chat', 'Memory', 'Admin']);
    expect(screen.getByLabelText('Task for the team')).toBeTruthy();
    const guide = screen.getByRole('region', { name: 'Connect real AI' }); // no key yet: steps, the provider's own key page, and a paste box
    expect(
      within(guide)
        .getByRole('link', { name: /Open OpenAI Platform/ })
        .getAttribute('href'),
    ).toBe('https://platform.openai.com/api-keys');
    await u.type(within(guide).getByLabelText('Paste API key'), 'sk-ant-api03-test');
    expect(within(guide).getByText(/looks like an Anthropic key/)).toBeTruthy();
    expect((screen.getByLabelText('Task for the team') as HTMLTextAreaElement).disabled).toBe(true);
    await u.click(screen.getByRole('tab', { name: 'Memory' }));
    await u.click(screen.getByRole('button', { name: /Add a note to memory/ }));
    await u.type(screen.getByLabelText('Title'), 'Owner likes plain words');
    await u.type(screen.getByLabelText('Note'), 'Short sentences.');
    await u.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Added.')).toBeTruthy();
    expect(screen.getAllByText('Owner likes plain words').length).toBeGreaterThan(0);
    await u.click(screen.getByRole('tab', { name: 'Admin' }));
    const acc = screen.getByText('Accounts').closest('section')!;
    expect(within(acc as HTMLElement).getByText('Owner')).toBeTruthy();
    await u.type(screen.getByLabelText('Name', { selector: 'input[placeholder="Name"]' }), 'Kid');
    await u.type(screen.getByPlaceholderText(/Passcode \(5/), 'a long enough passcode');
    await u.selectOptions(screen.getByLabelText('Month'), 'June');
    await u.type(screen.getByLabelText('Day'), '1');
    await u.type(screen.getByLabelText('Year'), '2012');
    await u.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/adults only/i));
    expect(JSON.parse(localStorage.getItem('brain.auth.v1')!).users.map((x: { name: string }) => x.name)).toEqual([
      'Owner',
    ]);
  }, 30000);
});
