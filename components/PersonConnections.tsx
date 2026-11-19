import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link2, ShieldCheck } from 'lucide-react';
import type { ConnectionsResponse, PersonConnection } from '../connectionTypes';
import { connectionService } from '../services/connectionService';

interface PersonConnectionsProps {
  personId: string;
}

export const PersonConnections: React.FC<PersonConnectionsProps> = ({ personId }) => {
  const { getToken } = useAuth();
  const [items, setItems] = useState<Array<{ familyName: string; connection: PersonConnection }>>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response: ConnectionsResponse = await connectionService.list(getToken);
      if (version !== requestVersion.current) return;
      setItems(response.links.flatMap((link) => link.connections
        .filter((connection) => connection.active && connection.approvedByYou && connection.approvedByOther && connection.local?.personId === personId)
        .map((connection) => ({ familyName: link.otherFamily.name, connection }))));
      setFailed(false);
    } catch {
      if (version !== requestVersion.current) return;
      setItems([]);
      setFailed(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [personId, getToken]);

  useEffect(() => {
    setItems([]);
    setLoading(true);
    setFailed(false);
    requestVersion.current += 1;
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 15000);
    return () => {
      requestVersion.current += 1;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [personId, load]);

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/50 p-3" aria-labelledby="person-connections-title" data-testid="section-person-connections">
      <h3 id="person-connections-title" className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Link2 size={14} className="text-brand-400" /> Linked families</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">Only owner-approved details are shown. This does not grant access to another family’s records.</p>
      {loading ? <div className="mt-3 h-12 animate-pulse rounded-lg bg-slate-800/70" aria-label="Loading person connections" /> : failed ? (
        <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-950/20 p-3">
          <p role="alert" className="text-xs text-rose-200">Connections could not be loaded.</p>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-2 text-xs font-semibold text-sky-200 hover:text-sky-100" data-testid="button-retry-person-connections">Try again</button>
        </div>
      ) : items.length === 0 ? <p className="mt-3 text-xs text-slate-500" data-testid="empty-person-connections">No approved family connections for this person.</p> : (
        <ul className="mt-3 space-y-2">{items.map(({ familyName, connection }) => (
          <li key={connection.id} className="rounded-lg border border-slate-700/80 bg-slate-950/60 p-3" data-testid={`person-connection-summary-${connection.id}`}>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><ShieldCheck size={13} className="text-emerald-300" /> {familyName}</div>
            <p className="mt-1 text-sm font-medium text-slate-100">{connection.remote?.displayName || 'Details not shared'}</p>
            <p className="mt-1 text-xs text-slate-400">{connection.kind === 'same_person' ? 'Same person in both trees' : connection.kind === 'marriage' ? 'Marriage or partnership' : 'Other relationship'}{connection.description ? ` · ${connection.description}` : ''}</p>
            {(connection.remote?.birthYear || connection.remote?.deathYear) && <p className="mt-1 text-xs text-slate-500">{[connection.remote.birthYear && `Born ${connection.remote.birthYear}`, connection.remote.deathYear && `Died ${connection.remote.deathYear}`].filter(Boolean).join(' · ')}</p>}
          </li>
        ))}</ul>
      )}
    </section>
  );
};
