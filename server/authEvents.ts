import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

export interface TrackingIdentity {
  userId: string;
  createdAt: number;
  email?: string;
  name?: string;
}
// Only accept the Clerk backend's verified addresses, never browser-submitted
// names/emails, or unverified addresses returned on a partially verified user.
export function trackingIdentity(user: any): TrackingIdentity {
  const verified = user.emailAddresses.filter((e: any) => e.verification?.status === 'verified');
  const email = (verified.find((e: any) => e.id === user.primaryEmailAddressId) || verified[0])?.emailAddress;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return {
    userId: user.id, createdAt: user.createdAt,
    ...(email ? { email: email.trim().toLowerCase() } : {}),
    ...(name ? { name } : {}),
  };
}
export async function ensureAuthEventsSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS growthflow_auth_config (
      environment TEXT PRIMARY KEY, enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS growthflow_auth_deliveries (
      environment TEXT NOT NULL, event_key TEXT NOT NULL, event_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'claimed', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(environment,event_key)
    );
  `);
  await pool.query(`INSERT INTO growthflow_auth_config(environment) VALUES($1) ON CONFLICT DO NOTHING`,
    [process.env.NODE_ENV === 'production' ? 'production' : 'development']);
}
export function createAuthEventHandler(options: {
  pool: Pool;
  environment: string;
  configured: boolean;
  loadIdentity: (userId: string) => Promise<TrackingIdentity>;
  loadSession: (sessionId: string) => Promise<{ userId: string; createdAt: number; status: string }>;
  send: (eventName: string, userId?: string, contact?: { email?: string; name?: string }, details?: { occurredAt: string }) => Promise<boolean>;
  warn?: (message: string) => void;
}): RequestHandler {
  const { pool, environment, loadIdentity, loadSession, send } = options;
  const warn = options.warn ?? console.warn;
  return async (req: any, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('X-Product-Analytics-Consent') !== 'granted') return res.sendStatus(204);
    if (!req.auth?.userId || !req.auth?.sessionId) return res.sendStatus(401);
    if (!options.configured) return res.sendStatus(503);
    try {
      const [identity, session, config] = await Promise.all([
        loadIdentity(req.auth.userId),
        loadSession(req.auth.sessionId),
        pool.query('SELECT enabled_at FROM growthflow_auth_config WHERE environment=$1', [environment]),
      ]);
      if (identity.userId !== req.auth.userId || session.userId !== identity.userId || session.status !== 'active') return res.sendStatus(401);
      if (!config.rowCount || !Number.isFinite(identity.createdAt) || !Number.isFinite(session.createdAt)) {
        warn('GrowthFlowAI authentication tracking configuration or Clerk timestamps are unavailable.');
        return res.sendStatus(503);
      }
      const enabledAt = new Date(config.rows[0].enabled_at).getTime();
      const pending: { name: string; key: string; at: number }[] = [];
      // A first visit is NOT a signup. Only accounts actually created after
      // tracking was enabled qualify; historical users are never backfilled.
      if (identity.createdAt >= enabledAt) pending.push({ name: 'user_signed_up', key: `signup:${identity.userId}`, at: identity.createdAt });
      // Likewise, reopening an older Clerk session must not count as a login.
      if (session.createdAt >= enabledAt) pending.push({ name: 'user_signed_in', key: `signin:${req.auth.sessionId}`, at: session.createdAt });
      pending.push({ name: 'app_session_started', key: `app-session:${req.auth.sessionId}`, at: Date.now() });
      let unconfirmed = false;
      for (const event of pending) {
        const key = createHash('sha256').update(`familytreeai:${event.key}`).digest('hex');
        const claim = await pool.query(`INSERT INTO growthflow_auth_deliveries(environment,event_key,event_name)
          VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_key`, [environment, key, event.name]);
        if (!claim.rowCount) {
          const previous = await pool.query('SELECT status FROM growthflow_auth_deliveries WHERE environment=$1 AND event_key=$2', [environment, key]);
          if (previous.rows[0]?.status !== 'sent') unconfirmed = true;
          continue;
        }
        // The provider does not deduplicate requests. Persist the claim BEFORE
        // delivery; never blindly replay an ambiguous timeout after a restart.
        let accepted = false;
        try {
          accepted = await send(event.name, identity.userId, identity, { occurredAt: new Date(event.at).toISOString() });
        } catch { /* A possibly delivered request must not be sent again. */ }
        await pool.query(`UPDATE growthflow_auth_deliveries SET status=$3,updated_at=NOW()
          WHERE environment=$1 AND event_key=$2`, [environment, key, accepted ? 'sent' : 'unconfirmed']);
        if (!accepted) {
          unconfirmed = true;
          warn('GrowthFlowAI authentication event delivery is unconfirmed; automatic replay suppressed to prevent duplicate contacts/events.');
        }
      }
      return res.sendStatus(unconfirmed ? 202 : 204);
    } catch {
      // Safe to retry identity/config lookups. Any already-claimed deliveries
      // are protected by the persistent unique key, including across instances.
      warn('GrowthFlowAI authentication tracking could not complete. No personal details were logged.');
      return res.sendStatus(503);
    }
  };
}
