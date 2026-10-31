// The accounts Edge Function (supabase/functions/accounts) run in Node against an in-memory fake of
// Supabase. No network, no real project. Deno globals are stubbed; the handler is what Deno.serve gets.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const fake = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    authUsers: [] as { id: string; email: string; password: string }[],
    tokens: new Map<string, string>(),
    lease: false,
    calls: [] as string[],
  };
  function query(table: string) {
    const rows = () => {
      state.tables[table] ??= [];
      return state.tables[table];
    };
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'delete' | 'update' | 'insert' = 'select',
      head = false,
      counted = false,
      patch: Row = {},
      payload: Row | null = null;
    const matching = () => rows().filter(r => filters.every(f => f(r)));
    const run = () => {
      state.calls.push(`${op} ${table}`);
      if (op === 'insert') {
        if (rows().some(r => r.id === payload!.id)) return { data: null, error: { message: 'duplicate key' } };
        rows().push({ ...payload });
        return { data: null, error: null };
      }
      if (op === 'delete') {
        const keep = rows().filter(r => !filters.every(f => f(r)));
        state.tables[table] = keep;
        return { data: null, error: null };
      }
      if (op === 'update') {
        for (const r of matching()) Object.assign(r, patch);
        return { data: null, error: null };
      }
      const m = matching();
      return { data: head ? null : m, count: counted ? m.length : null, error: null };
    };
    const q = {
      select(_c?: string, o?: { count?: string; head?: boolean }) {
        head = !!o?.head;
        counted = !!o?.count;
        return q;
      },
      eq(k: string, v: unknown) {
        filters.push(r => r[k] === v);
        return q;
      },
      ilike(k: string, v: string) {
        filters.push(r => String(r[k]).toLowerCase() === v.toLowerCase());
        return q;
      },
      order() {
        return q;
      },
      insert(p: Row) {
        op = 'insert';
        payload = p;
        return q;
      },
      delete() {
        op = 'delete';
        return q;
      },
      update(p: Row) {
        op = 'update';
        patch = p;
        return q;
      },
      async maybeSingle() {
        const r = run();
        return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
      },
      async single() {
        const r = run();
        const d = (r.data as Row[] | null)?.[0];
        return d ? { data: d, error: null } : { data: null, error: { message: 'no row' } };
      },
      // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable Supabase query builder
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(res, rej);
      },
    };
    return q;
  }
  const client = {
    from: query,
    async rpc(name: string) {
      state.calls.push(`rpc ${name}`);
      if (name === 'setup_needed') return { data: !(state.tables.profiles || []).some(p => p.role === 'admin') };
      if (name === 'claim_open_setup') {
        if ((state.tables.profiles || []).length || state.lease) return { data: false };
        state.lease = true;
        return { data: true };
      }
      if (name === 'release_open_setup') state.lease = false;
      return { data: null };
    },
    auth: {
      async getUser(token: string) {
        const id = state.tokens.get(token);
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'bad' } };
      },
      admin: {
        async createUser(o: { email: string; password: string }) {
          const id = `u${state.authUsers.length + 1}`;
          state.authUsers.push({ id, email: o.email, password: o.password });
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id: string) {
          state.authUsers = state.authUsers.filter(u => u.id !== id);
          state.tables.profiles = (state.tables.profiles || []).filter(p => p.id !== id);
          return { error: null };
        },
        async updateUserById(id: string, o: { password: string }) {
          const u = state.authUsers.find(x => x.id === id);
          if (u) u.password = o.password;
          return { error: null };
        },
      },
    },
  };
  return { state, client };
});
vi.mock('npm:@supabase/supabase-js@2', () => ({ createClient: () => fake.client }));

