import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle, Check, CheckCircle2, Clock3, Copy, Mail, RefreshCw, Shield,
  UserCheck, UserPlus, Users, X, XCircle,
} from 'lucide-react';
import { Family, FamilyDetails, FamilyInput } from '../familyTypes';
import { familyService } from '../services/familyService';
import { FamilyLinksSection } from './FamilyLinksSection';

interface FamilyManagerProps {
  family: Family;
  onChanged: () => Promise<void>;
  onBrowse: () => void;
}

const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50';
const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20';
const cardClass = 'rounded-2xl border border-slate-700/80 bg-slate-900/70 shadow-lg shadow-slate-950/15';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const isExpired = (date: string) => new Date(date).getTime() < Date.now();

export const FamilyManager: React.FC<FamilyManagerProps> = ({ family, onChanged, onBrowse }) => {
  const { getToken } = useAuth();
  const [details, setDetails] = useState<FamilyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [name, setName] = useState(family.name);
  const [description, setDescription] = useState(family.description);
  const [discoverable, setDiscoverable] = useState(family.discoverable);
  const [editing, setEditing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newInviteLink, setNewInviteLink] = useState('');
  const [inviteEmailState, setInviteEmailState] = useState<'sent' | 'not-sent' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (editing) return;
    setName(family.name);
    setDescription(family.description);
    setDiscoverable(family.discoverable);
  }, [family.name, family.description, family.discoverable, editing]);

  const loadDetails = useCallback(async (quiet = false) => {
    if (family.role !== 'owner') {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const response = await familyService.details(family.id, getToken);
      setDetails(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [family.id, family.role, getToken]);

  useEffect(() => {
    void loadDetails();
    const onFocus = () => { void loadDetails(true); };
    window.addEventListener('focus', onFocus);
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      if (ticks > 18) {
        window.clearInterval(timer);
        return;
      }
      void loadDetails(true);
    }, 10000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [loadDetails]);

  const refreshAll = async () => {
    await loadDetails();
  };

  const finishAction = async (message?: string) => {
    await onChanged();
    await loadDetails(true);
    if (message) setSuccess(message);
  };

  const saveFamily = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: FamilyInput = {
      name: name.trim(),
      description: description.trim(),
      discoverable,
    };
    setBusyAction('save');
    setError('');
    setSuccess('');
    try {
      await familyService.update(family.id, input, getToken);
      setEditing(false);
      await finishAction('Family details saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyAction('');
    }
  };

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction('invite');
    setError('');
    setSuccess('');
    setNewInviteLink('');
    setInviteEmailState(null);
    try {
      const result = await familyService.invite(family.id, inviteEmail.trim().toLowerCase(), getToken);
      const link = `${window.location.origin}/?invite=${encodeURIComponent(result.token)}`;
      setNewInviteLink(link);
      setInviteEmailState(result.emailSent ? 'sent' : 'not-sent');
      setInviteEmail('');
      await finishAction(result.emailSent ? 'Invitation created and email delivery confirmed.' : 'Invitation created, but email was not sent. Share the link directly.');
      if (!result.emailSent && result.emailError) setError(`Invitation is ready to share, but email was not sent: ${result.emailError}`);
      else if (!result.emailSent) setError('Invitation is ready to share, but the email was not sent. Copy the link below and send it directly.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyAction('');
    }
  };

  const copyInviteLink = async () => {
    if (!newInviteLink) return;
    try {
      await navigator.clipboard.writeText(newInviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Clipboard access is unavailable. Select and copy the invitation link from the field.');
    }
  };

  const revokeInvite = async (invitationId: string) => {
    if (!window.confirm('Revoke this pending invitation? Its link will stop working.')) return;
    setBusyAction(`revoke-${invitationId}`);
    setError('');
    setSuccess('');
    try {
      await familyService.revokeInvite(family.id, invitationId, getToken);
      await finishAction('Invitation revoked.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyAction('');
    }
  };

  const decide = async (requestId: string, decision: 'approve' | 'reject') => {
    setBusyAction(`request-${requestId}`);
    setError('');
    setSuccess('');
    try {
      await familyService.decideRequest(family.id, requestId, decision, getToken);
      await finishAction(decision === 'approve' ? 'Membership request approved.' : 'Membership request rejected.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyAction('');
    }
  };

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-300">Family space</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{family.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {family.description || 'A private place to preserve the history you share.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium capitalize text-slate-300">
              <Shield size={14} className="text-sky-300" aria-hidden="true" /> {family.role}
            </span>
            <button type="button" onClick={onBrowse} className={`${buttonClass} border border-slate-700 text-slate-200 hover:bg-slate-800`}>
              <Users size={16} aria-hidden="true" /> Browse families
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss error" className="rounded p-1 hover:bg-white/10"><X size={16} /></button>
          </div>
        )}
        {success && (
          <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200">
            <span className="flex items-center gap-2"><CheckCircle2 size={17} />{success}</span>
            <button type="button" onClick={() => setSuccess('')} aria-label="Dismiss confirmation" className="rounded p-1 hover:bg-white/10"><X size={16} /></button>
          </div>
        )}

        <section className={`${cardClass} mb-6 p-5 sm:p-7`} aria-labelledby="privacy-title">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-300/10 text-sky-200"><Shield size={20} /></div>
              <div>
                <h2 id="privacy-title" className="font-semibold text-white">Privacy is the default</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                  Family members can access this space. Discoverability only lets relatives find its name and request approval; it never opens family records.
                </p>
              </div>
            </div>
            <div className="min-w-48 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Search visibility</p>
              <p className={`mt-1 text-sm font-semibold ${family.discoverable ? 'text-emerald-200' : 'text-slate-200'}`}>
                {family.discoverable ? 'Discoverable' : 'Private'}
              </p>
            </div>
          </div>
        </section>

        <FamilyLinksSection family={family} />

        {family.role === 'owner' && (
          <section className={`${cardClass} mb-6 p-5 sm:p-7`} aria-labelledby="family-settings-title">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="family-settings-title" className="text-lg font-semibold text-white">Family details</h2>
                <p className="mt-1 text-sm text-slate-400">You can change the family’s name, description, and search visibility.</p>
              </div>
              {!editing && (
                <button type="button" onClick={() => setEditing(true)} className={`${buttonClass} border border-slate-600 text-slate-200 hover:bg-slate-800`}>
                  Edit details
                </button>
              )}
            </div>
            {editing ? (
              <form onSubmit={saveFamily} className="space-y-4">
                <label htmlFor="manager-family-name" className="block text-sm font-medium text-slate-300">Family name
                  <input id="manager-family-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className={`${fieldClass} mt-2`} />
                </label>
                <label htmlFor="manager-family-description" className="block text-sm font-medium text-slate-300">Description
                  <textarea id="manager-family-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} className={`${fieldClass} mt-2 resize-y`} />
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                  <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} className="mt-1 h-4 w-4 accent-sky-400" />
                  <span><span className="block text-sm font-semibold text-slate-200">Show this family in search</span><span className="mt-1 block text-xs leading-5 text-slate-400">People can find the name and request membership. Approval is always required.</span></span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busyAction === 'save' || !name.trim()} className={`${buttonClass} bg-sky-500 text-slate-950 hover:bg-sky-400`}>
                    {busyAction === 'save' ? 'Saving…' : 'Save details'}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setName(family.name); setDescription(family.description); setDiscoverable(family.discoverable); }} className={`${buttonClass} border border-slate-700 text-slate-300 hover:bg-slate-800`}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2">
                <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Family name</p><p className="mt-1 text-sm text-slate-100">{family.name}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</p><p className="mt-1 text-sm text-slate-300">{family.description || 'No description added.'}</p></div>
              </div>
            )}
          </section>
        )}

        {family.role === 'owner' && (
          <section className={`${cardClass} mb-6 p-5 sm:p-7`} aria-labelledby="invite-title">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-300/10 text-indigo-200"><UserPlus size={19} /></div>
              <div><h2 id="invite-title" className="font-semibold text-white">Invite a relative</h2><p className="text-sm text-slate-400">An invite grants access only after they accept.</p></div>
            </div>
            <form onSubmit={sendInvite} className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="invite-email" className="sr-only">Relative’s email address</label>
              <input id="invite-email" type="email" autoComplete="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className={`${fieldClass} min-w-0 flex-1`} placeholder="relative@example.com" />
              <button type="submit" disabled={busyAction === 'invite'} className={`${buttonClass} bg-sky-500 text-slate-950 hover:bg-sky-400`}>
                {busyAction === 'invite' ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />} Create invitation
              </button>
            </form>
            {newInviteLink && (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div className={`mb-3 flex items-start gap-2 text-sm ${inviteEmailState === 'sent' ? 'text-emerald-200' : 'text-amber-200'}`}>
                  {inviteEmailState === 'sent' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                  <span>{inviteEmailState === 'sent'
                    ? 'Email delivery was confirmed. You can also copy and share this invitation link.'
                    : 'Email was not sent. Share this invitation link directly with your relative.'}</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="created-invite-link" className="sr-only">Invitation link</label>
                  <input id="created-invite-link" readOnly value={newInviteLink} onFocus={(event) => event.currentTarget.select()} className={`${fieldClass} min-w-0 flex-1 font-mono text-xs`} />
                  <button type="button" onClick={copyInviteLink} className={`${buttonClass} border border-slate-600 text-slate-200 hover:bg-slate-800`}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {family.role === 'owner' && <section className={`${cardClass} mb-6 overflow-hidden`} aria-labelledby="members-title">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4 sm:px-7">
            <div><h2 id="members-title" className="font-semibold text-white">Family members</h2><p className="mt-1 text-xs text-slate-500">Only approved members can browse the family tree.</p></div>
            <button type="button" onClick={refreshAll} disabled={loading} aria-label="Refresh family information" className="rounded-lg border border-slate-700 p-2.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          </div>
          {loading && !details ? (
            <div className="space-y-3 p-5 sm:p-7" aria-label="Loading family details">
              {[1, 2, 3].map((row) => <div key={row} className="h-14 animate-pulse rounded-xl bg-slate-800/70" />)}
            </div>
          ) : error && !details ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto text-rose-300" size={24} />
              <p className="mt-3 text-sm text-slate-300">Couldn’t load family details.</p>
              <button type="button" onClick={() => loadDetails()} className={`${buttonClass} mt-4 border border-slate-600 text-slate-200 hover:bg-slate-800`}>Try again</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {(details?.members || []).map((member) => (
                <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7" data-testid={`member-${member.userId}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-sky-100">
                      {(member.name.trim()[0] || member.email[0] || '?').toUpperCase()}
                    </div>
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-100">{member.name || 'Family member'}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">{member.role}</span>
                </div>
              ))}
              {details?.members.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400 sm:px-7">No members to show yet.</p>}
            </div>
          )}
        </section>}

        {family.role === 'owner' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className={`${cardClass} overflow-hidden`} aria-labelledby="requests-title">
              <div className="border-b border-slate-800 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-2"><UserCheck size={17} className="text-sky-200" /><h2 id="requests-title" className="font-semibold text-white">Join requests</h2></div>
                <p className="mt-1 text-xs text-slate-500">Review each request before granting access.</p>
              </div>
              <div className="divide-y divide-slate-800">
                {(details?.requests || []).filter((request) => request.status === 'pending').map((request) => (
                  <div key={request.id} className="p-4 sm:p-5" data-testid={`join-request-${request.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="font-medium text-slate-100">{request.name || 'Relative'}</p><p className="truncate text-xs text-slate-500">{request.email}</p></div>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-200"><Clock3 size={13} /> Pending</span>
                    </div>
                    {request.message && <p className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-sm leading-5 text-slate-300">{request.message}</p>}
                    <div className="mt-4 flex gap-2">
                      <button type="button" disabled={busyAction === `request-${request.id}`} onClick={() => decide(request.id, 'approve')} className={`${buttonClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}><Check size={15} /> Approve</button>
                      <button type="button" disabled={busyAction === `request-${request.id}`} onClick={() => decide(request.id, 'reject')} className={`${buttonClass} border border-slate-700 text-slate-300 hover:border-rose-400/50 hover:text-rose-200`}><XCircle size={15} /> Reject</button>
                    </div>
                  </div>
                ))}
                {(details?.requests || []).filter((request) => request.status === 'pending').length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No requests waiting for review.</p>
                )}
              </div>
            </section>

            <section className={`${cardClass} overflow-hidden`} aria-labelledby="sent-invites-title">
              <div className="border-b border-slate-800 px-5 py-4 sm:px-6">
                <h2 id="sent-invites-title" className="font-semibold text-white">Invitations</h2>
                <p className="mt-1 text-xs text-slate-500">Invitation links expire; revoke one any time before acceptance.</p>
              </div>
              <div className="divide-y divide-slate-800">
                {(details?.invitations || []).map((invite) => {
                  const expired = isExpired(invite.expiresAt);
                  return (
                    <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5" data-testid={`sent-invite-${invite.id}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{invite.email}</p>
                        <p className={`mt-1 text-xs ${invite.status === 'pending' && expired ? 'text-rose-300' : 'text-slate-500'}`}>
                          {invite.status === 'pending' && expired ? `Expired ${new Date(invite.expiresAt).toLocaleDateString()}` : `${invite.status[0].toUpperCase()}${invite.status.slice(1)} · expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${invite.status === 'accepted' ? 'bg-emerald-400/10 text-emerald-200' : invite.status === 'revoked' || expired ? 'bg-slate-800 text-slate-400' : 'bg-amber-300/10 text-amber-200'}`}>
                          {invite.status === 'pending' && expired ? 'expired' : invite.status}
                        </span>
                        {invite.status === 'pending' && !expired && (
                          <button type="button" disabled={busyAction === `revoke-${invite.id}`} onClick={() => revokeInvite(invite.id)} aria-label={`Revoke invitation for ${invite.email}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-950/40 hover:text-rose-200 disabled:opacity-50"><X size={16} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(details?.invitations || []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No invitations created yet.</p>}
              </div>
            </section>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5 text-xs text-slate-500">
          <span>Family membership and tree access are controlled by the family’s owner.</span>
          <button type="button" onClick={onBrowse} className="rounded-lg px-2 py-1 text-sky-200 hover:bg-slate-900">Browse, join, or create another family</button>
        </div>
      </div>
    </main>
  );
};
