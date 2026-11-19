import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { AlertCircle, Download, Headphones, Loader2, Mic2, Trash2, Upload, Volume2 } from 'lucide-react';
import type { VoiceMemory } from '../connectionTypes';
import { voiceService } from '../services/voiceService';

interface VoiceMemoriesSectionProps {
  personId: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SECONDS = 180;
const acceptedTypes = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'application/ogg',
  'audio/webm',
]);
const acceptedExtensions = /\.(mp3|m4a|wav|ogg|webm)$/i;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The voice recording request could not be completed.';
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Duration unavailable';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const VoiceMemoriesSection: React.FC<VoiceMemoriesSectionProps> = ({ personId }) => {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const urlMap = useRef<Map<string, string>>(new Map());
  const visibleIds = useRef<Set<string>>(new Set());
  const requestVersion = useRef(0);
  const scopeVersion = useRef(0);
  const fileVersion = useRef(0);
  const [memories, setMemories] = useState<VoiceMemory[]>([]);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [decodedDuration, setDecodedDuration] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingAudioId, setLoadingAudioId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const revokeAllUrls = () => {
    urlMap.current.forEach((url) => URL.revokeObjectURL(url));
    urlMap.current.clear();
    setBlobUrls({});
  };

  const load = useCallback(async (scope: string, quiet = false) => {
    const version = ++requestVersion.current;
    if (!quiet) setLoading(true);
    try {
      const result = await voiceService.list(scope, getToken);
      if (version !== requestVersion.current || scope !== personId) return;
      const nextIds = new Set(result.map((memory) => memory.id));
      urlMap.current.forEach((url, id) => {
        if (!nextIds.has(id)) {
          URL.revokeObjectURL(url);
          urlMap.current.delete(id);
        }
      });
      visibleIds.current = nextIds;
      setBlobUrls((current) => Object.fromEntries(Object.entries(current).filter(([id]) => nextIds.has(id))));
      setMemories(result);
      setError('');
    } catch (err) {
      if (version !== requestVersion.current || scope !== personId) return;
      setError(errorMessage(err));
      setMemories([]);
      visibleIds.current.clear();
      revokeAllUrls();
    } finally {
      if (version === requestVersion.current && scope === personId && !quiet) setLoading(false);
    }
  }, [personId, getToken]);

  useEffect(() => {
    scopeVersion.current += 1;
    requestVersion.current += 1;
    setMemories([]);
    visibleIds.current = new Set();
    setLoading(true);
    setSelectedFile(null);
    setTitle('');
    setDecodedDuration(null);
    setValidating(false);
    setUploading(false);
    setLoadingAudioId('');
    setDeletingId('');
    if (inputRef.current) inputRef.current.value = '';
    setError('');
    setSuccess('');
    revokeAllUrls();
    void load(personId);
    const onFocus = () => { void load(personId, true); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      void load(personId, true);
    }, 15000);
    return () => {
      scopeVersion.current += 1;
      requestVersion.current += 1;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
      revokeAllUrls();
    };
  }, [personId, load]);

  const decodeFile = async (file: File): Promise<number> => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser cannot inspect audio files. Try a recent browser that supports audio playback.');
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      return decoded.duration;
    } catch {
      throw new Error('This file could not be decoded as supported audio. Choose a playable MP3, M4A, WAV, OGG, or WebM recording.');
    } finally {
      await context.close().catch(() => undefined);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    const scope = scopeVersion.current;
    const selection = ++fileVersion.current;
    setValidating(false);
    setError('');
    setSuccess('');
    setSelectedFile(file);
    setDecodedDuration(null);
    if (!acceptedExtensions.test(file.name) && !acceptedTypes.has(file.type.toLowerCase())) {
      setError('Choose an MP3, M4A, WAV, OGG, or WebM audio file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('This file is over the 10 MB limit. Choose a smaller recording.');
      return;
    }
    setValidating(true);
    try {
      const duration = await decodeFile(file);
      if (scope !== scopeVersion.current || selection !== fileVersion.current) return;
      setDecodedDuration(duration);
      if (duration > MAX_SECONDS) setError('This recording is longer than three minutes. Trim it before uploading.');
    } catch (err) {
      if (scope === scopeVersion.current && selection === fileVersion.current) setError(errorMessage(err));
    } finally {
      if (scope === scopeVersion.current && selection === fileVersion.current) setValidating(false);
    }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !title.trim() || decodedDuration === null || decodedDuration > MAX_SECONDS || selectedFile.size > MAX_BYTES) return;
    const scope = scopeVersion.current;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const saved = await voiceService.upload(personId, selectedFile, title.trim(), getToken);
      if (scope !== scopeVersion.current) return;
      visibleIds.current.add(saved.id);
      setMemories((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedFile(null);
      setTitle('');
      setDecodedDuration(null);
      if (inputRef.current) inputRef.current.value = '';
      setSuccess('Voice memory saved to this family’s private record.');
      await load(personId, true);
    } catch (err) {
      if (scope === scopeVersion.current) setError(`${errorMessage(err)} Your selected file and title are still here so you can retry.`);
    } finally {
      if (scope === scopeVersion.current) setUploading(false);
    }
  };

  const loadAudio = async (memory: VoiceMemory) => {
    if (urlMap.current.has(memory.id)) return;
    const scope = scopeVersion.current;
    setLoadingAudioId(memory.id);
    setError('');
    try {
      const blob = await voiceService.blob(memory.id, getToken);
      if (scope !== scopeVersion.current || personId !== memory.personId || !visibleIds.current.has(memory.id)) return;
      const url = URL.createObjectURL(blob);
      urlMap.current.set(memory.id, url);
      setBlobUrls((current) => ({ ...current, [memory.id]: url }));
    } catch (err) {
      if (scope === scopeVersion.current) setError(errorMessage(err));
    } finally {
      if (scope === scopeVersion.current) setLoadingAudioId('');
    }
  };

  const download = async (memory: VoiceMemory) => {
    let url = urlMap.current.get(memory.id);
    if (!url) {
      const scope = scopeVersion.current;
      setLoadingAudioId(memory.id);
      setError('');
      try {
        const blob = await voiceService.blob(memory.id, getToken);
        if (scope !== scopeVersion.current || personId !== memory.personId || !visibleIds.current.has(memory.id)) return;
        url = URL.createObjectURL(blob);
        urlMap.current.set(memory.id, url);
        setBlobUrls((current) => ({ ...current, [memory.id]: url as string }));
      } catch (err) {
        if (scope === scopeVersion.current) setError(errorMessage(err));
        return;
      } finally {
        if (scope === scopeVersion.current) setLoadingAudioId('');
      }
    }
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${memory.title || 'voice-memory'}.${extensionFor(memory.mimeType)}`;
    anchor.click();
  };

  const extensionFor = (mime: string) => {
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
    if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
    if (mime.includes('wav') || mime.includes('wave')) return 'wav';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('webm')) return 'webm';
    return 'audio';
  };

  const remove = async (memory: VoiceMemory) => {
    if (!window.confirm(`Delete “${memory.title}”? This recording will be removed from this person’s record.`)) return;
    const scope = scopeVersion.current;
    setDeletingId(memory.id);
    setError('');
    setSuccess('');
    try {
      await voiceService.remove(memory.id, getToken);
      if (scope !== scopeVersion.current) return;
      visibleIds.current.delete(memory.id);
      const url = urlMap.current.get(memory.id);
      if (url) URL.revokeObjectURL(url);
      urlMap.current.delete(memory.id);
      setBlobUrls((current) => {
        const next = { ...current };
        delete next[memory.id];
        return next;
      });
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      setSuccess('Voice memory deleted.');
    } catch (err) {
      if (scope === scopeVersion.current) setError(errorMessage(err));
    } finally {
      if (scope === scopeVersion.current) setDeletingId('');
    }
  };

  const canUpload = !!selectedFile && !!title.trim() && decodedDuration !== null && decodedDuration <= MAX_SECONDS && selectedFile.size <= MAX_BYTES && !validating && !uploading;

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/50 p-3" aria-labelledby="voice-memories-title" data-testid="section-voice-memories">
      <h3 id="voice-memories-title" className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Mic2 size={14} className="text-brand-400" /> Voice memories</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">Short recordings are private to this family. Ask permission before uploading another person’s voice. No microphone recording or transcription.</p>

      {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-950/25 p-2.5 text-xs leading-5 text-rose-200" data-testid="status-voice-error"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {success && <p role="status" className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-950/20 p-2.5 text-xs text-emerald-200" data-testid="status-voice-success">{success}</p>}

      <form onSubmit={upload} className="mt-3 rounded-lg border border-slate-700/80 bg-slate-950/45 p-3" data-testid="form-voice-upload">
        <label htmlFor="voice-memory-title" className="block text-xs font-medium text-slate-300">Recording title</label>
        <input id="voice-memory-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" placeholder="A story in their own words" data-testid="input-voice-title" />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input ref={inputRef} type="file" accept=".mp3,.m4a,.wav,.ogg,.webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm" onChange={(event) => { void chooseFile(event.target.files?.[0]); }} className="min-w-0 flex-1 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-slate-700" data-testid="input-voice-file" />
          <button type="submit" disabled={!canUpload} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-upload-voice">{uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{uploading ? 'Saving…' : 'Save recording'}</button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">MP3, M4A, WAV, OGG, or WebM · up to 3 minutes · maximum 10 MB. Playback support depends on your browser; the server checks every upload.</p>
        {selectedFile && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400" data-testid="text-selected-voice-file"><span className="truncate font-medium text-slate-200">{selectedFile.name}</span><span>{formatBytes(selectedFile.size)}</span>{validating ? <span className="inline-flex items-center gap-1 text-sky-200"><Loader2 size={12} className="animate-spin" /> Checking audio…</span> : decodedDuration !== null && <span>{formatTime(decodedDuration)}</span>}</div>}
      </form>

      <div className="mt-4">
        {loading && memories.length === 0 ? <div className="space-y-2" aria-label="Loading voice memories"><div className="h-14 animate-pulse rounded-lg bg-slate-800/70" /><div className="h-14 animate-pulse rounded-lg bg-slate-800/70" /></div> : memories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 px-3 py-5 text-center" data-testid="empty-voice-memories"><Headphones size={18} className="mx-auto text-slate-500" /><p className="mt-2 text-xs text-slate-400">No voice memories saved for this person yet.</p></div>
        ) : (
          <ul className="space-y-2">{memories.map((memory) => (
            <li key={memory.id} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3" data-testid={`row-voice-memory-${memory.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-100">{memory.title}</p><p className="mt-1 text-[10px] text-slate-500">{formatTime(memory.duration)} · {formatBytes(memory.fileSize)} · {new Date(memory.createdAt).toLocaleDateString()}</p></div>
                <Volume2 size={15} className="mt-0.5 shrink-0 text-brand-400" aria-hidden="true" />
              </div>
              {blobUrls[memory.id] ? <audio controls preload="metadata" src={blobUrls[memory.id]} className="mt-3 w-full" aria-label={`Play ${memory.title}`} data-testid={`audio-player-${memory.id}`} /> : <button type="button" onClick={() => void loadAudio(memory)} disabled={loadingAudioId === memory.id} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50" data-testid={`button-load-audio-${memory.id}`}>{loadingAudioId === memory.id ? <Loader2 size={14} className="animate-spin" /> : <Headphones size={14} />}{loadingAudioId === memory.id ? 'Loading recording…' : 'Load audio player'}</button>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void download(memory)} disabled={loadingAudioId === memory.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50" data-testid={`button-download-voice-${memory.id}`}><Download size={13} /> Download</button>
                <button type="button" onClick={() => void remove(memory)} disabled={deletingId === memory.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-rose-950/40 hover:text-rose-200 disabled:opacity-50" data-testid={`button-delete-voice-${memory.id}`}>{deletingId === memory.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete</button>
              </div>
            </li>
          ))}</ul>
        )}
      </div>
    </section>
  );
};
