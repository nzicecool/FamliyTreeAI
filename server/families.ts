import type { Express, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export interface FamilyProfile {
  userId: string;
  name: string;
  email: string;
  verifiedEmails: string[];
}

type LoadProfile = (userId: string) => Promise<FamilyProfile>;
type Db = Pool | PoolClient;

export async function ensureFamilySchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      discoverable BOOLEAN NOT NULL DEFAULT FALSE,
      owner_user_id TEXT NOT NULL,
      storage_user_id TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS family_profiles (
      user_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS family_memberships (
      family_id TEXT NOT NULL REFERENCES families(id),
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (family_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS family_memberships_user ON family_memberships(user_id);
    CREATE TABLE IF NOT EXISTS family_preferences (
      user_id TEXT PRIMARY KEY, active_family_id TEXT NOT NULL REFERENCES families(id)
    );
    CREATE TABLE IF NOT EXISTS family_invitations (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id),
      email TEXT NOT NULL,
      token_hash TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days'
    );
    CREATE INDEX IF NOT EXISTS family_invitations_email ON family_invitations(email);
    CREATE TABLE IF NOT EXISTS family_join_requests (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id),
      user_id TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (family_id,user_id)
    );
  `);
  // Additive migration: the legacy user_id columns remain untouched. A family's
  // private storage namespace maps existing records to their original owner.
  await transaction(pool, async db => {
    await db.query(`
      INSERT INTO families (id,name,owner_user_id,storage_user_id)
      SELECT 'legacy_' || md5(user_id), 'My family', user_id, user_id
      FROM (
        SELECT user_id FROM people UNION SELECT user_id FROM tree_meta
        UNION SELECT user_id FROM marriages UNION SELECT user_id FROM documents
        UNION SELECT invited_by_user_id AS user_id FROM invites
      ) old_users
      ON CONFLICT (storage_user_id) DO NOTHING
    `);
    await db.query(`
      INSERT INTO family_memberships (family_id,user_id,role)
      SELECT id,owner_user_id,'owner' FROM families
      ON CONFLICT DO NOTHING
    `);
    await db.query(`
      INSERT INTO family_preferences (user_id,active_family_id)
      SELECT DISTINCT ON (owner_user_id) owner_user_id,id FROM families
      ORDER BY owner_user_id,created_at,id
      ON CONFLICT DO NOTHING
    `);
    await db.query(`
      INSERT INTO family_invitations (id,family_id,email)
      SELECT 'legacy_invite_' || md5(i.email),f.id,lower(trim(i.email))
      FROM invites i JOIN families f ON f.storage_user_id=i.invited_by_user_id
      WHERE i.status='pending'
      ON CONFLICT (id) DO NOTHING
    `);
  });
}

async function transaction<T>(pool: Pool, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

class FamilyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const fail = (status: number, message: string): never => { throw new FamilyError(status, message); };
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const publicFamily = (r: any) => ({ id: r.id, name: r.name, description: r.description });
const memberFamily = (r: any) => ({ ...publicFamily(r), discoverable: r.discoverable, role: r.role });

async function setActive(db: Db, userId: string, familyId: string) {
  await db.query(`INSERT INTO family_preferences(user_id,active_family_id) VALUES($1,$2)
    ON CONFLICT(user_id) DO UPDATE SET active_family_id=EXCLUDED.active_family_id`, [userId, familyId]);
}

async function requireOwner(db: Db, userId: string, familyId: string) {
  const result = await db.query('SELECT * FROM families WHERE id=$1 AND owner_user_id=$2', [familyId, userId]);
  if (!result.rows[0]) fail(403, 'Only this family’s owner can manage access and visibility.');
  return result.rows[0];
}

function familyInput(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (!name || name.length > 100) fail(400, 'Enter a family name of 1–100 characters.');
  if (description.length > 500) fail(400, 'The description must be 500 characters or fewer.');
  if (body.discoverable !== undefined && typeof body.discoverable !== 'boolean') {
    fail(400, 'Search visibility must be true or false.');
  }
  return { name, description, discoverable: body.discoverable === true };
}

// This runs before every tree/marriage/document endpoint. Never substitute the
// caller's identity: settings, encryption, AI keys and admin roles stay per-user.
export function familyScopeMiddleware(pool: Pool): RequestHandler {
  return async (req: any, res, next) => {
    try {
      const familyId = req.get('X-Family-Id');
      if (!familyId) return res.status(403).json({ error: 'Choose a family before accessing its tree.' });
      const result = await pool.query(`
        SELECT f.storage_user_id FROM family_memberships m JOIN families f ON f.id=m.family_id
        WHERE m.user_id=$1 AND m.family_id=$2`, [req.auth.userId, familyId]);
      if (!result.rows[0]) return res.status(403).json({ error: 'You are not a member of this family.' });
      req.treeUserId = result.rows[0].storage_user_id;
      next();
    } catch (error) { next(error); }
  };
}

export function registerFamilyRoutes(
  app: Express, pool: Pool, authenticate: RequestHandler, loadProfile: LoadProfile,
) {
  const route = (handler: (req: any, res: any, profile: FamilyProfile) => Promise<any>): RequestHandler =>
    async (req: any, res) => {
      try {
        const profile = await loadProfile(req.auth.userId);
        if (!profile.verifiedEmails.length) fail(403, 'Verify your email address before joining a family.');
        await pool.query(`INSERT INTO family_profiles(user_id,name,email) VALUES($1,$2,$3)
          ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email`,
          [profile.userId, profile.name, profile.email]);
        await handler(req, res, profile);
      } catch (error: any) {
        if (!(error instanceof FamilyError)) console.error('Family request failed:', error.message);
        res.status(error instanceof FamilyError ? error.status : 500).json({
          error: error instanceof FamilyError ? error.message : 'The family request failed. Please try again.',
        });
      }
    };

  app.get('/api/families/context', authenticate, route(async (_req, res, p) => {
    const [memberships, preference, invitations, requests] = await Promise.all([
      pool.query(`SELECT f.*,m.role FROM families f JOIN family_memberships m ON m.family_id=f.id
        WHERE m.user_id=$1 ORDER BY f.created_at,f.id`, [p.userId]),
      pool.query('SELECT active_family_id FROM family_preferences WHERE user_id=$1', [p.userId]),
      pool.query(`SELECT i.id,i.family_id,f.name,i.expires_at FROM family_invitations i
        JOIN families f ON f.id=i.family_id WHERE i.email=ANY($1::text[]) AND i.status='pending'
        AND i.expires_at>NOW() ORDER BY i.created_at DESC`, [p.verifiedEmails]),
      pool.query(`SELECT r.id,r.family_id,f.name,r.status FROM family_join_requests r
        JOIN families f ON f.id=r.family_id WHERE r.user_id=$1 ORDER BY r.created_at DESC`, [p.userId]),
    ]);
    const preferred = preference.rows[0]?.active_family_id;
    const activeFamilyId = memberships.rows.find(r => r.id === preferred)?.id || memberships.rows[0]?.id || null;
    res.json({
      families: memberships.rows.map(memberFamily), activeFamilyId,
      invitations: invitations.rows.map(r => ({
        id: r.id, familyId: r.family_id, familyName: r.name, expiresAt: r.expires_at,
      })),
      requests: requests.rows.map(r => ({
        id: r.id, familyId: r.family_id, familyName: r.name, status: r.status,
      })),
    });
  }));

  app.post('/api/families', authenticate, route(async (req, res, p) => {
    const input = familyInput(req.body);
    const id = randomUUID();
    await transaction(pool, async db => {
      await db.query(`INSERT INTO families(id,name,description,discoverable,owner_user_id,storage_user_id)
        VALUES($1,$2,$3,$4,$5,$1)`, [id, input.name, input.description, input.discoverable, p.userId]);
      await db.query(`INSERT INTO family_memberships(family_id,user_id,role) VALUES($1,$2,'owner')`, [id, p.userId]);
      await setActive(db, p.userId, id);
    });
    res.status(201).json({ family: { id, ...input, role: 'owner' } });
  }));

  app.get('/api/families/search', authenticate, route(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (query.length < 2) return res.json({ families: [] });
    // Escape wildcard characters: searching a name must not become a directory dump.
    const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
    const result = await pool.query(`SELECT id,name,description FROM families
      WHERE discoverable=TRUE AND name ILIKE $1 ORDER BY lower(name),id LIMIT 20`, [pattern]);
    res.json({ families: result.rows.map(publicFamily) });
  }));

  app.post('/api/families/:familyId/activate', authenticate, route(async (req, res, p) => {
    const exists = await pool.query('SELECT 1 FROM family_memberships WHERE family_id=$1 AND user_id=$2',
      [req.params.familyId, p.userId]);
    if (!exists.rowCount) fail(403, 'You are not a member of this family.');
    await setActive(pool, p.userId, req.params.familyId);
    res.json({ ok: true });
  }));

  app.patch('/api/families/:familyId', authenticate, route(async (req, res, p) => {
    await requireOwner(pool, p.userId, req.params.familyId);
    const input = familyInput(req.body);
    await pool.query('UPDATE families SET name=$1,description=$2,discoverable=$3 WHERE id=$4',
      [input.name, input.description, input.discoverable, req.params.familyId]);
    res.json({ ok: true });
  }));

  app.post('/api/families/:familyId/requests', authenticate, route(async (req, res, p) => {
    const familyId = req.params.familyId;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (message.length > 1000) fail(400, 'Your message must be 1,000 characters or fewer.');
    await transaction(pool, async db => {
      const family = await db.query('SELECT id FROM families WHERE id=$1 AND discoverable=TRUE FOR SHARE', [familyId]);
      if (!family.rowCount) fail(404, 'This family is not available for search or join requests.');
      const membership = await db.query('SELECT 1 FROM family_memberships WHERE family_id=$1 AND user_id=$2',
        [familyId, p.userId]);
      if (membership.rowCount) fail(409, 'You already belong to this family.');
      const result = await db.query(`INSERT INTO family_join_requests(id,family_id,user_id,message)
        VALUES($1,$2,$3,$4) ON CONFLICT(family_id,user_id) DO NOTHING`,
        [randomUUID(), familyId, p.userId, message]);
      if (!result.rowCount) fail(409, 'You have already submitted a request to this family.');
    });
    res.status(201).json({ ok: true });
  }));

  app.get('/api/families/:familyId/manage', authenticate, route(async (req, res, p) => {
    const id = req.params.familyId;
    await requireOwner(pool, p.userId, id);
    const [members, invitations, requests] = await Promise.all([
      pool.query(`SELECT m.user_id,m.role,COALESCE(p.name,'Family member') AS name,COALESCE(p.email,'') AS email
        FROM family_memberships m LEFT JOIN family_profiles p ON p.user_id=m.user_id
        WHERE m.family_id=$1 ORDER BY m.joined_at`, [id]),
      pool.query(`SELECT id,email,status,expires_at FROM family_invitations
        WHERE family_id=$1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT r.id,r.message,r.status,p.name,p.email FROM family_join_requests r
        JOIN family_profiles p ON p.user_id=r.user_id WHERE r.family_id=$1 ORDER BY r.created_at DESC`, [id]),
    ]);
    res.json({
      members: members.rows.map(r => ({ userId: r.user_id, role: r.role, name: r.name, email: r.email })),
      invitations: invitations.rows.map(r => ({ id: r.id, email: r.email, status: r.status, expiresAt: r.expires_at })),
      requests: requests.rows,
    });
  }));

  app.post('/api/families/:familyId/requests/:requestId/decision', authenticate, route(async (req, res, p) => {
    const { familyId, requestId } = req.params;
    const { decision } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) fail(400, 'Choose approve or reject.');
    await transaction(pool, async db => {
      await requireOwner(db, p.userId, familyId);
      const result = await db.query(`SELECT * FROM family_join_requests
        WHERE id=$1 AND family_id=$2 FOR UPDATE`, [requestId, familyId]);
      const request = result.rows[0];
      if (!request) fail(404, 'Join request not found.');
      if (request.status !== 'pending') fail(409, 'This request has already been reviewed.');
      if (decision === 'approve') {
        await db.query(`INSERT INTO family_memberships(family_id,user_id,role)
          VALUES($1,$2,'member') ON CONFLICT DO NOTHING`, [familyId, request.user_id]);
        await db.query(`INSERT INTO family_preferences(user_id,active_family_id)
          VALUES($1,$2) ON CONFLICT DO NOTHING`, [request.user_id, familyId]);
      }
      await db.query('UPDATE family_join_requests SET status=$1 WHERE id=$2',
        [decision === 'approve' ? 'approved' : 'rejected', requestId]);
    });
    res.json({ ok: true });
  }));

  app.post('/api/families/:familyId/invitations', authenticate, route(async (req, res, p) => {
    const id = req.params.familyId;
    const family = await requireOwner(pool, p.userId, id);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
    const token = randomBytes(32).toString('base64url');
    const invitationId = randomUUID();
    await transaction(pool, async db => {
      // Serialize invites per family, bound sending and replace old pending links.
      await db.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [id]);
      const count = await db.query(`SELECT count(*) FROM family_invitations
        WHERE family_id=$1 AND created_at>NOW()-INTERVAL '1 hour'`, [id]);
      if (Number(count.rows[0].count) >= 30) fail(429, 'Invitation limit reached. Please try again in an hour.');
      const member = await db.query(`SELECT 1 FROM family_memberships m
        JOIN family_profiles p ON p.user_id=m.user_id WHERE m.family_id=$1 AND lower(p.email)=$2`, [id, email]);
      if (member.rowCount) fail(409, 'This person is already a family member.');
      await db.query(`UPDATE family_invitations SET status='revoked'
        WHERE family_id=$1 AND email=$2 AND status='pending'`, [id, email]);
      await db.query(`INSERT INTO family_invitations(id,family_id,email,token_hash) VALUES($1,$2,$3,$4)`,
        [invitationId, id, email, hashToken(token)]);
    });
    const delivery = await sendInvitationEmail(req, email, family.name, p.name, token);
    res.status(201).json({ invitationId, token, ...delivery });
  }));

  app.delete('/api/families/:familyId/invitations/:invitationId', authenticate, route(async (req, res, p) => {
    await requireOwner(pool, p.userId, req.params.familyId);
    const result = await pool.query(`UPDATE family_invitations SET status='revoked'
      WHERE id=$1 AND family_id=$2 AND status='pending'`, [req.params.invitationId, req.params.familyId]);
    if (!result.rowCount) fail(404, 'Pending invitation not found.');
    res.json({ ok: true });
  }));

  app.post('/api/families/accept-invite', authenticate, route(async (req, res, p) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const invitationId = typeof req.body?.invitationId === 'string' ? req.body.invitationId : '';
    if ((!token && !invitationId) || token.length > 512) fail(400, 'Provide a valid invitation.');
    await transaction(pool, async db => {
      const result = token
        ? await db.query('SELECT * FROM family_invitations WHERE token_hash=$1 FOR UPDATE', [hashToken(token)])
        : await db.query('SELECT * FROM family_invitations WHERE id=$1 FOR UPDATE', [invitationId]);
      const invitation = result.rows[0];
      if (!invitation || invitation.status !== 'pending' || new Date(invitation.expires_at) <= new Date()) {
        fail(400, 'This invitation is invalid, expired, revoked, or already accepted.');
      }
      if (!p.verifiedEmails.includes(invitation.email)) {
        fail(403, 'Sign in with the verified email address this invitation was sent to.');
      }
      await db.query(`INSERT INTO family_memberships(family_id,user_id,role)
        VALUES($1,$2,'member') ON CONFLICT DO NOTHING`, [invitation.family_id, p.userId]);
      await db.query(`UPDATE family_invitations SET status='accepted' WHERE id=$1`, [invitation.id]);
      await db.query(`UPDATE family_join_requests SET status='approved' WHERE family_id=$1 AND user_id=$2`,
        [invitation.family_id, p.userId]);
      await setActive(db, p.userId, invitation.family_id);
    });
    res.json({ ok: true });
  }));
}

async function sendInvitationEmail(req: any, email: string, familyName: string, inviter: string, token: string) {
  const notSent = (emailError: string) => ({ emailSent: false, emailError });
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) return notSent('Email delivery is not configured. Copy and share the invitation link instead.');
  try {
    const origin = new URL(req.get('origin') || '');
    const hosts = [req.get('host'), req.get('x-forwarded-host')].filter(Boolean);
    if (!['https:', 'http:'].includes(origin.protocol) || !hosts.includes(origin.host)) {
      return notSent('Could not confirm the app address. Copy and share the invitation link instead.');
    }
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const inboxResponse = await fetch('https://api.agentmail.to/v0/inboxes?limit=1', {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!inboxResponse.ok) return notSent(`Email provider returned ${inboxResponse.status}. Share the link instead.`);
    const inboxes = await inboxResponse.json();
    const inboxId = inboxes.inboxes?.[0]?.inbox_id;
    if (!inboxId) return notSent('No sending inbox is configured. Share the invitation link instead.');
    const link = `${origin.origin}/?invite=${encodeURIComponent(token)}`;
    const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
      method: 'POST', headers, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        to: [email], subject: `Join ${familyName} on FamilyTreeAI`,
        text: `${inviter} invited you to join ${familyName} on FamilyTreeAI.\n\n${link}\n\nSign in or sign up using ${email}, then accept the invitation. This link expires in 14 days.`,
      }),
    });
    if (!response.ok) return notSent(`Email provider returned ${response.status}. Share the link instead.`);
    return { emailSent: true, emailError: null };
  } catch {
    return notSent('Email delivery failed. Copy and share the invitation link instead.');
  }
}
