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
  users: [] as { id: string; name: string; role: 'admin'; password: string; wrap: any }[],
  vault: null as any,
  rev: 1,
  failStatus: false,
}));
vi.mock('../src/lib/cloud', () => ({
  async accounts(action: string, b: any = {}) {
    if (action === 'status') {
      if (server.failStatus) throw new Error('Cannot reach server');
      return { setupNeeded: !server.users.length };
    }
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
  async syncMemoryDatabase() {
    return { saved: 0, failed: 0, firstError: '' };
  },
  async loadMemoryDatabase() {
    return { entries: [], sessions: [] };
  },
  resetMirror() {},
  async readAudit() {
    return [];
  },
}));

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
async function makeAdmin(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText('Username'), 'Owner');
  await u.type(screen.getByLabelText('Password'), 'correct horse battery');
  await u.click(screen.getByRole('button', { name: 'Create admin' }));
}

beforeEach(() => {
  server.users = [];
  server.vault = null;
  server.rev = 1;
  server.failStatus = false;
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => cleanup());

describe('setup and login', () => {
  it('first run shows only username and password, and refuses a short password', async () => {
    const { App } = await boot(),
      u = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Set up Brain' })).toBeTruthy();
    expect((await screen.findByTestId('brain')).dataset.locked).toBe('true');
    const card = screen.getByRole('heading', { name: 'Set up Brain' }).closest('section')!;
    expect(
      within(card as HTMLElement).getAllByRole('textbox').length + card.querySelectorAll('input[type=password]').length,
    ).toBe(2);
    await u.type(screen.getByLabelText('Username'), 'Owner');
    await u.type(screen.getByLabelText('Password'), 'five5');
    await u.click(screen.getByRole('button', { name: 'Create admin' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 6/i);
    expect(server.users).toEqual([]);
  }, 20000);

  it('the first visitor creates the admin, lands on the brain home page, and can lock and sign back in', async () => {
    const { App } = await boot(),
      u = userEvent.setup();
    render(<App />);
    await makeAdmin(u);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Admin panel' })).toBeTruthy();
    expect(localStorage.getItem('brain.auth.v1') || '').not.toMatch(/correct horse/);
    await u.click(screen.getByRole('button', { name: 'Lock' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Brain' })).toBeTruthy();
    expect(useStoreRef().mem.entries).toEqual([]); // locking forgets the unlocked memory
    await u.type(screen.getByLabelText('Username'), 'owner');
    await u.type(screen.getByLabelText('Password'), 'not the passcode');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/wrong/i);
    await u.type(screen.getByLabelText('Password'), 'correct horse battery');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
  }, 30000);

  it('the sign-in screen has no way to register: admin sign-in only', async () => {
    server.users = [{ id: '1', name: 'Owner', role: 'admin', password: 'x', wrap: null }];
    const { App } = await boot();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sign in to Brain' })).toBeTruthy();
    expect(screen.getByText('Admin sign-in only.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Register as admin' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Set up Brain' })).toBeNull();
  });

  it('the connection-error screen offers only Retry', async () => {
    server.failStatus = true;
    vi.resetModules();
    const { default: App } = await import('../src/App');
    render(<App />);
    expect(await screen.findByText('Cannot reach server')).toBeTruthy();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Retry']);
    expect(screen.queryByRole('button', { name: 'Register as admin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Already an admin? Sign in' })).toBeNull();
  });
});

describe('who can do what', () => {
  /** Accounts and an encrypted vault made the way the app makes them, then a real sign-in through the store. */
  async function asRole(_role: 'admin', seed?: object, vaultKeys?: object, prep?: () => void) {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    prep?.();
    const { derivePassword } = await import('../src/lib/auth');
    const { newSecrets, encryptVault, sealFor } = await import('../src/lib/vault');
    const { blankMem } = await import('../src/lib/memory');
    const sec = await newSecrets();
    server.users = [];
    for (const [name, pass] of [['Owner', 'correct horse battery']] as const) {
      const { password, kek } = await derivePassword(name, pass);
      server.users.push({ id: name, name, role: 'admin', password, wrap: await sealFor(kek, sec) });
    }
    server.vault = await encryptVault(sec, { mem: { ...blankMem(), ...seed }, keys: vaultKeys || {} }, 1);
    server.rev = 1;
    const m = await boot();
    await act(async () => {
      await m.auth.useAuth.getState().login('Owner', 'correct horse battery');
    });
    return { ...m, u: userEvent.setup(), sec };
  }
  it('once locked there is no role: no composer, no admin panel, no way to change anything', async () => {
    const { App, store, auth } = await asRole('admin', {
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
    act(() => auth.useAuth.getState().logout());
    expect(await screen.findByRole('heading', { name: 'Sign in to Brain' })).toBeTruthy();
    expect(store.useStore.getState().role).toBeNull();
    expect(screen.queryByLabelText('Task for the team')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Admin panel' })).toBeNull();
    // even calling the store directly cannot change anything
    const s = store.useStore.getState();
    expect(s.note({ type: 'concept', title: 'Sneaky', note: 'x' })).toBeNull();
    s.remove('e1');
    s.erase();
    expect(store.useStore.getState().mem.entries).toEqual([]);
    expect(store.useStore.getState().status).toMatch(/Only admins/);
    expect(await s.send('hello')).toBeUndefined();
    expect(store.useStore.getState().calls).toBe(0);
    expect(await s.backup('a long passphrase')).toBe('');
    expect(localStorage.getItem('brain.vault.v1')).not.toContain('Plain words'); // memory is encrypted at rest
  }, 30000);

  it('an admin gets the composer and the admin panel along the bottom, with keys and accounts', async () => {
    const { u, App } = await asRole('admin');
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.getByLabelText('Task for the team')).toBeTruthy();
    const bar = screen.getByRole('region', { name: 'Admin panel' });
    const keys = within(bar).getByText('API keys').closest('section')!; // the one place to paste a key
    expect(
      within(keys as HTMLElement)
        .getAllByRole('link', { name: /Get key/ })[1]
        .getAttribute('href'),
    ).toBe('https://platform.openai.com/api-keys');
    expect(within(bar).queryByRole('region', { name: 'Connect real AI' })).toBeNull();
    expect((screen.getByLabelText('Task for the team') as HTMLTextAreaElement).disabled).toBe(false);
    const acc = within(bar).getByText('Accounts').closest('section')!;
    expect(within(acc as HTMLElement).getByText('Owner')).toBeTruthy();
    await u.type(screen.getByLabelText('Name', { selector: 'input[placeholder="Name"]' }), 'Kid');
    await u.type(screen.getByPlaceholderText(/Password \(6/), 'a long enough password');
    await u.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(server.users.map(u => u.name)).toEqual(['Owner', 'Kid']));
  }, 30000);

  it('live chat: coloured bot names with icons, who is doing what, and a red name while a bot is out of tokens', async () => {
    const { u, App, store } = await asRole('admin');
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    act(() => {
      store.useStore.setState({
        log: [{ id: 1, from: 'claude', tag: 'live · test', text: 'Here is the plan.' }],
        stages: { cursor: 'working' },
      });
    });
    const chat = screen.getByRole('region', { name: 'Live chat' });
    expect(within(chat).getByText('Here is the plan.')).toBeTruthy();
    expect(chat.querySelectorAll('.bot-icon').length).toBeGreaterThanOrEqual(2);
    const doing = chat.querySelector('.activity')!;
    expect(doing.textContent).toMatch(/Cursor/);
    const claude = within(chat).getByRole('button', { name: 'Claude' });
    expect(claude.className).not.toMatch(/limited/);
    act(() => store.useStore.setState({ ranOn: { claude: 'google' } }));
    expect(within(chat).getByText('via Google')).toBeTruthy(); // a free stand-in is labelled, never passed off as the real bot
    act(() => store.useStore.setState({ limited: ['claude'] }));
    expect(within(chat).getByRole('button', { name: 'Claude' }).className).toMatch(/limited/);
    act(() => store.useStore.setState({ limited: [] })); // it answered again
    expect(within(chat).getByRole('button', { name: 'Claude' }).className).not.toMatch(/limited/);
    // clicking a name opens that bot's profile
    await u.click(within(chat).getByRole('button', { name: 'Claude' }));
    const dialog = await screen.findByRole('dialog', { name: /Agent Inspector: Claude/ });
    expect(within(dialog).getByText(/Anthropic/)).toBeTruthy();
  }, 30000);

  it('the handoff pane beside the chat shows starting point → the bot it goes to', async () => {
    const { App, store } = await asRole('admin');
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    act(() => {
      store.useStore.setState({
        flow: [
          ['owner', 'grok', 12],
          ['grok', 'claude', 80],
        ],
      });
    });
    const pane = screen.getByRole('region', { name: 'Handoffs' });
    const rows = within(pane)
      .getAllByRole('listitem')
      .map(li => li.textContent);
    expect(rows[0]).toMatch(/You.*goes to.*Grok/);
    expect(rows[1]).toMatch(/Grok.*goes to.*Claude/);
  }, 30000);

  it('knows a token or rate limit from other failures', async () => {
    const { isLimitError, ProviderError } = await import('../src/lib/providers');
    expect(isLimitError(new ProviderError('HTTP 429: Too Many Requests'))).toBe(true);
    expect(isLimitError(new ProviderError('HTTP 400: maximum context length exceeded'))).toBe(true);
    expect(isLimitError(new ProviderError('HTTP 402', false, true))).toBe(true);
    expect(isLimitError(new ProviderError('HTTP 401: invalid key', true))).toBe(false);
    expect(isLimitError(new Error('network down'))).toBe(false);
  });

  it('restores API keys from the encrypted database vault upon admin unlock', async () => {
    const { store } = await asRole('admin', {}, { openai: 'sk-test-openai-persisted' });
    expect(store.useStore.getState().keys.openai).toBe('sk-test-openai-persisted');
  });

  it('takes keys out of an old shared vault on the admin unlock and keeps them on this device only', async () => {
    const { store, auth, sec } = await asRole('admin', {}, { openai: 'sk-test-old-vault-key' });
    const { decryptVault } = await import('../src/lib/vault');
    expect(store.useStore.getState().keys.openai).toBe('sk-test-old-vault-key');
    // the re-saved shared vault (the database copy) has no keys, also when opened with only the read keys
    expect(server.rev).toBe(2);
    const reader = { dek: sec.dek, pub: sec.pub };
    const shared = (await decryptVault(reader, server.vault)) as Record<string, unknown>;
    expect(Object.keys(shared)).toEqual(['mem']);
    expect(JSON.stringify(shared)).not.toContain('sk-test-old-vault-key');
    const local = (await decryptVault(reader, JSON.parse(localStorage.getItem('brain.vault.v1')!))) as object;
    expect(Object.keys(local)).toEqual(['mem']);
    // a key added now is sealed on this device and never reaches the shared vault
    act(() => store.useStore.getState().setKey('sk-test-new-key', 'anthropic'));
    await waitFor(() => expect(server.rev).toBe(3));
    await waitFor(() => expect(localStorage.getItem('brain.keys.v1')).toBeTruthy());
    const after = (await decryptVault(reader, server.vault)) as Record<string, unknown>;
    expect(Object.keys(after)).toEqual(['mem']);
    expect(JSON.stringify(after)).not.toMatch(/sk-test/);
    const everything = Object.keys(localStorage)
      .map(k => localStorage.getItem(k))
      .join('\n');
    expect(everything).not.toMatch(/sk-test/); // sealed, never plain
    // lock and unlock on the same device: the keys come back from the device copy
    act(() => auth.useAuth.getState().logout());
    expect(store.useStore.getState().keys).toEqual({});
    await act(async () => {
      await auth.useAuth.getState().login('Owner', 'correct horse battery');
    });
    expect(store.useStore.getState().keys).toEqual({
      openai: 'sk-test-old-vault-key',
      anthropic: 'sk-test-new-key',
    });
  }, 30000);

  it('never keeps the GitHub token in plain localStorage, and it survives lock on this device', async () => {
    const plain = JSON.stringify({
      repo: 'Roooted1776/Brain',
      token: 'ghp_plainOldToken',
      recentRepos: [],
      lastSync: {},
    });
    const { store, auth, sec } = await asRole('admin', {}, undefined, () =>
      localStorage.setItem('brain.github.v1', plain),
    );
    const { decryptVault } = await import('../src/lib/vault');
    const dump = () =>
      Object.keys(localStorage)
        .map(k => localStorage.getItem(k))
        .join('\n');
    // the plain copy found on load is gone, and the admin unlock sealed it on this device
    expect(localStorage.getItem('brain.github.v1')).not.toContain('token');
    expect(store.useStore.getState().githubToken).toBe('ghp_plainOldToken');
    expect(dump()).not.toContain('ghp_');
    act(() => store.useStore.getState().setGithubConfig({ token: 'ghp_typedNewToken' }));
    await new Promise(r => setTimeout(r, 50));
    expect(dump()).not.toContain('ghp_');
    const shared = (await decryptVault({ dek: sec.dek, pub: sec.pub }, server.vault)) as Record<string, unknown>;
    expect(JSON.stringify(shared)).not.toContain('ghp_');
    act(() => auth.useAuth.getState().logout());
    expect(store.useStore.getState().githubToken).toBe('');
    await act(async () => {
      await auth.useAuth.getState().login('Owner', 'correct horse battery');
    });
    expect(store.useStore.getState().githubToken).toBe('ghp_typedNewToken');
  }, 30000);

  it('once locked nobody can test the GitHub connection and no keys or token stay loaded', async () => {
    const { store, auth } = await asRole('admin', {}, { openai: 'sk-test-locked-should-not-keep' });
    act(() => auth.useAuth.getState().logout());
    expect(store.useStore.getState().keys).toEqual({});
    expect(store.useStore.getState().githubToken).toBe('');
    const r = await store.useStore.getState().testGithub('Roooted1776/ch29ouy', 'ghp_x');
    expect(r.ok).toBe(false);
    expect(store.useStore.getState().status).toMatch(/Only admins/);
  }, 30000);

  it('displays past session where bots worked on a task and were talking when opening Brain', async () => {
    const pastSession = {
      id: 's1',
      ts: Date.now() - 3600000,
      q: 'Build the orbital station',
      msgs: [
        { from: 'claude', tag: 'live · Anthropic · test', text: 'Analyzing requirements for the station.' },
        { from: 'cursor', tag: 'live · Anthropic · test', text: 'Implemented propulsion module in code.' },
        { from: 'grokbot', tag: 'live · Anthropic · test', text: 'All integration checks passed. PASS.' },
      ],
      cover: { claude: { s: 'done' }, cursor: { s: 'done' }, grokbot: { s: 'done' } },
    };
    const { App } = await asRole('admin', { sessions: [pastSession] });
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();
    const chat = screen.getByRole('region', { name: 'Live chat' });
    expect(within(chat).getByText(/Build the orbital station/)).toBeTruthy();
    expect(within(chat).getByText('Analyzing requirements for the station.')).toBeTruthy();
    expect(within(chat).getByText('Implemented propulsion module in code.')).toBeTruthy();
    expect(within(chat).getByText('All integration checks passed. PASS.')).toBeTruthy();
  });

  it('admin sees GitHub Connector in AdminPanel and GitHub tab in Memory import modal', async () => {
    const { App } = await asRole('admin');
    const u = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('main', { name: 'Brain view' })).toBeTruthy();

    // 1. Check Admin Panel has GitHub Connector
    expect(await screen.findByText('GitHub Connector')).toBeTruthy();
    expect(screen.getByLabelText('GitHub Repository')).toBeTruthy();
    expect(screen.getByLabelText('GitHub Personal Access Token')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sync to Brain' })).toBeTruthy();

    // 2. Check MemoryPanel import modal with GitHub tab
    const MemoryPanel = (await import('../src/components/MemoryPanel')).default;
    cleanup();
    render(<MemoryPanel />);

    const ghBtn = await screen.findByRole('button', { name: '🐙 GitHub' });
    expect(ghBtn).toBeTruthy();
    await u.click(ghBtn);

    const modal = await screen.findByRole('dialog', { name: 'Import Memory Files' });
    expect(modal).toBeTruthy();
    expect(within(modal).getByRole('button', { name: '🐙 GitHub' }).className).toContain('on');
    expect(within(modal).getByLabelText('GitHub Repository')).toBeTruthy();
    expect(within(modal).getByRole('button', { name: 'Fetch from GitHub' })).toBeTruthy();
  }, 30000);
});
