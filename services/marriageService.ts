import { Marriage, MarriageStatus } from '../types';
import { familyScopeHeaders } from './familyService';

export const marriageService = {
  async getHeaders(getToken: () => Promise<string | null>) {
    const scope = familyScopeHeaders();
    const token = await getToken();
    return {
      ...scope,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  },

  async listAll(getToken: () => Promise<string | null>): Promise<Marriage[]> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch('/api/marriages', { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load marriages');
    return res.json();
  },

  async listForPerson(personId: string, getToken: () => Promise<string | null>): Promise<Marriage[]> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/person/${personId}/marriages`, { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load marriages');
    return res.json();
  },

  async create(
    data: {
      person1Id: string;
      person2Id: string;
      marriageDate?: string;
      marriagePlace?: string;
      status?: MarriageStatus;
    },
    getToken: () => Promise<string | null>,
  ): Promise<Marriage> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch('/api/marriage', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create marriage');
    return res.json();
  },

  async update(
    id: string,
    data: Partial<Omit<Marriage, 'id' | 'person1Id' | 'person2Id' | 'createdAt'>>,
    getToken: () => Promise<string | null>,
  ): Promise<Marriage> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/marriage/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update marriage');
    return res.json();
  },

  async remove(id: string, getToken: () => Promise<string | null>): Promise<void> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/marriage/${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete marriage');
  },
};
