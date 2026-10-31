// All browser tests intercept the entire project origin. No real Supabase or AI traffic.
import type { BrowserContext } from '@playwright/test';
type Account = { id: string; name: string; role: 'admin'; password: string; wrap: unknown };
export async function fakeBackend(context: BrowserContext) {
  const users: Account[] = [];
  let envelope: unknown = null,
    revision = 1;
  const tokens = new Map<string, Account>();
  await context.route('https://iihjcqiiavleyheqzotl.supabase.co/**', async route => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'content-type': 'application/json',
    };
    const send = (body: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return send({});
    const b = req.postData() ? req.postDataJSON() : {};
    const me = tokens.get((req.headers().authorization || '').replace(/^Bearer /, ''));
    if (url.pathname === '/functions/v1/accounts') {
      if (b.action === 'status') return send({ setupNeeded: users.length === 0 });
      if (b.action === 'setup' || b.action === 'create') {
        if (b.action === 'create' && me?.role !== 'admin') return send({ error: 'Only admins' }, 403);
        if (b.action === 'create' && b.role !== 'admin')
          return send({ error: 'Only admin accounts can be created.' }, 400);
        if (b.action === 'setup' && users.length)
          return send({ error: 'Brain is already set up. Sign in instead.' }, 409);
        const user: Account = {
          id: `00000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`,
          name: b.name,
          role: 'admin',
          password: b.password,
          wrap: b.wrap,
        };
        users.push(user);
        if (b.envelope) envelope = b.envelope;
        return send({ ok: true, user });
      }
      if (b.action === 'list' && me?.role === 'admin')
        return send({
          users: users.map(u => ({ id: u.id, name: u.name, role: u.role, created_at: new Date().toISOString() })),
        });
      return send({ error: 'Not allowed' }, 403);
    }
    if (url.pathname === '/auth/v1/token') {
      const user = users.find(
        u => u.name.toLowerCase().replace(/ /g, '.') + '@users.redeemed.live' === b.email && u.password === b.password,
      );
      if (!user) return send({ msg: 'Invalid login credentials' }, 400);
      const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fake-test-signature`;
      tokens.set(token, user);
      return send({
        access_token: token,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-test-refresh',
        user: {
          id: user.id,
          aud: 'authenticated',
          role: 'authenticated',
          email: b.email,
          created_at: new Date().toISOString(),
        },
      });
    }
    if (url.pathname === '/auth/v1/logout') return send({});
    if (!me) return send({ message: 'Unauthorized' }, 401);
    if (url.pathname === '/rest/v1/profiles') return send({ id: me.id, name: me.name, role: me.role });
    if (url.pathname === '/rest/v1/account_keys') return send({ wrap: me.wrap });
    if (url.pathname === '/rest/v1/vaults') {
      if (req.method() === 'PATCH') {
        if (me.role !== 'admin') return send({ message: 'Read only' }, 403);
        if (url.searchParams.get('rev') !== `eq.${revision}`) return send(null);
        envelope = b.envelope;
        revision++;
        return send({ rev: revision });
      }
      return send({ envelope, rev: revision });
    }
    if (url.pathname === '/rest/v1/audit_log') return send([]);
    // Persistent memory mirror: admin only (matches production RLS).
    if (
      url.pathname === '/rest/v1/projects' ||
      url.pathname === '/rest/v1/memories' ||
      url.pathname === '/rest/v1/sessions'
    ) {
      if (me.role !== 'admin') return send({ message: 'Admin only' }, 403);
      return send([]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      if (me.role !== 'admin' && /upsert_(memory|session)/.test(url.pathname))
        return send({ message: 'Only admins may update memory' }, 403);
      return send({ ok: true });
    }
    return send({ error: 'Unhandled fake request' }, 400);
  });
  return { users, getEnvelope: () => envelope };
}
