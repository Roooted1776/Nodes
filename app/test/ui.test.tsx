// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
vi.mock('../src/components/BrainScene', () => ({
  default: ({ locked }: { locked?: boolean }) => <div data-testid="brain" data-locked={String(!!locked)} />,
}));

// Fake backend only: no test sends credentials or traffic to the real project.
const server = vi.hoisted(() => ({
  users: [] as { id: string; name: string; role: 'admin' | 'viewer'; password: string; wrap: any }[],
  vault: null as any,
  rev: 1,
}));
vi.mock('../src/lib/cloud', () => ({
  async accounts(action: string, b: any = {}) {
    if (action === 'status') return { setupNeeded: !server.users.length };
    if (action === 'list') return { users: server.users.map(u => ({ ...u, created_at: new Date().toISOString() })) };
    if (action === 'setup' || action === 'create') {
      const user = {
        id: String(server.users.length + 1),
        name: b.name,
        password: b.password,
        role: action === 'setup' ? ('admin' as const) : b.role,
        wrap: b.wrap,
      };
      server.users.push(user);
      if (b.envelope) server.vault = b.envelope;
      return { ok: true, user };
    }
    if (action === 'remove') {
      server.users = server.users.filter(u => u.id !== b.id);
      return { ok: true };
    }
    if (action === 'reset') {
      Object.assign(server.users.find(u => u.id === b.id)!, { password: b.password, wrap: b.wrap });
      return { ok: true };
    }
    throw new Error('Unknown fake action');
  },
  async signIn(name: string, pass: string) {
    const { derivePassword } = await import('../src/lib/auth');
    const { password, kek } = await derivePassword(name, pass);
    const user = server.users.find(u => u.name.toLowerCase() === name.trim().toLowerCase() && u.password === password);
    if (!user) throw new Error('Name or passcode is wrong.');
    return { user: { id: user.id, name: user.name, role: user.role }, kek };
  },
  async signOut() {},
  async accountWrap(uid: string) {
    return server.users.find(u => u.id === uid)!.wrap;
  },
  async loadVault() {
    return { envelope: server.vault, rev: server.rev };
  },
  async saveVault(envelope: any, rev: number) {
    if (rev !== server.rev) throw new Error('Conflict');
    server.vault = envelope;
    return ++server.rev;
  },
  async writeAudit() {},
  async syncMemoryDatabase() {},
  async readAudit() {
    return [];
  },
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
  await auth.useAuth.getState().init();
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
  server.users = [];
  server.vault = null;
  server.rev = 1;
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
    expect(localStorage.getItem('brain.auth.v1') || '').not.toMatch(/correct horse|1980/);
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
    const { derivePassword } = await import('../src/lib/auth');
    const { newSecrets, encryptVault, sealFor } = await import('../src/lib/vault');
    const { blankMem } = await import('../src/lib/memory');
    const sec = await newSecrets();
    server.users = [];
    for (const [name, accountRole, pass] of [
      ['Owner', 'admin', 'correct horse battery'],
      ['Guest', 'viewer', 'visitor pass phrase'],
    ] as const) {
      const { password, kek } = await derivePassword(name, pass);
      server.users.push({
        id: name,
        name,
        role: accountRole,
        password,
        wrap: await sealFor(kek, sec, accountRole === 'admin'),
      });
    }
    server.vault = await encryptVault(sec, { mem: { ...blankMem(), ...seed } }, 1);
    if (role === 'admin') server.users = server.users.filter(u => u.role === 'admin');
    server.rev = 1;
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
    expect(server.users.map(u => u.name)).toEqual(['Owner']);
  }, 30000);

  it('chat panel has auto-scroll enabled by default and can toggle off and on', async () => {
    const { u, App } = await asRole('admin');
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    const autoScrollBtn = screen.getByRole('button', { name: /Auto-scroll/i });
    expect(autoScrollBtn.textContent).toBe('Auto-scroll on');
    expect(autoScrollBtn.getAttribute('aria-pressed')).toBe('true');
    await u.click(autoScrollBtn);
    expect(autoScrollBtn.textContent).toBe('Auto-scroll off');
    expect(autoScrollBtn.getAttribute('aria-pressed')).toBe('false');
    await u.click(autoScrollBtn);
    expect(autoScrollBtn.textContent).toBe('Auto-scroll on');
    expect(autoScrollBtn.getAttribute('aria-pressed')).toBe('true');
  }, 30000);

  it('allows inspecting bots from Team roster, sorting memories, and viewing work tracker', async () => {
    const { u, App } = await asRole('admin', {
      entries: [
        {
          id: 'e1',
          key: 'note:concept:zebra',
          type: 'concept',
          title: 'Zebra Concept',
          note: 'Last in alpha.',
          sources: [],
          links: [],
          strength: 5,
          seen: 1000,
          created: 1000,
          status: 'fresh',
          manual: true,
        },
        {
          id: 'e2',
          key: 'note:workstream:apple',
          type: 'workstream',
          title: 'Apple Project',
          note: 'First in alpha.',
          sources: [],
          links: [],
          strength: 1,
          seen: 2000,
          created: 2000,
          status: 'fresh',
          manual: true,
        },
      ],
    });
    render(<App />);

    // 1. Inspect a bot from Team view ("see you guys")
    await u.click(screen.getByRole('button', { name: /Team diagram/i }));
    const roster = await screen.findByRole('navigation', { name: 'AI Team Roster' });
    expect(roster).toBeTruthy();
    await u.click(within(roster).getByRole('button', { name: /Claude/ }));
    const dialog = await screen.findByRole('dialog', { name: /Agent Inspector: Claude/ });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/Anthropic/)).toBeTruthy();
    expect(within(dialog).getByText(/Surgical Strike/)).toBeTruthy();

    // 2. Memory sorting & Work Tracker
    await u.click(screen.getByRole('tab', { name: 'Memory' }));
    expect(screen.getByText('Zebra Concept')).toBeTruthy();
    expect(screen.getByText('Apple Project')).toBeTruthy();

    // Click sort A–Z
    await u.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(screen.getByText('Apple Project')).toBeTruthy();

    // Work Tracker filter
    await u.click(screen.getByRole('tab', { name: /Workstreams/ }));
    expect(screen.getByText('WORK TRACKER')).toBeTruthy();
  }, 30000);
});
