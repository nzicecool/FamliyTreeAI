import { Person, TreeData } from '../types';
import { INITIAL_DATA } from '../constants';

export const storageService = {
  // Helper to get auth headers
  async getHeaders(getToken: () => Promise<string | null>) {
    const token = await getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  },

  // Load all people to reconstruct the tree
  async loadTree(getToken: () => Promise<string | null>): Promise<TreeData> {
    try {
      const headers = await this.getHeaders(getToken);
      const response = await fetch('/api/tree/load', { headers });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load tree');
      }

      const data = await response.json();
      
      // If empty, seed with initial data
      if (Object.keys(data.people).length === 0) {
        return this.seedData(getToken);
      }

      return data;
    } catch (error) {
      console.error('Load tree error:', error);
      throw error;
    }
  },

  // Save or Update a single person
  async savePerson(person: Person, getToken: () => Promise<string | null>): Promise<void> {
    try {
      const headers = await this.getHeaders(getToken);
      const response = await fetch('/api/tree/save-person', {
        method: 'POST',
        headers,
        body: JSON.stringify({ person })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save person');
      }
    } catch (error) {
      console.error('Save person error:', error);
      throw error;
    }
  },

  // Delete a person
  async deletePerson(id: string, getToken: () => Promise<string | null>): Promise<void> {
    try {
      const headers = await this.getHeaders(getToken);
      const response = await fetch(`/api/tree/delete-person/${id}`, {
        method: 'DELETE',
        headers
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete person');
      }
    } catch (error) {
      console.error('Delete person error:', error);
      throw error;
    }
  },

  // Save tree metadata
  async saveTreeMeta(rootId: string, getToken: () => Promise<string | null>): Promise<void> {
    try {
      const headers = await this.getHeaders(getToken);
      const response = await fetch('/api/tree/save-meta', {
        method: 'POST',
        headers,
        body: JSON.stringify({ rootId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save meta');
      }
    } catch (error) {
      console.error('Save meta error:', error);
      throw error;
    }
  },

  // Seed initial data if empty
  async seedData(getToken: () => Promise<string | null>): Promise<TreeData> {
    const people = Object.values(INITIAL_DATA.people);
    for (const person of people) {
      await this.savePerson(person, getToken);
    }
    await this.saveTreeMeta(INITIAL_DATA.rootId, getToken);
    return INITIAL_DATA;
  },

  // Validate connection (noop for now as we use API)
  async testConnection() {
    return true;
  }
};
