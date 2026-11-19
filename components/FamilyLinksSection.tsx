import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle, Check, CheckCircle2, Copy, Link2, Loader2, RefreshCw, ShieldCheck, Unlink, X,
} from 'lucide-react';
import type { ConnectionInput, ConnectionKind, ConnectionsResponse, LinkedFamily, PersonConnection, SharedPerson } from '../connectionTypes';
import type { Family, PublicFamily } from '../familyTypes';
import { connectionService } from '../services/connectionService';
import { familyService } from '../services/familyService';

interface FamilyLinksSectionProps {
  family: Family;
}

const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50';
const field = 'w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20';
const panel = 'rounded-xl border border-slate-700/80 bg-slate-950/45 p-4';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const personName = (person: SharedPerson | null) => person?.displayName || 'Details not shared';
const pendingFamilyLinkToken = () => window.sessionStorage.getItem('familytree:familyLink');
const clearFamilyLinkToken = () => {
  window.sessionStorage.removeItem('familytree:familyLink');
  window.dispatchEvent(new Event('familytree:family-link-cleared'));
};

function statusOf(connection: PersonConnection) {
  if (connection.approvedByYou && connection.approvedByOther) return { label: 'Approved by both families', tone: 'text-emerald-200 bg-emerald-400/10' };
  if (connection.approvedByYou) return { label: 'Awaiting the other owner', tone: 'text-amber-200 bg-amber-300/10' };
  if (connection.approvedByOther) return { label: 'Awaiting your approval', tone: 'text-amber-200 bg-amber-300/10' };
  return { label: 'Needs owner review', tone: 'text-sky-200 bg-sky-300/10' };
}

