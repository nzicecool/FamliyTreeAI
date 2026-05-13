import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { DocumentType, DOCUMENT_TYPE_LABELS, PersonDocument } from '../types';
import { documentService } from '../services/documentService';
import {
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  Loader2,
  ScrollText,
  BookMarked,
  ShieldCheck,
  Globe,
  Library,
  Image as ImageIcon,
  File,
} from 'lucide-react';

interface DocumentsSectionProps {
  personId: string;
}

const DOC_TYPE_ICON: Record<DocumentType, React.ReactNode> = {
  [DocumentType.BirthCertificate]: <ScrollText size={14} />,
  [DocumentType.MarriageCertificate]: <BookMarked size={14} />,
  [DocumentType.DeathCertificate]: <ShieldCheck size={14} />,
  [DocumentType.Passport]: <Globe size={14} />,
  [DocumentType.CensusRecord]: <Library size={14} />,
  [DocumentType.Photograph]: <ImageIcon size={14} />,
  [DocumentType.Other]: <File size={14} />,
};

const DOC_TYPE_COLOR: Record<DocumentType, string> = {
  [DocumentType.BirthCertificate]: 'text-emerald-400 bg-emerald-500/10',
  [DocumentType.MarriageCertificate]: 'text-pink-400 bg-pink-500/10',
  [DocumentType.DeathCertificate]: 'text-slate-400 bg-slate-500/10',
  [DocumentType.Passport]: 'text-blue-400 bg-blue-500/10',
  [DocumentType.CensusRecord]: 'text-amber-400 bg-amber-500/10',
  [DocumentType.Photograph]: 'text-violet-400 bg-violet-500/10',
  [DocumentType.Other]: 'text-slate-400 bg-slate-500/10',
};

export const DocumentsSection: React.FC<DocumentsSectionProps> = ({ personId }) => {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<PersonDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType>(DocumentType.BirthCertificate);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    documentService
      .listDocuments(personId, getToken)
      .then(list => { if (!cancelled) setDocs(list); })
      .catch(err => console.error('Load documents error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);
    setUploading(true);
    try {
      const doc = await documentService.uploadDocument(personId, file, selectedType, getToken);
      setDocs(prev => [doc, ...prev]);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc: PersonDocument) => {
    setPreviewingId(doc.id);
    try {
      const { fileData } = await documentService.getDocumentData(doc.id, getToken);
      const link = window.document.createElement('a');
      link.href = fileData;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = doc.name;
      link.click();
    } catch (err: any) {
      console.error('View document error:', err);
    } finally {
      setPreviewingId(null);
    }
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await documentService.deleteDocument(docId, getToken);
      setDocs(prev => prev.filter(d => d.id !== docId));
    } catch (err: any) {
      console.error('Delete document error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <FileText size={14} className="text-brand-400" />
        Documents
      </h3>

      {/* Upload row */}
      <div className="flex gap-2">
        <select
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none"
          value={selectedType}
          onChange={e => setSelectedType(e.target.value as DocumentType)}
        >
          {(Object.values(DocumentType) as DocumentType[]).map(t => (
            <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors whitespace-nowrap"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Upload
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,image/*"
        onChange={handleFileChange}
      />
      <p className="text-xs text-slate-500">PDF or image · max 5 MB</p>

      {uploadError && (
        <p className="text-xs text-red-400">{uploadError}</p>
      )}

      {/* Document list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-500 py-1">No documents attached yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map(doc => (
            <li
              key={doc.id}
              className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
            >
              <span className={`p-1 rounded ${DOC_TYPE_COLOR[doc.docType as DocumentType]} shrink-0`}>
                {DOC_TYPE_ICON[doc.docType as DocumentType]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate leading-tight">{doc.name}</p>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {DOCUMENT_TYPE_LABELS[doc.docType as DocumentType]} · {documentService.formatFileSize(doc.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleView(doc)}
                disabled={previewingId === doc.id}
                className="text-slate-400 hover:text-brand-400 transition-colors disabled:opacity-50 shrink-0"
                title="Open / Download"
              >
                {previewingId === doc.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : <ExternalLink size={14} />}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                title="Delete document"
              >
                {deletingId === doc.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
