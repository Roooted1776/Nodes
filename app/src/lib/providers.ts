import { redact } from './redact';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'xai';
export interface Provider {
  label: string;
  model: string;
  hint: string;
  color: string;
}
export const PROV: Record<ProviderId, Provider> = {
  anthropic: { label: 'Anthropic', model: 'claude-haiku-4-5', hint: 'key starts with sk-ant-', color: '#f2a67a' },
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', hint: 'key starts with sk-', color: '#79cbb2' },
  google: { label: 'Google', model: 'gemini-3.1-flash-lite', hint: 'key starts with AIza', color: '#8bb7ff' },
  xai: { label: 'xAI', model: 'grok-4.3', hint: 'key starts with xai-', color: '#d7b3ff' },
};
export const PROVIDERS = Object.keys(PROV) as ProviderId[];
/** Model ids the providers have shut down or redirected (checked Oct 2026). A saved setting with one of these moves to the current default. */
export const RETIRED = new Set([
  'claude-3-5-haiku-latest',
  'claude-3-5-haiku-20241022',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.0-flash',
  'grok-3-mini',
  'grok-3',
]);
export const MODEL_RE = /^[A-Za-z0-9._:-]{1,80}$/;

export function isCreditOrQuotaError(msg: string, status?: number): boolean {
  if (status === 402) return true;
  return /credit|quota|billing|balance|payment|insufficient|exhausted|unpaid/i.test(msg);
}

/** A token, rate or credit limit (as opposed to a bad key or a network problem). */
export function isLimitError(e: unknown): boolean {
  if (e instanceof ProviderError && e.outOfCredits) return true;
  const m = e instanceof Error ? e.message : String(e);
  return /HTTP 429|rate.?limit|too many requests|tokens? (per|limit)|context (length|window)|maximum context|max_tokens|resource.?exhausted|overloaded|HTTP 529/i.test(
    m,
  );
}

export class ProviderError extends Error {
  constructor(
    msg: string,
    public rejected = false,
    public outOfCredits = false,
  ) {
    super(msg);
  }
}
export interface CallResult {
  text: string;
  why: string;
  tin: number;
  tout: number;
}
export interface CallOpts {
  provider: ProviderId;
  key: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** When set, the reply is streamed and this is called with the text so far as it arrives. */
  onDelta?: (textSoFar: string) => void;
}

function httpMessage(status: number, body: string, key: string) {
  let m = '';
  try {
    const j = JSON.parse(body);
    m = (j.error && (j.error.message || (typeof j.error === 'string' ? j.error : ''))) || j.message || '';
  } catch {
    /* not JSON */
  }
  return 'HTTP ' + status + (m ? ': ' + redact(String(m), [key]).text.slice(0, 160) : '');
}

/** Build the request for one provider. Exported for tests. */
export function buildRequest(
  o: Pick<CallOpts, 'provider' | 'key' | 'model' | 'system' | 'user' | 'maxTokens'>,
  stream = false,
): { url: string; headers: Record<string, string>; body: unknown } {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.provider === 'anthropic') {
    headers['x-api-key'] = o.key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers,
      body: {
        model: o.model,
        max_tokens: o.maxTokens,
        system: o.system,
        messages: [{ role: 'user', content: o.user }],
        ...(stream ? { stream: true } : {}),
      },
    };
  }
  if (o.provider === 'openai' || o.provider === 'xai') {
    headers.authorization = 'Bearer ' + o.key;
    const body: Record<string, unknown> = {
      model: o.model,
      input: [
        { role: 'system', content: o.system },
        { role: 'user', content: o.user },
      ],
      max_output_tokens: o.maxTokens,
    };
    if (o.provider === 'openai') body.store = false;
    if (stream) body.stream = true;
    return {
      url: o.provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.x.ai/v1/responses',
      headers,
      body,
    };
  }
  return {
    url:
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(o.model) +
      (stream ? ':streamGenerateContent?alt=sse&key=' : ':generateContent?key=') +
      encodeURIComponent(o.key),
    headers,
    body: {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: 'user', parts: [{ text: o.user }] }],
      generationConfig: { maxOutputTokens: o.maxTokens },
    },
  };
}

