import { Family, FamilyContext, FamilyDetails, FamilyInput, PublicFamily } from '../familyTypes';

type GetToken = () => Promise<string | null>;
let activeFamilyId: string | null = null;

// Keep this per-tab, not localStorage: switching families in another tab must
// never cause a save in this tab to target the wrong family's records.
export function setActiveFamilyScope(id: string | null) {
  activeFamilyId = id;
}

export function familyScopeHeaders(): Record<string, string> {
  return activeFamilyId ? { 'X-Family-Id': activeFamilyId } : {};
}

export function captureInvitation() {
  const token = new URL(window.location.href).searchParams.get('invite');
  if (token) {
    sessionStorage.setItem('familytree:invite', token);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}

export function pendingInvitationToken(): string | null {
  return sessionStorage.getItem('familytree:invite');
}

export function clearInvitationToken() {
  sessionStorage.removeItem('familytree:invite');
}

async function request<T>(path: string, getToken: GetToken, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Please sign in again.');
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The family request could not be completed.');
  return body;
}

export const familyService = {
  context: (getToken: GetToken) => request<FamilyContext>('/api/families/context', getToken),
  create: (input: FamilyInput, getToken: GetToken) =>
    request<{ family: Family }>('/api/families', getToken, { method: 'POST', body: JSON.stringify(input) }),
  activate: (id: string, getToken: GetToken) =>
    request<{ ok: boolean }>(`/api/families/${encodeURIComponent(id)}/activate`, getToken, { method: 'POST' }),
  search: (query: string, getToken: GetToken) =>
    request<{ families: PublicFamily[] }>(`/api/families/search?q=${encodeURIComponent(query)}`, getToken),
  requestJoin: (id: string, message: string, getToken: GetToken) =>
    request<{ ok: boolean }>(`/api/families/${encodeURIComponent(id)}/requests`, getToken, {
      method: 'POST', body: JSON.stringify({ message }),
    }),
  acceptInvite: (input: { invitationId?: string; token?: string }, getToken: GetToken) =>
    request<{ ok: boolean }>('/api/families/accept-invite', getToken, {
      method: 'POST', body: JSON.stringify(input),
    }),
  details: (id: string, getToken: GetToken) =>
    request<FamilyDetails>(`/api/families/${encodeURIComponent(id)}/manage`, getToken),
  update: (id: string, input: FamilyInput, getToken: GetToken) =>
    request<{ ok: boolean }>(`/api/families/${encodeURIComponent(id)}`, getToken, {
      method: 'PATCH', body: JSON.stringify(input),
    }),
  invite: (id: string, email: string, getToken: GetToken) =>
    request<{ invitationId: string; token: string; emailSent: boolean; emailError: string | null }>(
      `/api/families/${encodeURIComponent(id)}/invitations`, getToken, {
        method: 'POST', body: JSON.stringify({ email }),
      }),
  revokeInvite: (familyId: string, invitationId: string, getToken: GetToken) =>
    request<{ ok: boolean }>(`/api/families/${encodeURIComponent(familyId)}/invitations/${encodeURIComponent(invitationId)}`,
      getToken, { method: 'DELETE' }),
  decideRequest: (familyId: string, requestId: string, decision: 'approve' | 'reject', getToken: GetToken) =>
    request<{ ok: boolean }>(
      `/api/families/${encodeURIComponent(familyId)}/requests/${encodeURIComponent(requestId)}/decision`,
      getToken, { method: 'POST', body: JSON.stringify({ decision }) }),
};
