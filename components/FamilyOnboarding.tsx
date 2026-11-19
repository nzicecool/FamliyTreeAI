import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Compass, FolderHeart,
  KeyRound, LoaderCircle, Mail, Plus, RefreshCw, Search, ShieldCheck, Users, X,
} from 'lucide-react';
import { FamilyContext, PublicFamily } from '../familyTypes';
import { PublicBetaBadge } from './PublicBetaBadge';
import {
  captureInvitation, clearInvitationToken, familyService, pendingInvitationToken,
} from '../services/familyService';

interface FamilyOnboardingProps {
  context: FamilyContext;
  onChanged: () => Promise<void>;
  onSignOut: () => void;
  onCancel?: () => void;
}

type Panel = 'choose' | 'create' | 'join';

const panelButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-55';
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20';
const surface = 'rounded-2xl border border-slate-700/80 bg-slate-900/75 shadow-xl shadow-slate-950/20';

function explainError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function normalizedToken(value: string) {
  const text = value.trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return parsed.searchParams.get('invite') || text;
  } catch {
    return text.replace(/^invite=/i, '');
  }
}

export const FamilyOnboarding: React.FC<FamilyOnboardingProps> = ({
  context, onChanged, onSignOut, onCancel,
}) => {
  const hasPendingFamilyLink = typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem('familytree:familyLink'));
  const { getToken } = useAuth();
  const [panel, setPanel] = useState<Panel>(() => pendingInvitationToken() || context.invitations.length ? 'join' : 'choose');
  const [localContext, setLocalContext] = useState(context);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [description, setDescription] = useState('');
  const [discoverable, setDiscoverable] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<PublicFamily[]>([]);
  const [searching, setSearching] = useState(false);
  const [joinTarget, setJoinTarget] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [inviteInput, setInviteInput] = useState(() => pendingInvitationToken() || '');
  const [accepting, setAccepting] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => setLocalContext(context), [context]);
  useEffect(() => {
    captureInvitation();
    const token = pendingInvitationToken();
    if (token) setInviteInput(token);
  }, []);

  const refreshLocalContext = useCallback(async () => {
    const latest = await familyService.context(getToken);
    setLocalContext(latest);
  }, [getToken]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setPageError('');
    try {
      await refreshLocalContext();
    } catch (error) {
      setPageError(explainError(error));
    } finally {
      setRefreshing(false);
    }
  }, [refreshLocalContext]);

  useEffect(() => {
    if (!localContext.requests.some((request) => request.status === 'pending')) return;
    const timer = window.setInterval(() => {
      refreshLocalContext().catch(error => setPageError(explainError(error)));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [localContext.requests, refreshLocalContext]);

  useEffect(() => {
    if (panel !== 'join' || searchText.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let live = true;
    setResults([]);
    setSearching(true);
    const timer = window.setTimeout(() => {
      familyService.search(searchText.trim(), getToken)
        .then((response) => { if (live) setResults(response.families); })
        .catch((error) => { if (live) setPageError(explainError(error)); })
        .finally(() => { if (live) setSearching(false); });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [getToken, panel, searchText]);

  const completeMembershipChange = async () => {
    await onChanged();
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setPageError('');
    try {
      await familyService.create({
        name: familyName.trim(),
        description: description.trim(),
        discoverable,
      }, getToken);
      await completeMembershipChange();
    } catch (error) {
      setPageError(explainError(error));
    } finally {
      setLoading(false);
    }
  };

  const activate = async (id: string) => {
    setLoading(true);
    setPageError('');
    try {
      await familyService.activate(id, getToken);
      await completeMembershipChange();
    } catch (error) {
      setPageError(explainError(error));
    } finally {
      setLoading(false);
    }
  };

  const requestToJoin = async (family: PublicFamily) => {
    setLoading(true);
    setPageError('');
    setNotice('');
    try {
      await familyService.requestJoin(family.id, joinMessage.trim(), getToken);
      await refreshLocalContext();
      setJoinTarget('');
      setJoinMessage('');
      setNotice(`Request sent to ${family.name}. You’ll see its status here while you wait.`);
    } catch (error) {
      setPageError(explainError(error));
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async (input: { invitationId?: string; token?: string }, tokenToClear?: boolean) => {
    setAccepting(input.invitationId || 'token');
    setPageError('');
    try {
      await familyService.acceptInvite(input, getToken);
      if (tokenToClear || pendingInvitationToken()) {
        clearInvitationToken();
        setInviteInput('');
      }
      await completeMembershipChange();
    } catch (error) {
      setPageError(explainError(error));
    } finally {
      setAccepting('');
    }
  };

  const dismissToken = () => {
    clearInvitationToken();
    setInviteInput('');
  };

  const pendingRequests = localContext.requests.filter((request) => request.status === 'pending');
  const rejectedRequests = localContext.requests.filter((request) => request.status === 'rejected');

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
              <FolderHeart size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-300">FamilyTreeAI<PublicBetaBadge /></p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Your family spaces</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className={`${panelButton} border border-slate-700 text-slate-300 hover:bg-slate-800`}>
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            )}
            <button type="button" onClick={onSignOut} className={`${panelButton} border border-slate-700 text-slate-300 hover:bg-slate-800`}>
              Sign out
            </button>
          </div>
        </header>

        <div className="mb-8 overflow-hidden rounded-3xl border border-sky-300/15 bg-gradient-to-r from-sky-950/80 via-slate-900 to-slate-900 px-6 py-7 sm:px-9 sm:py-9">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-sky-200">
              <ShieldCheck size={17} aria-hidden="true" /> Private by default
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              History belongs to the people who lived it.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Create a shared family space, accept a personal invitation, or ask to join a family that chose to be discoverable. Tree access begins only after membership is approved.
            </p>
          </div>
        </div>

        {hasPendingFamilyLink && (
          <div role="status" className="mb-6 rounded-xl border border-sky-300/25 bg-sky-950/30 px-4 py-3 text-sm leading-6 text-sky-100" data-testid="notice-pending-family-link">
            Choose or create the family you want to connect first. After entering that family, open <strong>Family &amp; access</strong> to review and explicitly accept the private link. Nothing is accepted automatically.
          </div>
        )}

        {(pageError || notice) && (
          <div role={pageError ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${pageError ? 'border-rose-400/30 bg-rose-950/30 text-rose-200' : 'border-emerald-400/25 bg-emerald-950/25 text-emerald-200'}`}>
            <span>{pageError || notice}</span>
            <button type="button" onClick={() => { setPageError(''); setNotice(''); }} aria-label="Dismiss message" className="shrink-0 rounded p-1 hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        )}

        {localContext.families.length > 0 && (
          <section className={`${surface} mb-8 p-5 sm:p-7`} aria-labelledby="memberships-title">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="memberships-title" className="text-lg font-semibold text-white">Your memberships</h2>
                <p className="mt-1 text-sm text-slate-400">Choose a family space to continue.</p>
              </div>
              <button type="button" onClick={refresh} disabled={refreshing} className={`${panelButton} border border-slate-700 text-slate-300 hover:bg-slate-800`}>
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                Refresh
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {localContext.families.map((family) => {
                const active = localContext.activeFamilyId === family.id;
                return (
                  <article key={family.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/40 p-4" data-testid={`card-family-${family.id}`}>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-100">{family.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{family.description || 'A private family space.'}</p>
                      <span className="mt-2 inline-flex rounded-full bg-slate-800 px-2 py-1 text-[11px] font-medium capitalize text-slate-300">{family.role}</span>
                    </div>
                    <button type="button" disabled={loading} onClick={() => activate(family.id)} className={`${panelButton} shrink-0 bg-sky-500 text-slate-950 hover:bg-sky-400`}>
                      {active ? 'Continue' : 'Open'} <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {pendingRequests.length > 0 && (
          <section className={`${surface} mb-8 p-5 sm:p-7`} aria-labelledby="pending-title">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><Clock3 size={19} /></div>
              <div>
                <h2 id="pending-title" className="font-semibold text-white">Waiting for approval</h2>
                <p className="text-sm text-slate-400">We’ll check for updates while you’re here.</p>
              </div>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 px-4 py-3" data-testid={`status-request-${request.id}`}>
                  <span className="font-medium text-slate-200">{request.familyName}</span>
                  <span className="inline-flex items-center gap-2 text-xs text-amber-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> Pending review</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {rejectedRequests.length > 0 && (
          <section className="mb-8 rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5" aria-labelledby="rejected-title">
            <h2 id="rejected-title" className="font-semibold text-rose-100">Previous requests</h2>
            <ul className="mt-3 space-y-2">
              {rejectedRequests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300" data-testid={`status-rejected-${request.id}`}>
                  <span>{request.familyName}</span><span className="text-xs text-rose-200">Request not approved</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Find your people</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {panel === 'choose' ? 'Where should we begin?' : panel === 'create' ? 'Create a family space' : 'Join a family'}
            </h2>
          </div>
          {panel !== 'choose' && (
            <button type="button" onClick={() => { setPanel('choose'); setPageError(''); }} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-white">
              <ArrowLeft size={15} aria-hidden="true" /> All options
            </button>
          )}
        </div>

        {panel === 'choose' && (
          <div className="grid gap-4 md:grid-cols-2">
            <button type="button" onClick={() => setPanel('create')} className={`${surface} group flex min-h-48 flex-col items-start p-6 text-left transition hover:border-sky-400/50 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300`}>
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200"><Plus size={22} /></span>
              <span className="text-lg font-semibold text-white">Create a family</span>
              <span className="mt-2 max-w-sm text-sm leading-6 text-slate-400">Start a private archive and invite relatives when you’re ready.</span>
              <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-sky-200">Set up a family <ArrowRight size={15} /></span>
            </button>
            <button type="button" onClick={() => setPanel('join')} className={`${surface} group flex min-h-48 flex-col items-start p-6 text-left transition hover:border-sky-400/50 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300`}>
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-300/10 text-indigo-200"><Users size={21} /></span>
              <span className="text-lg font-semibold text-white">Join a family</span>
              <span className="mt-2 max-w-sm text-sm leading-6 text-slate-400">Accept a personal invitation or ask a discoverable family for approval.</span>
              <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-sky-200">Explore ways to join <ArrowRight size={15} /></span>
            </button>
          </div>
        )}

        {panel === 'create' && (
          <form onSubmit={submitCreate} className={`${surface} max-w-2xl p-5 sm:p-7`}>
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200"><FolderHeart size={20} /></div>
              <div>
                <h3 className="font-semibold text-white">Make a home for shared history</h3>
                <p className="mt-1 text-sm leading-5 text-slate-400">Only invited or approved members can enter this family space.</p>
              </div>
            </div>
            <label className="mb-4 block text-sm font-medium text-slate-300" htmlFor="family-name">Family name <span className="text-rose-300">*</span>
              <input id="family-name" data-testid="input-family-name" value={familyName} onChange={(event) => setFamilyName(event.target.value)} maxLength={100} required className={`${inputClass} mt-2`} placeholder="For example, the Park family" />
            </label>
            <label className="mb-5 block text-sm font-medium text-slate-300" htmlFor="family-description">A short description <span className="font-normal text-slate-500">(optional)</span>
              <textarea id="family-description" data-testid="input-family-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} className={`${inputClass} mt-2 resize-y`} placeholder="What makes this family’s story special?" />
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
              <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} className="mt-1 h-4 w-4 accent-sky-400" />
              <span>
                <span className="block text-sm font-semibold text-slate-200">Allow relatives to find this family</span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">Opt in to appearing in family search. Off by default; search never reveals private records.</span>
              </span>
            </label>
            <button type="submit" disabled={loading || !familyName.trim()} className={`${panelButton} mt-6 w-full bg-sky-500 text-slate-950 hover:bg-sky-400 sm:w-auto`}>
              {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
              {loading ? 'Creating…' : 'Create family'}
            </button>
          </form>
        )}

        {panel === 'join' && (
          <div className="space-y-5">
            {(inviteInput || localContext.invitations.length > 0) && (
              <section className={`${surface} p-5 sm:p-7`} aria-labelledby="invitations-title">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-200"><Mail size={19} /></div>
                  <div>
                    <h3 id="invitations-title" className="font-semibold text-white">Personal invitations</h3>
                    <p className="text-sm text-slate-400">Review the family, then accept to join.</p>
                  </div>
                </div>
                {localContext.invitations.map((invitation) => {
                  const expired = new Date(invitation.expiresAt).getTime() < Date.now();
                  return (
                    <div key={invitation.id} className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/40 p-4" data-testid={`invitation-${invitation.id}`}>
                      <div>
                        <p className="font-semibold text-slate-100">{invitation.familyName}</p>
                        <p className={`mt-1 text-xs ${expired ? 'text-rose-300' : 'text-slate-400'}`}>
                          {expired ? 'Invitation expired' : `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <button type="button" disabled={expired || accepting === invitation.id} onClick={() => acceptInvitation({ invitationId: invitation.id }, Boolean(inviteInput))} className={`${panelButton} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>
                        {accepting === invitation.id ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
                        Accept invitation
                      </button>
                    </div>
                  );
                })}
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const token = normalizedToken(inviteInput);
                  if (token) acceptInvitation({ token }, true);
                }} className="mt-4 border-t border-slate-700 pt-5">
                  <label htmlFor="invite-token" className="mb-2 block text-sm font-medium text-slate-300">Have an invitation link or code?</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <KeyRound aria-hidden="true" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input id="invite-token" data-testid="input-invite-token" value={inviteInput} onChange={(event) => setInviteInput(event.target.value)} className={`${inputClass} pl-10`} placeholder="Paste your invitation link or code" />
                    </div>
                    <button type="submit" disabled={!normalizedToken(inviteInput) || Boolean(accepting)} className={`${panelButton} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>
                      {accepting === 'token' ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} Accept
                    </button>
                  </div>
                  {pendingInvitationToken() && (
                    <button type="button" onClick={dismissToken} className="mt-3 text-xs text-slate-500 underline decoration-slate-600 underline-offset-4 hover:text-slate-300">
                      Dismiss saved invitation
                    </button>
                  )}
                </form>
              </section>
            )}

            <section className={`${surface} p-5 sm:p-7`} aria-labelledby="search-title">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-300/10 text-indigo-200"><Compass size={19} /></div>
                <div>
                  <h3 id="search-title" className="font-semibold text-white">Find an opted-in family</h3>
                  <p className="text-sm text-slate-400">Discoverable family names only—no tree or personal records.</p>
                </div>
              </div>
              <label htmlFor="family-search" className="sr-only">Search family names</label>
              <div className="relative">
                <Search aria-hidden="true" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input id="family-search" data-testid="input-family-search" value={searchText} onChange={(event) => { setSearchText(event.target.value); setPageError(''); }} className={`${inputClass} pl-11`} placeholder="Search by family name" />
              </div>
              {searching ? (
                <div className="mt-5 space-y-3" aria-label="Searching families">
                  {[1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-800/70" />)}
                </div>
              ) : searchText.trim().length >= 2 && (
                <div className="mt-4 space-y-2">
                  {results.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-slate-300">No discoverable families found</p>
                      <p className="mt-1 text-xs text-slate-500">Try another name, or ask a relative to send you an invitation.</p>
                    </div>
                  ) : results.map((family) => (
                    <article key={family.id} className="rounded-xl border border-slate-700 bg-slate-950/40 p-4" data-testid={`search-result-${family.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-100">{family.name}</h4>
                          <p className="mt-1 text-sm text-slate-400">{family.description || 'No description provided.'}</p>
                        </div>
                        {joinTarget === family.id ? (
                          <button type="button" onClick={() => setJoinTarget('')} aria-label={`Cancel request to join ${family.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={17} /></button>
                        ) : (
                          <button type="button" disabled={loading} onClick={() => setJoinTarget(family.id)} className={`${panelButton} border border-slate-600 text-slate-200 hover:bg-slate-800`}>
                            Request to join <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                      {joinTarget === family.id && (
                        <form onSubmit={(event) => { event.preventDefault(); requestToJoin(family); }} className="mt-4 border-t border-slate-700 pt-4">
                          <label htmlFor={`join-message-${family.id}`} className="mb-2 block text-xs font-medium text-slate-300">A note to the family <span className="text-slate-500">(optional)</span></label>
                          <textarea id={`join-message-${family.id}`} value={joinMessage} onChange={(event) => setJoinMessage(event.target.value)} maxLength={500} rows={2} className={`${inputClass} resize-y`} placeholder="Let them know how you’re connected." />
                          <button type="submit" disabled={loading} className={`${panelButton} mt-3 bg-sky-500 text-slate-950 hover:bg-sky-400`}>
                            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />} Send request
                          </button>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5 text-xs text-slate-500">
          <span>Tree access is granted only after invitation acceptance or family approval.</span>
          <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:text-slate-300 disabled:opacity-50">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh status
          </button>
        </footer>
      </div>
    </main>
  );
};