export function parseReply(provider: ProviderId, data: any): CallResult {
  if (provider === 'anthropic')
    return {
      text: (data.content || [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join(''),
      why: data.stop_reason || '',
      tin: +data.usage?.input_tokens || 0,
      tout: +data.usage?.output_tokens || 0,
    };
  if (provider === 'google') {
    const c = (data.candidates || [])[0] || {};
    return {
      text: (c.content?.parts || []).map((p: any) => p.text || '').join(''),
      why: c.finishReason || data.promptFeedback?.blockReason || '',
      tin: +data.usageMetadata?.promptTokenCount || 0,
      tout: +data.usageMetadata?.candidatesTokenCount || 0,
    };
  }
  let text = typeof data.output_text === 'string' ? data.output_text : '';
  if (!text)
    text = (data.output || [])
      .flatMap((it: any) => it.content || [])
      .filter((c: any) => c && typeof c.text === 'string' && (!c.type || c.type === 'output_text'))
      .map((c: any) => c.text)
      .join('');
  return {
    text,
    why: data.incomplete_details?.reason || '',
    tin: +data.usage?.input_tokens || 0,
    tout: +data.usage?.output_tokens || 0,
  };
}

/** Folds one server-sent event into the reply so far. Exported for tests. */
export function foldEvent(provider: ProviderId, acc: CallResult, ev: any): CallResult {
  if (!ev || typeof ev !== 'object') return acc;
  if (provider === 'anthropic') {
    if (ev.type === 'message_start') return { ...acc, tin: +ev.message?.usage?.input_tokens || acc.tin };
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta')
      return { ...acc, text: acc.text + (ev.delta.text || '') };
    if (ev.type === 'message_delta')
      return { ...acc, why: ev.delta?.stop_reason || acc.why, tout: +ev.usage?.output_tokens || acc.tout };
    if (ev.type === 'error') throw new ProviderError(String(ev.error?.message || 'stream error').slice(0, 160));
    return acc;
  }
  if (provider === 'google') {
    const r = parseReply('google', ev);
    return { text: acc.text + r.text, why: r.why || acc.why, tin: r.tin || acc.tin, tout: r.tout || acc.tout };
  }
  if (ev.type === 'response.output_text.delta') return { ...acc, text: acc.text + (ev.delta || '') };
  if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
    const r = ev.response || {};
    return {
      ...acc,
      text: acc.text || parseReply(provider, r).text,
      why: r.incomplete_details?.reason || acc.why,
      tin: +r.usage?.input_tokens || acc.tin,
      tout: +r.usage?.output_tokens || acc.tout,
    };
  }
  if (ev.type === 'error' || ev.type === 'response.failed')
    throw new ProviderError(
      String(ev.message || ev.error?.message || ev.response?.error?.message || 'stream error').slice(0, 160),
    );
  return acc;
}

/** Reads a text/event-stream body, calling onDelta as text arrives. */
async function readStream(
  provider: ProviderId,
  res: Response,
  onDelta: (t: string) => void,
  key: string,
): Promise<CallResult> {
  let acc: CallResult = { text: '', why: '', tin: 0, tout: 0 },
    buf = '',
    last = '';
  const reader = res.body!.getReader(),
    dec = new TextDecoder();
  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    const d = line.slice(5).trim();
    if (!d || d === '[DONE]') return;
    let ev: unknown;
    try {
      ev = JSON.parse(d);
    } catch {
      return;
    }
    acc = foldEvent(provider, acc, ev);
    if (acc.text !== last) {
      last = acc.text;
      onDelta(redact(acc.text, [key]).text);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    for (let k = buf.indexOf('\n'); k >= 0; k = buf.indexOf('\n')) {
      take(buf.slice(0, k).replace(/\r$/, ''));
      buf = buf.slice(k + 1);
    }
    if (done) {
      if (buf) take(buf);
      break;
    }
  }
  return acc;
}

/** One call to one provider. The key goes only to that provider and is never logged. */
export async function callModel(o: CallOpts): Promise<CallResult> {
  const req = buildRequest(o, !!o.onDelta),
    ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 30000);
  const onStop = () => ctl.abort();
  o.signal?.addEventListener('abort', onStop);
  let res: Response,
    raw = '',
    streamed: CallResult | null = null;
  try {
    res = await (o.fetchImpl || fetch)(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: ctl.signal,
    });
    if (res.ok && o.onDelta && res.body && /event-stream/i.test(res.headers.get('content-type') || ''))
      streamed = await readStream(o.provider, res, o.onDelta, o.key);
    else raw = await res.text();
  } catch (e: any) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(
      o.signal?.aborted
        ? 'stopped by you'
        : e?.name === 'AbortError'
          ? 'no answer after 30 seconds'
          : 'the browser blocked the call (open index.html from your computer and check your internet)',
    );
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onStop);
  }
  if (streamed) return streamed;
  if (!res.ok) {
    const rejected =
      res.status === 401 ||
      res.status === 403 ||
      (o.provider === 'google' && res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(raw));
    const msg = httpMessage(res.status, raw, o.key);
    const outOfCredits = isCreditOrQuotaError(raw + ' ' + msg, res.status);
    throw new ProviderError(
      msg + (rejected ? ' (key rejected; this provider is off until you reload)' : ''),
      rejected,
      outOfCredits,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProviderError('the reply was not JSON');
  }
  return parseReply(o.provider, data);
}
