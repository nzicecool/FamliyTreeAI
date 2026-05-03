import { Person, TreeData } from '../types';

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

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

export interface AIResultMeta {
  provider: string;
  fellBackToGemini: boolean;
}

export const aiService = {
  async generateBio(person: Person, getToken: GetToken): Promise<{ bio: string; meta: AIResultMeta }> {
    const res = await authedFetch('/api/ai/bio', getToken, {
      method: 'POST',
      body: JSON.stringify({ person }),
    });
    if (!res.ok) throw new Error(await readError(res, 'Could not generate biography.'));
    const data = await res.json();
    return { bio: data.bio || '', meta: data.meta };
  },

  async parseSmartEntry(text: string, getToken: GetToken): Promise<{ person: Partial<Person> | null; meta: AIResultMeta }> {
    const res = await authedFetch('/api/ai/parse', getToken, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await readError(res, 'Could not extract record.'));
    const data = await res.json();
    return { person: data.person || null, meta: data.meta };
  },

  async generateFamilyNarrative(
    treeData: TreeData,
    focusPersonId: string | null,
    getToken: GetToken,
  ): Promise<{ narrative: string; meta: AIResultMeta }> {
    const res = await authedFetch('/api/ai/narrative', getToken, {
      method: 'POST',
      body: JSON.stringify({ treeData, focusPersonId }),
    });
    if (!res.ok) throw new Error(await readError(res, 'Could not generate narrative.'));
    const data = await res.json();
    return { narrative: data.narrative || '', meta: data.meta };
  },
};
