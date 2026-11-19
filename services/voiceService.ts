import { familyScopeHeaders } from './familyService';
import type { VoiceMemory } from '../connectionTypes';
type GetToken = () => Promise<string | null>;
async function auth(getToken: GetToken) {
  const scope = familyScopeHeaders();
  const token = await getToken();
  if (!token) throw new Error('Please sign in again.');
  return { ...scope, Authorization: `Bearer ${token}` };
}
async function checked(res: Response) {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Voice recording request failed.');
  return res;
}
export const voiceService = {
  async list(personId: string, getToken: GetToken): Promise<VoiceMemory[]> {
    return (await checked(await fetch(`/api/person/${encodeURIComponent(personId)}/voices`, { headers: await auth(getToken) }))).json();
  },
  async upload(personId: string, file: File, title: string, getToken: GetToken): Promise<VoiceMemory> {
    return (await checked(await fetch(`/api/person/${encodeURIComponent(personId)}/voices?title=${encodeURIComponent(title)}`, {
      method: 'POST', headers: { ...await auth(getToken), 'Content-Type': file.type || 'application/octet-stream' }, body: file,
    }))).json();
  },
  async blob(id: string, getToken: GetToken): Promise<Blob> {
    return (await checked(await fetch(`/api/voices/${encodeURIComponent(id)}/audio`, { headers: await auth(getToken) }))).blob();
  },
  async remove(id: string, getToken: GetToken) {
    await checked(await fetch(`/api/voices/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await auth(getToken) }));
  },
};
