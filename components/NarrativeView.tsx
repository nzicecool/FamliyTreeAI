import React, { useEffect, useMemo, useState } from 'react';
import { TreeData, Person } from '../types';
import { generateFamilyNarrative } from '../services/geminiService';
import { BookOpen, Sparkles, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';

interface NarrativeViewProps {
  data: TreeData;
}

export const NarrativeView: React.FC<NarrativeViewProps> = ({ data }) => {
  const peopleList = useMemo(
    () =>
      (Object.values(data.people) as Person[]).sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
      ),
    [data.people],
  );

  const [focusId, setFocusId] = useState<string>(data.rootId || peopleList[0]?.id || '');

  // Keep focusId valid when the underlying tree changes (root change, deletion, reload).
  React.useEffect(() => {
    if (focusId && data.people[focusId]) return;
    setFocusId(data.rootId && data.people[data.rootId] ? data.rootId : peopleList[0]?.id || '');
  }, [data.people, data.rootId, focusId, peopleList]);
  const [narrative, setNarrative] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setNarrative('');
    try {
      const text = await generateFamilyNarrative(data, focusId || null);
      setNarrative(text);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!narrative) return;
    try {
      await navigator.clipboard.writeText(narrative);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const paragraphs = narrative.split(/\n\s*\n/).filter(Boolean);

  return (
    <div className="h-full max-w-3xl mx-auto flex flex-col gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={18} className="text-brand-400" />
          <h3 className="text-lg font-semibold text-white">AI Family Narrative</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Generate a flowing written history of your family centered on the person you choose. The AI uses only the
          records you've entered.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="narrative-focus" className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
              Focus person
            </label>
            <select
              id="narrative-focus"
              value={focusId}
              onChange={e => setFocusId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {peopleList.length === 0 && <option value="">No people yet</option>}
              {peopleList.map(p => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                  {p.birthDate ? ` · ${p.birthDate.split('-')[0]}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !focusId}
            className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Writing…' : narrative ? 'Regenerate' : 'Generate narrative'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-red-300 font-medium text-sm">Couldn't generate narrative</div>
            <div className="text-red-400/80 text-xs mt-1">{error}</div>
          </div>
        </div>
      )}

      {(narrative || loading) && (
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-xl p-6 overflow-y-auto relative">
          {narrative && (
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
              title="Copy narrative"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {loading && !narrative && (
            <div className="flex items-center gap-3 text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              <span>Composing your family's story…</span>
            </div>
          )}
          {paragraphs.map((p, i) => (
            <p key={i} className="text-slate-200 leading-relaxed mb-4 last:mb-0 whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
