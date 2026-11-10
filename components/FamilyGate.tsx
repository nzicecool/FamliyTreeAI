import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { Loader2 } from 'lucide-react';
import { Family, FamilyContext } from '../familyTypes';
import { familyService, pendingInvitationToken, setActiveFamilyScope } from '../services/familyService';
import { FamilyOnboarding } from './FamilyOnboarding';

interface Props {
  children: (family: Family, onChanged: () => Promise<void>, onBrowse: () => void) => ReactNode;
}

export const FamilyGate: React.FC<Props> = ({ children }) => {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [context, setContext] = useState<FamilyContext | null>(null);
  const [error, setError] = useState('');
  const [browsing, setBrowsing] = useState(false);

  const reload = useCallback(async (quiet = false) => {
    try {
      const latest = await familyService.context(getToken);
      setContext(previous => {
        // Another tab's preference must not silently switch this tab's saves.
        const previousActive = quiet && previous?.activeFamilyId;
        return previousActive && latest.families.some(f => f.id === previousActive)
          ? { ...latest, activeFamilyId: previousActive } : latest;
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your family memberships.');
      throw err;
    }
  }, [getToken]);

  useEffect(() => {
    const refresh = () => { void reload(true).catch(() => {}); };
    refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      setActiveFamilyScope(null);
    };
  }, [reload]);

  const active = context?.families.find(f => f.id === context.activeFamilyId);
  const onboarding = browsing || !active || Boolean(pendingInvitationToken());
  useLayoutEffect(() => {
    setActiveFamilyScope(onboarding ? null : active?.id || null);
  }, [onboarding, active?.id]);

  const changed = async () => {
    await reload();
    setBrowsing(false);
  };

  if (!context) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col items-center justify-center p-6 gap-4">
        {error ? (
          <>
            <p role="alert" className="max-w-lg text-center text-rose-300">{error}</p>
            <button className="rounded-lg bg-brand-600 px-5 py-3 text-white" onClick={() => void reload().catch(() => {})}>Try again</button>
            <button onClick={() => void signOut({ redirectUrl: '/' })}>Sign out</button>
          </>
        ) : <><Loader2 className="animate-spin" /><p>Finding your family spaces…</p></>}
      </div>
    );
  }

  return (
    <>
      {error && <div role="alert" className="fixed top-0 inset-x-0 z-50 bg-rose-950 p-3 text-center text-sm text-rose-200">{error}</div>}
      {onboarding ? (
        <FamilyOnboarding
          context={context}
          onChanged={changed}
          onSignOut={() => void signOut({ redirectUrl: '/' })}
          onCancel={active && !pendingInvitationToken() ? () => {
            // A received link requires an explicit accept/dismiss, not data access.
            setBrowsing(false);
          } : undefined}
        />
      ) : children(active, changed, () => setBrowsing(true))}
    </>
  );
}
