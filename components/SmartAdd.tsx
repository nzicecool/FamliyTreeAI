import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { parseSmartEntry } from '../services/geminiService';
import { Person } from '../types';

interface SmartAddProps {
  onParsed: (person: Partial<Person>) => void;
}

export const SmartAdd: React.FC<SmartAddProps> = ({ onParsed }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleProcess = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    
    try {
      const result = await parseSmartEntry(input);
      if (result) {
        onParsed(result);
        setInput('');
      } else {
        setError('Could not extract data. Please try being more specific.');
      }
    } catch (e) {
      setError('AI Service unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
      <div className="flex items-center gap-2 mb-4 text-brand-500">
        <Sparkles size={20} />
        <h2 className="font-semibold text-white">AI Record Extraction</h2>
      </div>
      
      <p className="text-sm text-slate-400 mb-4">
        Paste an obituary, a biography snippet, or simply type a sentence like 
        "Great grandfather John Doe was born in Chicago in 1920."
      </p>

      <textarea
        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none min-h-[120px]"
        placeholder="e.g. My aunt Sarah Smith was born on July 4th 1980. She was a teacher..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button
          disabled={loading || !input.trim()}
          onClick={handleProcess}
          className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          Process with AI
        </button>
      </div>
    </div>
  );
};