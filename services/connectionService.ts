import { familyScopeHeaders } from './familyService';
import type { ConnectionInput, ConnectionsResponse, SharedPerson } from '../connectionTypes';
type GetToken = () => Promise<string | null>;
async function request<T>(path: string, getToken: GetToken, method = 'GET', body?: unknown): Promise<T> {
  const scope = familyScopeHeaders();
  const token = await getToken();
  if (!token) throw new Error('Please sign in again.');
  const res = await fetch(`/api/family-links${path}`, {
    method, headers: { ...scope, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'The family connection could not be updated.');
  return result;
}
export const connectionService = {
  list: (token: GetToken) => request<ConnectionsResponse>('', token),
  people: (token: GetToken) => request<{ people: SharedPerson[] }>('/people', token),
  invite: (targetFamilyId: string | undefined, token: GetToken) =>
    request<{ token: string; expiresAt: string }>('/invitations', token, 'POST', { targetFamilyId }),
  accept: (invitationToken: string, token: GetToken) =>
    request<{ id: string }>('/accept', token, 'POST', { token: invitationToken }),
  cancelInvite: (id: string, token: GetToken) => request(`/invitations/${encodeURIComponent(id)}`, token, 'DELETE'),
  add: (linkId: string, input: ConnectionInput, token: GetToken) =>
    request(`/${encodeURIComponent(linkId)}/connections`, token, 'POST', input),
  update: (id: string, input: ConnectionInput, token: GetToken) =>
    request(`/connections/${encodeURIComponent(id)}`, token, 'PATCH', input),
  approve: (id: string, version: number, token: GetToken) =>
    request(`/connections/${encodeURIComponent(id)}/approve`, token, 'POST', { version }),
  remove: (id: string, token: GetToken) => request(`/connections/${encodeURIComponent(id)}`, token, 'DELETE'),
  disconnect: (id: string, token: GetToken) => request(`/${encodeURIComponent(id)}`, token, 'DELETE'),
};