export const FamilyLinksSection: React.FC<FamilyLinksSectionProps> = ({ family }) => {
  const { getToken } = useAuth();
  const [response, setResponse] = useState<ConnectionsResponse | null>(null);
  const [people, setPeople] = useState<SharedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [families, setFamilies] = useState<PublicFamily[]>([]);
  const [targetFamilyId, setTargetFamilyId] = useState('');
  const [localPersonId, setLocalPersonId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [deathYear, setDeathYear] = useState('');
  const [kind, setKind] = useState<ConnectionKind>('same_person');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingVersion, setEditingVersion] = useState<number | undefined>();
  const [activeLinkId, setActiveLinkId] = useState('');
  const loadVersion = useRef(0);

  useEffect(() => {
    const stored = pendingFamilyLinkToken();
    if (stored) setPendingToken(stored);
  }, []);

  const load = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const [list, ownPeople] = await Promise.all([
        connectionService.list(getToken),
        family.role === 'owner' ? connectionService.people(getToken) : Promise.resolve({ people: [] }),
      ]);
      if (version !== loadVersion.current) return;
      setResponse(list);
      setPeople(ownPeople.people || []);
    } catch (err) {
      if (version !== loadVersion.current) return;
      setError(errorText(err));
    } finally {
      if (version === loadVersion.current && !quiet) setLoading(false);
    }
  }, [family.id, getToken]);

  useEffect(() => {
    setResponse(null);
    setPeople([]);
    setLoading(true);
    loadVersion.current += 1;
    void load();
    const onFocus = () => { void load(true); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      void load(true);
    }, 15000);
    return () => {
      loadVersion.current += 1;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [family.id, load]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setFamilies([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await familyService.search(query, getToken);
        if (!cancelled) setFamilies(result.families.filter((item) => item.id !== family.id));
      } catch {
        if (!cancelled) setFamilies([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, family.id, getToken]);

  const links = useMemo(() => response?.links || [], [response]);
  const owner = response?.owner ?? false;

  const resetForm = () => {
    setEditingId('');
    setEditingVersion(undefined);
    setActiveLinkId('');
    setLocalPersonId('');
    setDisplayName('');
    setBirthYear('');
    setDeathYear('');
    setKind('same_person');
    setDescription('');
  };

  const acceptLink = async (event: React.FormEvent) => {
    event.preventDefault();
    let token = pendingToken.trim();
    const inlineToken = token.match(/(?:\?|&)familyLink=([^&#]+)/i)?.[1];
    if (inlineToken) {
      try { token = decodeURIComponent(inlineToken); } catch { token = inlineToken; }
    }
    try {
      const parsed = new URL(token);
      const fromLink = parsed.searchParams.get('familyLink');
      if (fromLink) token = fromLink;
      else if (/^https?:\/\//i.test(pendingToken.trim())) throw new Error('This link does not contain a family-link invitation.');
    } catch (err) {
      if (err instanceof Error && err.message === 'This link does not contain a family-link invitation.') {
        setError(err.message);
        return;
      }
    }
    if (!token) return;
    setBusy('accept');
    setError('');
    setSuccess('');
    try {
      await connectionService.accept(token, getToken);
      clearFamilyLinkToken();
      setPendingToken('');
      setSuccess('Family link accepted. No family membership or private records were shared.');
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const createLink = async () => {
    setBusy('invite');
    setError('');
    setSuccess('');
    try {
      const result = await connectionService.invite(targetFamilyId || undefined, getToken);
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('familyLink', result.token);
      setInviteUrl(url.toString());
      setTargetFamilyId('');
      setSearch('');
      setSuccess(`Private link invitation created. It expires ${new Date(result.expiresAt).toLocaleDateString()}.`);
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access is unavailable. Select and copy the invitation URL.');
    }
  };

  const beginConnection = (link: LinkedFamily, connection?: PersonConnection) => {
    setActiveLinkId(link.id);
    setEditingId(connection?.id || '');
    setEditingVersion(connection?.version);
    setLocalPersonId(connection?.local?.personId || '');
    setDisplayName(connection?.local?.displayName || '');
    setBirthYear(connection?.local?.birthYear || '');
    setDeathYear(connection?.local?.deathYear || '');
    setKind(connection?.kind || 'same_person');
    setDescription(connection?.description || '');
    setError('');
    setSuccess('');
  };

  const submitConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    const chosen = people.find((person) => person.personId === localPersonId);
    if (!chosen || !displayName.trim()) {
      setError('Choose a person and enter the exact name you want the other family to see.');
      return;
    }
    const input: ConnectionInput = {
      personId: chosen.personId,
      displayName: displayName.trim(),
      ...(birthYear.trim() ? { birthYear: birthYear.trim() } : {}),
      ...(deathYear.trim() ? { deathYear: deathYear.trim() } : {}),
      kind,
      description: description.trim(),
      ...(editingId ? { version: editingVersion } : {}),
    };
    setBusy('connection');
    setError('');
    setSuccess('');
    try {
      if (editingId) await connectionService.update(editingId, input, getToken);
      else await connectionService.add(activeLinkId, input, getToken);
      setSuccess('Connection details saved. Both owners must approve the current version.');
      resetForm();
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const runConnectionAction = async (id: string, action: 'approve' | 'remove') => {
    const connection = links.flatMap((link) => link.connections).find((item) => item.id === id);
    if (!connection) return;
    if (action === 'remove' && !window.confirm('Remove this person connection? The other family will no longer see its shared details.')) return;
    setBusy(`${action}-${id}`);
    setError('');
    setSuccess('');
    try {
      if (action === 'approve') await connectionService.approve(id, connection.version, getToken);
      else await connectionService.remove(id, getToken);
      setSuccess(action === 'approve' ? `Your approval for version ${connection.version} was saved. The current approval status is shown below.` : 'Person connection removed.');
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const disconnect = async (link: LinkedFamily) => {
    if (!window.confirm(`Disconnect ${link.otherFamily.name}? All shared connection cards will be hidden for both families.`)) return;
    setBusy(`disconnect-${link.id}`);
    setError('');
    setSuccess('');
    try {
      await connectionService.disconnect(link.id, getToken);
      setSuccess(`${link.otherFamily.name} disconnected.`);
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const cancelInvite = async (id: string) => {
    if (!window.confirm('Cancel this family-link invitation? Its token will stop working.')) return;
    setBusy(`cancel-${id}`);
    setError('');
    try {
      await connectionService.cancelInvite(id, getToken);
      setSuccess('Invitation cancelled.');
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const inviteError = error && !response;

  return (
    <section className="mb-6 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/15 sm:p-7" aria-labelledby="family-links-heading" data-testid="section-family-links">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-300/10 text-sky-200"><Link2 size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="family-links-heading" className="font-semibold text-white">Linked families</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">A deliberate, owner-approved bridge for a few details only. Linking never grants membership or access to private family records.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={`${button} border border-slate-700 text-slate-300 hover:bg-slate-800`} data-testid="button-refresh-family-links">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-200" data-testid="status-family-link-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')} className="ml-auto"><X size={15} /></button></div>}
      {success && <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-950/25 p-3 text-sm text-emerald-200" data-testid="status-family-link-success"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{success}</p>}

      {pendingToken && (
        <form onSubmit={acceptLink} className={`${panel} mb-4 border-sky-400/30`} data-testid="form-accept-family-link">
          <h3 className="text-sm font-semibold text-white">Accept a private family link</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">You are in <strong className="text-slate-200">{family.name}</strong>. Review the invitation and accept only when this is the family you intend to connect. This will not add members or share private records.</p>
          <label htmlFor="pending-family-link-token" className="mt-3 block text-xs font-medium text-slate-300">Invitation token or link</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input id="pending-family-link-token" value={pendingToken} onChange={(event) => setPendingToken(event.target.value)} className={`${field} min-w-0 font-mono text-xs`} autoComplete="off" data-testid="input-pending-family-link-token" />
            {owner ? <button type="submit" disabled={busy === 'accept' || !pendingToken.trim()} className={`${button} bg-sky-400 text-slate-950 hover:bg-sky-300`} data-testid="button-accept-family-link">{busy === 'accept' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept link</button> : <p className="self-center text-xs text-amber-200">Only this family’s owner can accept a link.</p>}
            <button type="button" onClick={() => { setPendingToken(''); clearFamilyLinkToken(); }} className={`${button} border border-slate-700 text-slate-300 hover:bg-slate-800`} data-testid="button-dismiss-family-link">Dismiss</button>
          </div>
        </form>
      )}

      {loading && !response ? (
        <div className="space-y-3" aria-label="Loading linked families"><div className="h-16 animate-pulse rounded-xl bg-slate-800/70" /><div className="h-16 animate-pulse rounded-xl bg-slate-800/70" /></div>
      ) : inviteError ? (
        <div className="py-5 text-center"><p className="text-sm text-slate-300">Linked families could not be loaded.</p><button type="button" onClick={() => void load()} className={`${button} mt-3 border border-slate-700 text-slate-200 hover:bg-slate-800`}>Try again</button></div>
      ) : (
        <>
          {owner && (
            <div className={`${panel} mb-4`}>
              <h3 className="text-sm font-semibold text-white">Create a private link invitation</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">Search discovers family names only. You can also invite without choosing a target family; the recipient selects their own family before accepting.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="relative">
                  <label className="sr-only" htmlFor="search-link-family">Find a discoverable family</label>
                  <input id="search-link-family" value={search} onChange={(event) => { setSearch(event.target.value); setTargetFamilyId(''); }} className={field} placeholder="Find a family by name (optional)" autoComplete="off" data-testid="input-search-link-family" />
                  {families.length > 0 && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">{families.map((item) => <li key={item.id}><button type="button" onClick={() => { setTargetFamilyId(item.id); setSearch(item.name); setFamilies([]); }} className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800" data-testid={`option-link-family-${item.id}`}>{item.name}</button></li>)}</ul>}
                </div>
                <button type="button" disabled={busy === 'invite'} onClick={() => void createLink()} className={`${button} bg-sky-400 text-slate-950 hover:bg-sky-300`} data-testid="button-create-family-link">{busy === 'invite' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Create invitation</button>
              </div>
              {inviteUrl && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="created-family-link-url">Private family link URL</label><input id="created-family-link-url" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className={`${field} min-w-0 font-mono text-xs`} data-testid="input-created-family-link-url" /><button type="button" onClick={() => void copyLink()} className={`${button} border border-slate-600 text-slate-200 hover:bg-slate-800`} data-testid="button-copy-family-link"><Copy size={14} />{copied ? 'Copied' : 'Copy URL'}</button></div>}
            </div>
          )}

          {owner && response?.invitations?.length ? (
            <div className={`${panel} mb-4`}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Open invitations</h3>
              <ul className="divide-y divide-slate-800">{response.invitations.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`row-family-link-invitation-${invitation.id}`}>
                <div><p className="text-sm text-slate-200">{invitation.targetName || 'Any family'}</p><p className="mt-0.5 text-xs text-slate-500">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div>
                <button type="button" disabled={busy === `cancel-${invitation.id}`} onClick={() => void cancelInvite(invitation.id)} className={`${button} border border-slate-700 text-slate-300 hover:border-rose-400/50 hover:text-rose-200`} data-testid={`button-cancel-family-link-invitation-${invitation.id}`}>{busy === `cancel-${invitation.id}` ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Cancel invitation</button>
              </li>)}</ul>
            </div>
          ) : null}

          <div className="space-y-3">
            {links.map((link) => (
              <article key={link.id} className={panel} data-testid={`card-linked-family-${link.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-semibold text-white">{link.otherFamily.name}</h3><p className="mt-1 text-xs text-slate-500">Only explicitly approved person details appear here. Neither family’s tree, documents, memberships, or voice recordings are shared.</p></div>
                  <div className="flex flex-wrap gap-2">
                    {owner && <button type="button" disabled={busy === `disconnect-${link.id}`} onClick={() => void disconnect(link)} className={`${button} border border-slate-700 text-slate-300 hover:border-rose-400/50 hover:text-rose-200`} data-testid={`button-disconnect-family-${link.id}`}>{busy === `disconnect-${link.id}` ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />} Disconnect</button>}
                    {owner && <button type="button" onClick={() => beginConnection(link)} className={`${button} bg-slate-800 text-slate-200 hover:bg-slate-700`} data-testid={`button-add-person-connection-${link.id}`}>Add person connection</button>}
                  </div>
                </div>

                {link.connections.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">No person connections have been proposed.</p> : (
                  <ul className="mt-4 space-y-3">{link.connections.map((connection) => {
                    const status = statusOf(connection);
                    const localDisplay = personName(connection.local);
                    return <li key={connection.id} className="rounded-lg border border-slate-700/80 bg-slate-900/70 p-3" data-testid={`card-person-connection-${connection.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${status.tone}`} data-testid={`status-person-connection-${connection.id}`}>{status.label}</span><span className="text-xs text-slate-500">Version {connection.version}</span></div>
                        <span className="text-xs capitalize text-slate-400">{connection.kind.replace('_', ' ')}</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-slate-950/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Your family · {family.name}</p><p className="mt-1 text-sm font-medium text-slate-100">{localDisplay}</p><p className="mt-1 text-xs text-slate-400">{[connection.local?.birthYear && `Born ${connection.local.birthYear}`, connection.local?.deathYear && `Died ${connection.local.deathYear}`].filter(Boolean).join(' · ') || 'No years shared'}</p></div>
                        <div className="rounded-lg bg-slate-950/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Their family · {link.otherFamily.name}</p><p className="mt-1 text-sm font-medium text-slate-100">{personName(connection.remote)}</p><p className="mt-1 text-xs text-slate-400">{[connection.remote?.birthYear && `Born ${connection.remote.birthYear}`, connection.remote?.deathYear && `Died ${connection.remote.deathYear}`].filter(Boolean).join(' · ') || 'No years shared'}</p></div>
                      </div>
                      {connection.description && <p className="mt-2 text-xs leading-5 text-slate-400">{connection.description}</p>}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-sky-300" />You {connection.approvedByYou ? 'approved' : 'have not approved'} · Other owner {connection.approvedByOther ? 'approved' : 'has not approved'}</div>
                        {owner && <div className="flex gap-2">
                          <button type="button" onClick={() => beginConnection(link, connection)} className={`${button} border border-slate-700 text-slate-300 hover:bg-slate-800`} data-testid={`button-edit-person-connection-${connection.id}`}>{connection.active ? 'Edit details' : 'Review'}</button>
                          {connection.local && connection.remote && !connection.approvedByYou && <button type="button" disabled={busy === `approve-${connection.id}`} onClick={() => void runConnectionAction(connection.id, 'approve')} className={`${button} bg-emerald-400 text-slate-950 hover:bg-emerald-300`} data-testid={`button-approve-person-connection-${connection.id}`}>{busy === `approve-${connection.id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve v{connection.version}</button>}
                          <button type="button" disabled={busy === `remove-${connection.id}`} onClick={() => void runConnectionAction(connection.id, 'remove')} className={`${button} border border-slate-700 text-slate-400 hover:border-rose-400/50 hover:text-rose-200`} data-testid={`button-remove-person-connection-${connection.id}`}>Remove</button>
                        </div>}
                      </div>
                    </li>;
                  })}</ul>
                )}
              </article>
            ))}
            {links.length === 0 && <div className={`${panel} border-dashed text-center`} data-testid="empty-family-links"><p className="text-sm font-medium text-slate-200">No family links yet</p><p className="mt-1 text-xs text-slate-500">Create a private invitation to begin a connection, then add only the details each owner chooses to share.</p></div>}
          </div>

          {owner && (activeLinkId || editingId) && (
            <form onSubmit={submitConnection} className={`${panel} mt-4 border-sky-400/25`} data-testid="form-person-connection">
              <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{editingId ? 'Review or revise the connection' : 'Propose a person connection'}</h3><p className="mt-1 text-xs leading-5 text-slate-400">Only the details below are shared. Editing resets both approvals; each owner must approve the same version.</p></div><button type="button" onClick={resetForm} aria-label="Close connection editor" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" data-testid="button-close-person-connection-form"><X size={16} /></button></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-300">Person in {family.name}
                  <select required value={localPersonId} onChange={(event) => setLocalPersonId(event.target.value)} className={`${field} mt-1`} data-testid="select-local-connection-person"><option value="">Choose a person</option>{people.map((person) => <option key={person.personId} value={person.personId}>{person.displayName}{person.birthYear ? ` · ${person.birthYear}` : ''}</option>)}</select>
                </label>
                <label className="text-xs font-medium text-slate-300">Relationship
                  <select value={kind} onChange={(event) => setKind(event.target.value as ConnectionKind)} className={`${field} mt-1`} data-testid="select-person-connection-kind"><option value="same_person">Same person in both trees</option><option value="marriage">Marriage or partnership</option><option value="other">Other relationship</option></select>
                </label>
                <label className="text-xs font-medium text-slate-300 sm:col-span-2">Exact display name to share
                  <input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={`${field} mt-1`} data-testid="input-connection-display-name" />
                </label>
                <label className="text-xs font-medium text-slate-300">Birth year (optional)<input inputMode="numeric" maxLength={4} value={birthYear} onChange={(event) => setBirthYear(event.target.value.replace(/[^0-9]/g, ''))} className={`${field} mt-1`} placeholder="e.g. 1934" data-testid="input-connection-birth-year" /></label>
                <label className="text-xs font-medium text-slate-300">Death year (optional)<input inputMode="numeric" maxLength={4} value={deathYear} onChange={(event) => setDeathYear(event.target.value.replace(/[^0-9]/g, ''))} className={`${field} mt-1`} placeholder="e.g. 2008" data-testid="input-connection-death-year" /></label>
                <label className="text-xs font-medium text-slate-300 sm:col-span-2">Description (optional)<textarea maxLength={500} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className={`${field} mt-1 resize-y`} placeholder="A brief note about this connection" data-testid="input-connection-description" /></label>
              </div>
              {editingId && (() => {
                const selected = links.flatMap((link) => link.connections).find((item) => item.id === editingId);
                return selected ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Other family’s shared snapshot</p><p className="mt-1 text-sm text-slate-200">{personName(selected.remote)}</p><p className="mt-1 text-xs text-slate-500">{[selected.remote?.birthYear && `Born ${selected.remote.birthYear}`, selected.remote?.deathYear && `Died ${selected.remote.deathYear}`].filter(Boolean).join(' · ') || 'No years shared'}</p></div>
                  <div className="rounded-lg border border-slate-800 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Current version · {selected.version}</p><p className="mt-1 text-xs text-slate-400">Your approval: {selected.approvedByYou ? 'approved' : 'not approved'} · Other owner: {selected.approvedByOther ? 'approved' : 'not approved'}</p></div>
                </div> : null;
              })()}
              <div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={busy === 'connection' || !localPersonId || !displayName.trim()} className={`${button} bg-sky-400 text-slate-950 hover:bg-sky-300`} data-testid="button-save-person-connection">{busy === 'connection' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{editingId ? 'Save new version' : 'Add connection'}</button><button type="button" onClick={resetForm} className={`${button} border border-slate-700 text-slate-300 hover:bg-slate-800`}>Cancel</button></div>
            </form>
          )}
        </>
      )}
    </section>
  );
};