let handler: (req: Request) => Promise<Response>;
const PASS = 'A'.repeat(43);
const WRAP = { iv: 'AAAAAAAAAAAAAAAA', ct: 'B'.repeat(48) };
const ENVELOPE = { v: 1, n: 1, sig: 's', ct: 'c', iv: 'i' };
async function call(body: Row, token?: string) {
  const res = await handler(
    new Request('https://fn.test/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as Row };
}

beforeEach(async () => {
  fake.state.tables = { profiles: [], account_keys: [], vaults: [], audit_log: [] };
  fake.state.authUsers = [];
  fake.state.tokens = new Map();
  fake.state.lease = false;
  fake.state.calls = [];
  if (!handler) {
    (globalThis as unknown as { Deno: unknown }).Deno = {
      env: { get: () => 'fake-not-a-real-value' },
      serve: (h: typeof handler) => {
        handler = h;
      },
    };
    const path = new URL('../../supabase/functions/accounts/index.ts', import.meta.url).pathname;
    await import(/* @vite-ignore */ path);
  }
});

function seedLiveBrain(role = 'admin') {
  fake.state.tables.profiles.push({ id: 'u1', name: 'Owner', role });
  fake.state.tables.account_keys.push({ id: 'u1', wrap: WRAP });
  fake.state.tables.vaults.push({ id: 1, envelope: { v: 1, n: 7, sig: 'live', ct: 'live', iv: 'live' }, rev: 7 });
  fake.state.authUsers.push({ id: 'u1', email: 'owner@users.redeemed.live', password: PASS });
  fake.state.tokens.set('owner-token', 'u1');
}

describe('accounts function: setup can never wipe a live Brain', () => {
  it('refuses setup with 409 while an account exists, and leaves the vault (and its rev) unchanged', async () => {
    seedLiveBrain();
    const before = structuredClone(fake.state.tables.vaults);
    const r = await call({ action: 'setup', name: 'Intruder', password: PASS, wrap: WRAP, envelope: ENVELOPE });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Brain is already set up. Sign in instead.');
    expect(fake.state.tables.vaults).toEqual(before);
    expect(fake.state.tables.vaults[0].rev).toBe(7);
    expect(fake.state.calls).not.toContain('delete vaults');
    expect(fake.state.calls).not.toContain('insert vaults');
    expect(fake.state.calls).not.toContain('rpc claim_open_setup');
    expect(fake.state.authUsers.map(u => u.id)).toEqual(['u1']);
  });

  it('also refuses when the only account is not an admin (any account blocks setup)', async () => {
    seedLiveBrain('viewer');
    const r = await call({ action: 'setup', name: 'Intruder', password: PASS, wrap: WRAP, envelope: ENVELOPE });
    expect(r.status).toBe(409);
    expect(fake.state.tables.vaults[0].rev).toBe(7);
  });

  it('a brand-new, empty project can still create its first admin and vault', async () => {
    const r = await call({ action: 'setup', name: 'Owner', password: PASS, wrap: WRAP, envelope: ENVELOPE });
    expect(r.status).toBe(200);
    expect(fake.state.tables.profiles).toEqual([{ id: 'u1', name: 'Owner', role: 'admin' }]);
    expect(fake.state.tables.vaults).toHaveLength(1);
  });
});

describe('accounts function: admins only', () => {
  it('refuses to create a viewer (or any non-admin role)', async () => {
    seedLiveBrain();
    for (const role of ['viewer', 'bot', undefined, 'ADMIN']) {
      const r = await call({ action: 'create', name: 'Guest', role, password: PASS, wrap: WRAP }, 'owner-token');
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('Only admin accounts can be created.');
    }
    expect(fake.state.tables.profiles.map(p => p.name)).toEqual(['Owner']);
    expect(fake.state.authUsers).toHaveLength(1);
  });

  it('an admin can create another admin (the spare key)', async () => {
    seedLiveBrain();
    const r = await call({ action: 'create', name: 'Spare', role: 'admin', password: PASS, wrap: WRAP }, 'owner-token');
    expect(r.status).toBe(200);
    expect(fake.state.tables.profiles.map(p => [p.name, p.role])).toEqual([
      ['Owner', 'admin'],
      ['Spare', 'admin'],
    ]);
  });
});
