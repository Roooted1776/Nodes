import type { ProviderId } from './providers';

/** Where each provider hands out API keys, checked Oct 2026. Links open the provider's own site in a new tab. */
export interface KeyGuide {
  site: string;
  url: string;
  steps: string[];
  prefix: string;
}
export const KEY_GUIDE: Record<ProviderId, KeyGuide> = {
  anthropic: {
    site: 'Claude Console',
    url: 'https://platform.claude.com/settings/keys',
    prefix: 'sk-ant-',
    steps: [
      'Sign in at platform.claude.com',
      'Open API keys and press Create key',
      'Copy the key. It is shown only once',
      'Add credits under Billing, or calls are refused',
    ],
  },
  openai: {
    site: 'OpenAI Platform',
    url: 'https://platform.openai.com/api-keys',
    prefix: 'sk-',
    steps: [
      'Sign in at platform.openai.com',
      'Open API keys and create a new secret key',
      'Copy the key. It is shown only once',
      'Add a payment method under Billing',
    ],
  },
  google: {
    site: 'Google AI Studio',
    url: 'https://aistudio.google.com/apikey',
    prefix: 'AIza',
    steps: [
      'Sign in at aistudio.google.com',
      'Open Get API key and create a key',
      'Copy the key',
      'Free use has rate limits; add billing for more',
    ],
  },
  xai: {
    site: 'xAI Console',
    url: 'https://console.x.ai',
    prefix: 'xai-',
    steps: [
      'Sign in at console.x.ai',
      'Open API Keys and create a key',
      'Copy the key. It is shown only once',
      'Add credits, or calls are refused',
    ],
  },
  groq: {
    site: 'GroqCloud',
    url: 'https://console.groq.com/keys',
    prefix: 'gsk_',
    steps: [
      'Sign in at console.groq.com (free, no card)',
      'Open API Keys and press Create API Key',
      'Copy the key. It is shown only once',
      'The free plan has daily limits; nothing is charged',
    ],
  },
  cerebras: {
    site: 'Cerebras Cloud',
    url: 'https://cloud.cerebras.ai',
    prefix: 'csk-',
    steps: [
      'Sign in at cloud.cerebras.ai (free tier)',
      'Open API Keys and create a key',
      'Copy the key and paste it here',
      "The free tier has daily limits; check the page for today's numbers",
    ],
  },
  freebuff: {
    site: 'Freebuff',
    url: 'https://freebuff.com',
    prefix: '',
    steps: [
      'Sign in at freebuff.com',
      'Freebuff has no official public API. Use the token it gives you after sign-in',
      'Paste the token here and press Test',
      'If the test fails, the address or model name may differ. Change the Model box',
    ],
  },
  muse: {
    site: 'Meta Model API',
    url: 'https://dev.meta.ai',
    prefix: '',
    steps: [
      'Sign in at dev.meta.ai (a separate login from Facebook)',
      'Open the Model API dashboard and create a key',
      'Copy the key. It is shown only once',
      'Billing may be needed before calls work',
    ],
  },
};

/** Which provider a pasted key most likely belongs to, from its prefix. */
export function guessProvider(key: string): ProviderId | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('csk-')) return 'cerebras';
  if (k.startsWith('AIza')) return 'google';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}
