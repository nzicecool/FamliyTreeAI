export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'glm' | 'kimi';
export type BYOProvider = Exclude<ProviderId, 'gemini'>;

export interface AISettings {
  provider: ProviderId;
  configured: Record<BYOProvider, boolean>;
  hasGeminiServerKey: boolean;
}

type GetToken = () => Promise<string | null>;

async function authedFetch(path: string, getToken: GetToken, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

export const settingsService = {
  async load(getToken: GetToken): Promise<AISettings> {
    const res = await authedFetch('/api/settings', getToken);
    if (!res.ok) throw new Error('Could not load settings.');
    return res.json();
  },

  async setProvider(provider: ProviderId, getToken: GetToken): Promise<AISettings> {
    const res = await authedFetch('/api/settings', getToken, {
      method: 'PUT',
      body: JSON.stringify({ provider }),
    });
    if (!res.ok) throw new Error('Could not save provider.');
    return res.json();
  },

  async setKey(provider: BYOProvider, key: string, getToken: GetToken): Promise<AISettings> {
    const res = await authedFetch('/api/settings/key', getToken, {
      method: 'PUT',
      body: JSON.stringify({ provider, key }),
    });
    if (!res.ok) throw new Error('Could not save API key.');
    return res.json();
  },

  async clearKey(provider: BYOProvider, getToken: GetToken): Promise<AISettings> {
    const res = await authedFetch(`/api/settings/key/${provider}`, getToken, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Could not clear API key.');
    return res.json();
  },
};
