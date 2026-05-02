import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { User } from '../types';
import { Mail, UserPlus, Trash2, Clock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface Invite {
  email: string;
  invitedBy: string;
  invitedAt: string;
  status: 'pending' | 'accepted';
}

interface InviteManagerProps {
  currentUser: User;
}

export const InviteManager: React.FC<InviteManagerProps> = ({ currentUser }) => {
  const { getToken } = useAuth();
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authedFetch = async (input: RequestInfo, init: RequestInit = {}) => {
    const token = await getToken();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    };
    return fetch(input, { ...init, headers });
  };

  const fetchInvites = async () => {
    setFetching(true);
    try {
      const response = await authedFetch('/api/invites');
      if (!response.ok) {
        throw new Error('Failed to load invitations');
      }
      const data = await response.json();
      setInvites(data.invites || []);
    } catch (err) {
      console.error('Error fetching invites:', err);
      setError('Failed to load invitations.');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      const inviteEmail = email.toLowerCase().trim();
      const response = await authedFetch('/api/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          invitedBy: currentUser.name,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      if (data.emailError) {
        setError(`Invite saved, but email failed: ${data.emailError}`);
      }

      setEmail('');
      await fetchInvites();
    } catch (err: any) {
      console.error('Error sending invite:', err);
      setError(err.message || 'Failed to send invitation.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvite = async (inviteEmail: string) => {
    try {
      const response = await authedFetch(`/api/invite/${encodeURIComponent(inviteEmail)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to revoke invitation');
      }
      await fetchInvites();
    } catch (err) {
      console.error('Error deleting invite:', err);
      setError('Failed to revoke invitation.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <UserPlus className="text-brand-500" />
          Invite Management
        </h2>
        <p className="text-slate-400">
          Manage access to FamilyTreeAI. Only invited users can sign up.
        </p>
      </div>

      {/* Invite Form */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8">
        <form onSubmit={handleInvite} className="flex gap-4">
          <div className="flex-1 relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter family member's email"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-8 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Invite'}
          </button>
        </form>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      {/* Invites List */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <h3 className="font-semibold text-white">Active Invitations</h3>
        </div>

        <div className="divide-y divide-slate-800">
          {fetching ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p>Loading invitations...</p>
            </div>
          ) : invites.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Mail size={48} className="mx-auto mb-4 opacity-20" />
              <p>No invitations sent yet.</p>
            </div>
          ) : (
            invites.map((invite) => (
              <div key={invite.email} className="px-6 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    invite.status === 'accepted' ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                  )}>
                    {invite.status === 'accepted' ? <CheckCircle size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <div className="text-white font-medium">{invite.email}</div>
                    <div className="text-xs text-slate-500">
                      Invited by {invite.invitedBy} on {new Date(invite.invitedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className={clsx(
                    "text-xs px-2 py-1 rounded-full font-medium uppercase tracking-wider",
                    invite.status === 'accepted' ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
                  )}>
                    {invite.status}
                  </span>
                  <button
                    onClick={() => handleDeleteInvite(invite.email)}
                    className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    title="Revoke Invite"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
