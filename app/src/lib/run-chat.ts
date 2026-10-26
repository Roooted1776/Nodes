// Chat mode: one real model reply. Saved as a session. Never auto-files wiki memory or the Dream inbox.
import { TYPE_COLOR } from '../data/colors';
import type { Flow, Msg, Session } from './memory';
import { PROV, PROVIDERS, ProviderError, callModel, type ProviderId } from './providers';
import { redact } from './redact';
import { contextBlock, indexTitles, relevant } from './retrieve';
import { clip } from './text';
import { NOT_ADMIN, type TaskDeps } from './run-task';

export const CHAT_SYSTEM =
  "You are a helpful assistant in Owner's Brain chat. Answer clearly in plain words. " +
  'Use BRAIN CONTEXT only as hints that may be wrong. Never invent secrets, keys, or actions. ' +
  'You cannot run tools, edit files, or take actions outside this reply. If something needs the team, say so.';

export async function runChat(raw: string, d: TaskDeps): Promise<void> {
  const { get, set, say, clean, addPulse, words, admin, ctls } = d;
  if (!admin()) {
    set({ status: NOT_ADMIN });
    return;
  }
  const s = get(),
    r = redact(raw.trim(), Object.values(get().keys).filter(Boolean) as string[]),
    q = r.text.slice(0, 2000);
  if (!q) return set({ status: 'Write a message first.' });
  if (r.n) {
    s.commit(m => {
      m.filtered += r.n;
    });
  }
  if (s.busy || s.dreaming) return;
  if (s.incognito) return set({ status: 'Incognito: chat is not saved. Turn it off to keep messages.' });
  const pv: ProviderId | undefined =
    s.keys[s.live.provider] && !s.dead[s.live.provider]
      ? s.live.provider
      : PROVIDERS.find(p => !!s.keys[p] && !s.dead[p]);
  if (!pv) return set({ status: `Add your ${PROV[s.live.provider].label} key in Settings. Nothing was sent.` });
  if (s.dead[pv]) return set({ status: `${PROV[pv].label} rejected the key. Reload to try again.` });
  if (s.calls >= s.live.callCap)
    return set({ status: 'The call budget for this page load is used. Reload to reset it.' });

  const model = s.live.models[pv] || PROV[pv].model,
    tag = `chat · ${PROV[pv].label} · ${model} · unverified`;
  const matchProj = q.match(/^\[([^\]]+)\]/);
  const assignedProj = matchProj ? matchProj[1].trim() : s.activeProject || 'Brain';

  let ctxBlock = '';
  const used: string[] = [];
  if (s.mem.settings.brain && s.mem.settings.useMemory !== false) {
    const hits = relevant(s.mem, q, 4, assignedProj);
    used.push(...hits.map(h => h.e.id));
    set({ used });
    hits.forEach((h, i) =>
      addPulse('mem:' + h.e.id, 'chatgpt', TYPE_COLOR[h.e.type], {
        dur: 900,
        delay: 60 * i,
        words: words(h.e.title + ' ' + h.e.note),
      }),
    );
    if (hits.length)
      set(x => ({
        flow: [
          ...x.flow,
          ['memory', 'chatgpt', hits.reduce((n, h) => n + (words(h.e.title + ' ' + h.e.note) || 0), 0)] as Flow,
        ].slice(-40),
      }));
    ctxBlock = contextBlock(
      hits.map(h => h.e),
      indexTitles(s.mem),
    );
  }

  set({
    busy: true,
    stopped: false,
    viewing: null,
    tab: 'chat',
    active: 'chatgpt',
    draft: null,
    calls: s.calls + 1,
    status: `Chat: ${PROV[pv].label} · ${model}`,
  });

  const ownerMsg: Msg = { from: 'owner', tag: '', text: q };
  say(ownerMsg);

  const priorId = get().chatThreadId;
  const prior = priorId ? get().mem.sessions.find(x => x.id === priorId && x.kind === 'chat') || null : null;

  const history = prior
    ? prior.msgs
        .slice(-12)
        .map(m => `${m.from === 'owner' ? 'Owner' : 'Assistant'}: ${clip(m.text, 500)}`)
        .join('\n')
    : '';

  const user = (ctxBlock ? ctxBlock + '\n\n' : '') + (history ? `RECENT CHAT:\n${history}\n\n` : '') + `Owner: ${q}`;

  const ctl = new AbortController();
  ctls.add(ctl);
  const t0 = performance.now();
  let shown = 0;

  const persist = (extra: Msg) => {
    let threadId = prior?.id || null;
    if (get().mem.settings.brain) {
      get().commit(m => {
        const existing = prior ? m.sessions.find(x => x.id === prior.id) : null;
        if (existing) {
          existing.msgs = [...existing.msgs, ownerMsg, extra].slice(-40);
          existing.ts = Date.now();
          existing.q = clip(q, 300);
          if (used.length) existing.used = Array.from(new Set([...(existing.used || []), ...used])).slice(0, 12);
          threadId = existing.id;
        } else {
          const sess: Session = {
            id: 's' + m.nextSession++,
            ts: Date.now(),
            q: clip(q, 300),
            kind: 'chat',
            project: assignedProj,
            kws: [],
            accepted: [],
            uncovered: [],
            used,
            learned: false,
            msgs: [ownerMsg, extra],
          };
          m.sessions.push(sess);
          if (m.sessions.length > 25) m.sessions.shift();
          // Chat stays out of the Dream inbox — casual talk is not trusted wiki fact.
          threadId = sess.id;
        }
      });
    }
    if (threadId) set({ chatThreadId: threadId });
  };

  try {
    const res = await callModel({
      provider: pv,
      key: s.keys[pv]!,
      model,
      system: CHAT_SYSTEM,
      user,
      maxTokens: Math.min(s.live.maxTokens, 900),
      web: false,
      signal: ctl.signal,
      onDelta: t => {
        const n = performance.now();
        if (n - shown < 80) return;
        shown = n;
        set({ draft: { from: 'chatgpt', text: clean(t) } });
      },
    });
    const text = clean(res.text.trim());
    if (!text) throw new Error(res.why ? `no text (${res.why})` : 'an empty reply');
    const reply: Msg = { from: 'chatgpt', tag, text: text.slice(0, 4000) };
    say(reply);
    set(x => ({
      tin: x.tin + res.tin,
      tout: x.tout + res.tout,
      timing: { ...x.timing, chatgpt: Math.round(performance.now() - t0) },
      status: `Chat answered by ${PROV[pv].label}. Not filed to wiki memory.`,
    }));
    persist(reply);
  } catch (e: unknown) {
    if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [pv]: true } }));
    const err = clean(e instanceof Error ? e.message : String(e));
    const fail: Msg = { from: 'brain', tag: 'page', text: 'Chat failed: ' + clip(err, 200) };
    say({ ...fail, cls: 'warn' });
    persist(fail);
    set({ status: 'Chat failed. Your message was kept. Nothing was made up.' });
  } finally {
    ctls.delete(ctl);
    set({ busy: false, active: null, draft: null });
  }
}
