import { PersonDocument, DocumentType } from '../types';
import { familyScopeHeaders } from './familyService';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/bmp',
];

export const documentService = {
  async getHeaders(getToken: () => Promise<string | null>) {
    const scope = familyScopeHeaders();
    const token = await getToken();
    return {
      ...scope,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  },

  async listDocuments(
    personId: string,
    getToken: () => Promise<string | null>,
  ): Promise<PersonDocument[]> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/person/${personId}/documents`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load documents');
    }
    return res.json();
  },

  async uploadDocument(
    personId: string,
    file: File,
    docType: DocumentType,
    getToken: () => Promise<string | null>,
  ): Promise<PersonDocument> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File is too large. Maximum size is 5 MB.');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error('Unsupported file type. Upload a PDF or an image.');
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/person/${personId}/document`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: file.name,
        docType,
        mimeType: file.type,
        fileSize: file.size,
        fileData: base64,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload document');
    }
    return res.json();
  },

  async getDocumentData(
    docId: string,
    getToken: () => Promise<string | null>,
  ): Promise<{ fileData: string; mimeType: string; name: string }> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/document/${docId}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch document');
    }
    return res.json();
  },

  async deleteDocument(
    docId: string,
    getToken: () => Promise<string | null>,
  ): Promise<void> {
    const headers = await this.getHeaders(getToken);
    const res = await fetch(`/api/document/${docId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete document');
    }
  },

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },
};
