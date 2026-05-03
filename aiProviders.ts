/**
 * Server-side AI provider dispatcher. All API keys live here (or in the
 * `user_settings` Postgres table) and never reach the browser.
 *
 * Supports 5 providers: Google Gemini (default, server env), OpenAI, Anthropic,
 * Zhipu GLM (OpenAI-compatible), and Moonshot Kimi (OpenAI-compatible).
 */

import { GoogleGenAI } from '@google/genai';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'glm' | 'kimi';

export const ALL_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'glm', 'kimi'];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  glm: 'Zhipu GLM',
  kimi: 'Moonshot Kimi',
};

export interface ProviderKeys {
  openai?: string | null;
  anthropic?: string | null;
  glm?: string | null;
  kimi?: string | null;
}

export interface CompletionOptions {
  json?: boolean;
  jsonSchemaHint?: string; // human-readable schema description embedded into prompt for json mode
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  glm: 'glm-4-flash',
  kimi: 'moonshot-v1-8k',
};

const OPENAI_COMPATIBLE_BASE: Record<'openai' | 'glm' | 'kimi', string> = {
  openai: 'https://api.openai.com/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  kimi: 'https://api.moonshot.cn/v1',
};

class AIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function makeAIError(status: number, message: string) {
  return new AIError(status, message);
}

export function isAIError(e: unknown): e is AIError {
  return e instanceof AIError;
}

async function completeGemini(prompt: string, opts: CompletionOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw makeAIError(503, 'Gemini is not configured on the server.');
  const ai = new GoogleGenAI({ apiKey });
  const config: any = {};
  if (opts.json) {
    config.responseMimeType = 'application/json';
  }
  const response = await ai.models.generateContent({
    model: DEFAULT_MODELS.gemini,
    contents: prompt,
    config: Object.keys(config).length ? config : undefined,
  });
  return response.text || '';
}

async function completeOpenAICompatible(
  base: string,
  apiKey: string,
  model: string,
  prompt: string,
  opts: CompletionOptions,
): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  };
  if (opts.json) body.response_format = { type: 'json_object' };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw makeAIError(res.status, `Provider error (${res.status}): ${errText.slice(0, 300) || 'no body'}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw makeAIError(502, 'Provider returned an unexpected payload.');
  return text;
}

async function completeAnthropic(apiKey: string, prompt: string, opts: CompletionOptions): Promise<string> {
  const body: any = {
    model: DEFAULT_MODELS.anthropic,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw makeAIError(res.status, `Anthropic error (${res.status}): ${errText.slice(0, 300) || 'no body'}`);
  }
  const data = await res.json();
  const block = Array.isArray(data?.content) ? data.content.find((b: any) => b.type === 'text') : null;
  const text: string | undefined = block?.text;
  if (typeof text !== 'string') throw makeAIError(502, 'Anthropic returned an unexpected payload.');
  // If JSON was requested, Claude may wrap in fences — strip them.
  if (opts.json) return stripJsonFences(text);
  return text;
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  // ```json ... ``` or ``` ... ```
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = trimmed.match(fence);
  if (m) return m[1].trim();
  return trimmed;
}

export interface ResolvedProvider {
  provider: ProviderId;
  reason: 'user-selected' | 'fallback-gemini';
}

/**
 * Pick the provider to actually call. If the user picked a non-Gemini provider
 * but didn't supply a key for it, fall back to Gemini (server env) so the app
 * still works — the caller surfaces this in the response so the UI can warn.
 */
export function resolveProvider(preferred: ProviderId, keys: ProviderKeys): ResolvedProvider {
  if (preferred === 'gemini') return { provider: 'gemini', reason: 'user-selected' };
  const key = keys[preferred as Exclude<ProviderId, 'gemini'>];
  if (key && key.trim()) return { provider: preferred, reason: 'user-selected' };
  return { provider: 'gemini', reason: 'fallback-gemini' };
}

export async function complete(
  preferred: ProviderId,
  keys: ProviderKeys,
  prompt: string,
  opts: CompletionOptions = {},
): Promise<{ text: string; resolved: ResolvedProvider }> {
  const resolved = resolveProvider(preferred, keys);
  const provider = resolved.provider;
  const fullPrompt = opts.json && opts.jsonSchemaHint
    ? `${prompt}\n\nReturn ONLY a single JSON object that matches this shape:\n${opts.jsonSchemaHint}\nDo not wrap in code fences.`
    : prompt;

  try {
    let text: string;
    if (provider === 'gemini') {
      text = await completeGemini(fullPrompt, opts);
    } else if (provider === 'anthropic') {
      text = await completeAnthropic(keys.anthropic!, fullPrompt, opts);
    } else if (provider === 'openai' || provider === 'glm' || provider === 'kimi') {
      text = await completeOpenAICompatible(
        OPENAI_COMPATIBLE_BASE[provider],
        (keys as any)[provider],
        DEFAULT_MODELS[provider],
        fullPrompt,
        opts,
      );
    } else {
      throw makeAIError(400, `Unknown provider: ${provider}`);
    }
    return { text, resolved };
  } catch (err: any) {
    if (isAIError(err)) throw err;
    console.error(`AI provider ${provider} failed:`, err);
    throw makeAIError(502, err?.message || 'AI provider request failed.');
  }
}

// Schema hint used for the structured "smart add" extraction.
export const PERSON_JSON_HINT = `{
  "firstName": "string (required)",
  "lastName": "string (required)",
  "gender": "one of 'Male' | 'Female' | 'Other' (required)",
  "birthDate": "YYYY-MM-DD if possible, otherwise free text (optional)",
  "birthPlace": "string (optional)",
  "deathDate": "YYYY-MM-DD if possible (optional)",
  "deathPlace": "string (optional)",
  "bio": "short summary (optional)"
}`;

