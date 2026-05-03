import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  settingsService,
  AISettings,
  ProviderId,
  BYOProvider,
} from '../services/settingsService';
import { Settings as SettingsIcon, Key, Check, Loader2, AlertTriangle, Trash2, Save, Eye, EyeOff } from 'lucide-react';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  glm: 'Zhipu GLM',
  kimi: 'Moonshot Kimi',
};

const PROVIDER_HINTS: Record<BYOProvider, { label: string; placeholder: string; help: string }> = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-…',
    help: 'Get a key at platform.openai.com/api-keys. Uses gpt-4o-mini.',
  },
  anthropic: {
    label: 'Anthropic Claude',
    placeholder: 'sk-ant-…',
    help: 'Get a key at console.anthropic.com. Uses claude-3-5-haiku-latest.',
  },
  glm: {
    label: 'Zhipu GLM',
    placeholder: 'Bearer token',
    help: 'Get a key at open.bigmodel.cn. Uses glm-4-flash.',
  },
  kimi: {
    label: 'Moonshot Kimi',
    placeholder: 'sk-…',
    help: 'Get a key at platform.moonshot.cn. Uses moonshot-v1-8k.',
  },
};

const BYO_PROVIDERS: BYOProvider[] = ['openai', 'anthropic', 'glm', 'kimi'];

export const SettingsView: React.FC = () => {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // which row is saving
  const [keyInputs, setKeyInputs] = useState<Record<BYOProvider, string>>({
    openai: '',
    anthropic: '',
    glm: '',
    kimi: '',
  });
  const [reveal, setReveal] = useState<Record<BYOProvider, boolean>>({
    openai: false,
    anthropic: false,
    glm: false,
    kimi: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await settingsService.load(getToken);
        if (!cancelled) setSettings(s);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const handleProviderChange = async (provider: ProviderId) => {
    setError(null);
    setSaving('provider');
    try {
      const next = await settingsService.setProvider(provider, getToken);
      setSettings(next);
    } catch (e: any) {
      setError(e?.message || 'Could not change provider.');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveKey = async (provider: BYOProvider) => {
    const key = keyInputs[provider].trim();
    if (!key) return;
    setError(null);
    setSaving(provider);
    try {
      const next = await settingsService.setKey(provider, key, getToken);
      setSettings(next);
      setKeyInputs(prev => ({ ...prev, [provider]: '' }));
    } catch (e: any) {
      setError(e?.message || 'Could not save key.');
    } finally {
      setSaving(null);
    }
  };

  const handleClearKey = async (provider: BYOProvider) => {
    setError(null);
    setSaving(provider);
    try {
      const next = await settingsService.clearKey(provider, getToken);
      setSettings(next);
    } catch (e: any) {
      setError(e?.message || 'Could not clear key.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        Failed to load settings.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12 space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon size={18} className="text-brand-400" />
          <h3 className="text-lg font-semibold text-white">AI Provider</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Choose which AI service powers the bio writer, smart import, and family narrative.
          Use the built-in Gemini option for the fastest start, or bring your own API key from any of the other providers below.
        </p>

        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-900 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        )}

        <div className="space-y-2">
          {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map(p => {
            const isBYO = p !== 'gemini';
            const configured = isBYO
              ? settings.configured[p as BYOProvider]
              : settings.hasGeminiServerKey;
            const selected = settings.provider === p;
            const usable = !isBYO ? settings.hasGeminiServerKey : configured;

            return (
              <label
                key={p}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  selected
                    ? 'border-brand-600 bg-brand-900/20'
                    : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="provider"
                    checked={selected}
                    onChange={() => handleProviderChange(p)}
                    disabled={saving === 'provider'}
                    className="accent-brand-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-white">{PROVIDER_LABELS[p]}</div>
                    <div className="text-xs text-slate-500">
                      {p === 'gemini'
                        ? 'Built-in (no key needed from you)'
                        : 'Requires your own API key (added below)'}
                    </div>
                  </div>
                </div>
                {usable ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check size={14} />
                    Ready
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Not configured</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Key size={18} className="text-brand-400" />
          <h3 className="text-lg font-semibold text-white">Your API Keys</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Keys are stored on the server and never sent back to your browser. They are used only when you select that provider above.
        </p>

        <div className="space-y-4">
          {BYO_PROVIDERS.map(provider => {
            const hint = PROVIDER_HINTS[provider];
            const configured = settings.configured[provider];
            const showReveal = reveal[provider];
            const inputValue = keyInputs[provider];
            const isSaving = saving === provider;

            return (
              <div key={provider} className="border border-slate-800 rounded-lg p-4 bg-slate-800/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{hint.label}</span>
                    {configured && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check size={12} />
                        Saved
                      </span>
                    )}
                  </div>
                  {configured && (
                    <button
                      type="button"
                      onClick={() => handleClearKey(provider)}
                      disabled={isSaving}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      Remove key
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">{hint.help}</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showReveal ? 'text' : 'password'}
                      value={inputValue}
                      onChange={e => setKeyInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                      placeholder={configured ? 'Enter a new key to replace…' : hint.placeholder}
                      autoComplete="off"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-9 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal(prev => ({ ...prev, [provider]: !prev[provider] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 p-0.5"
                      title={showReveal ? 'Hide' : 'Show'}
                      aria-label={showReveal ? 'Hide key' : 'Show key'}
                    >
                      {showReveal ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveKey(provider)}
                    disabled={!inputValue.trim() || isSaving}
                    className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
