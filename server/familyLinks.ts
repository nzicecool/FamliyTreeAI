import express, { type Express, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { familyScopeMiddleware } from './families';
import type { ConnectionInput } from '../connectionTypes';

export async function ensureFamilyLinksSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_links (
      id TEXT PRIMARY KEY, family_a TEXT NOT NULL REFERENCES families(id),
      family_b TEXT NOT NULL REFERENCES families(id), active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(family_a < family_b), UNIQUE(family_a,family_b)
    );
    CREATE TABLE IF NOT EXISTS family_link_invites (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id),
      target_family_id TEXT REFERENCES families(id), token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending', expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '14 days',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS family_connections (
      id TEXT PRIMARY KEY, link_id TEXT NOT NULL REFERENCES family_links(id),
      person_a JSONB, person_b JSONB, kind TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1, approved_a INTEGER, approved_b INTEGER,
      revoked BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS family_connections_link ON family_connections(link_id);
    CREATE TABLE IF NOT EXISTS family_link_audit (
      id BIGSERIAL PRIMARY KEY, actor_id TEXT NOT NULL, family_id TEXT NOT NULL,
      entity_id TEXT NOT NULL, action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
class LinkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new LinkError(status, message); };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function tx<T>(pool: Pool, work: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
const audit = (db: PoolClient, req: any, id: string, action: string) =>
  db.query('INSERT INTO family_link_audit(actor_id,family_id,entity_id,action) VALUES($1,$2,$3,$4)',
    [req.auth.userId, req.get('X-Family-Id'), id, action]);
async function owner(db: Pool | PoolClient, req: any) {
  const r = await db.query('SELECT id FROM families WHERE id=$1 AND owner_user_id=$2',
    [req.get('X-Family-Id'), req.auth.userId]);
  if (!r.rowCount) fail(403, 'Only the family owner can manage connections.');
}
async function link(db: PoolClient, req: any, id: string) {
  await owner(db, req);
  const r = await db.query(`SELECT * FROM family_links WHERE id=$1 AND active
    AND (family_a=$2 OR family_b=$2) FOR UPDATE`, [id, req.get('X-Family-Id')]);
  if (!r.rowCount) fail(404, 'Family link not found.');
  return r.rows[0];
}
async function connection(db: PoolClient, req: any, id: string) {
  const lookup = await db.query('SELECT link_id FROM family_connections WHERE id=$1', [id]);
  if (!lookup.rowCount) fail(404, 'Connection not found.');
  const parent = await link(db, req, lookup.rows[0].link_id);
  const r = await db.query('SELECT * FROM family_connections WHERE id=$1 AND NOT revoked FOR UPDATE', [id]);
  if (!r.rowCount) fail(404, 'Connection not found.');
  return { ...parent, ...r.rows[0], side: parent.family_a === req.get('X-Family-Id') ? 'a' : 'b' };
}
function input(body: ConnectionInput) {
  if (!body || !['same_person', 'marriage', 'other'].includes(body.kind)) fail(400, 'Choose a connection type.');
  if (typeof body.personId !== 'string' || !body.personId || body.personId.length > 200) fail(400, 'Choose a person in your family.');
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName || displayName.length > 120) fail(400, 'Enter a shared display name of 1–120 characters.');
  if (typeof body.description !== 'string' || body.description.length > 240) fail(400, 'Use a relationship description of at most 240 characters.');
  for (const year of [body.birthYear, body.deathYear]) {
    if (year !== undefined && year !== '' && (typeof year !== 'string' || !/^\d{1,4}$/.test(year))) fail(400, 'Use years only, or leave them blank.');
  }
  return {
    personId: body.personId, displayName,
    ...(body.birthYear ? { birthYear: body.birthYear } : {}),
    ...(body.deathYear ? { deathYear: body.deathYear } : {}),
  };
}
async function existsPerson(db: PoolClient, storageId: string, personId: string) {
  const r = await db.query('SELECT id FROM people WHERE user_id=$1 AND id=$2 FOR KEY SHARE', [storageId, personId]);
  if (!r.rowCount) fail(404, 'The selected person no longer exists.');
}
export function registerFamilyLinkRoutes(app: Express, pool: Pool, authenticate: RequestHandler) {
  const router = express.Router();
  router.use(authenticate, familyScopeMiddleware(pool), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const route = (work: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    try { await work(req, res); } catch (e) {
      res.status(e instanceof LinkError ? e.status : 500).json({ error: e instanceof LinkError ? e.message : 'The connection request failed. Please try again.' });
    }
  };
  // Bounded, per-user write limit; never use a proxy IP as a user identity.
  const attempts = new Map<string, { count: number; until: number }>();
  router.use((req: any, res, next) => {
    if (req.method === 'GET') return next();
    const now = Date.now(), key = req.auth.userId;
    for (const [id, a] of attempts) if (a.until <= now) attempts.delete(id);
    const a = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
    if (attempts.size >= 10_000 && !attempts.has(key) || ++a.count > 60) {
      res.set('Retry-After', '900'); return res.status(429).json({ error: 'Too many connection requests. Try again in 15 minutes.' });
    }
    attempts.set(key, a); next();
  });
  router.get('/people', route(async (req, res) => {
    await owner(pool, req);
    const r = await pool.query('SELECT id,first_name,last_name FROM people WHERE user_id=$1 ORDER BY first_name,last_name', [req.treeUserId]);
    res.json({ people: r.rows.map(p => ({ personId: p.id, displayName: `${p.first_name} ${p.last_name}`.trim() })) });
  }));
  router.get('/', route(async (req, res) => {
    const familyId = req.get('X-Family-Id');
    const f = await pool.query('SELECT owner_user_id FROM families WHERE id=$1', [familyId]);
    const isOwner = f.rows[0]?.owner_user_id === req.auth.userId;
    const parents = await pool.query(`SELECT l.*,f.id AS other_id,f.name AS other_name FROM family_links l
      JOIN families f ON f.id=CASE WHEN l.family_a=$1 THEN l.family_b ELSE l.family_a END
      WHERE l.active AND (l.family_a=$1 OR l.family_b=$1) ORDER BY l.created_at`, [familyId]);
    const links = [];
    for (const l of parents.rows) {
      const rows = await pool.query(`SELECT c.* FROM family_connections c
        WHERE c.link_id=$1 AND NOT c.revoked
        AND (c.person_a IS NULL OR EXISTS(SELECT 1 FROM people p JOIN families f ON f.storage_user_id=p.user_id
          WHERE f.id=$2 AND p.id=c.person_a->>'personId'))
        AND (c.person_b IS NULL OR EXISTS(SELECT 1 FROM people p JOIN families f ON f.storage_user_id=p.user_id
          WHERE f.id=$3 AND p.id=c.person_b->>'personId')) ORDER BY c.created_at`, [l.id, l.family_a, l.family_b]);
      const connections = rows.rows.filter(c => isOwner || c.person_a && c.person_b && c.approved_a === c.version && c.approved_b === c.version).map(c => {
        const a = l.family_a === familyId;
        // Never expose remote person identifiers outside their own family.
        const remote = a ? c.person_b : c.person_a;
        return { id: c.id, local: a ? c.person_a : c.person_b,
          remote: remote ? { ...remote, personId: '' } : null, kind: c.kind, description: c.description,
          version: c.version, approvedByYou: (a ? c.approved_a : c.approved_b) === c.version,
          approvedByOther: (a ? c.approved_b : c.approved_a) === c.version,
          active: Boolean(c.person_a && c.person_b && c.approved_a === c.version && c.approved_b === c.version) };
      });
      if (isOwner || connections.length) links.push({ id: l.id, otherFamily: { id: l.other_id, name: l.other_name }, connections });
    }
    const invitations = isOwner ? (await pool.query(`SELECT i.id,i.expires_at,f.name FROM family_link_invites i
      LEFT JOIN families f ON f.id=i.target_family_id WHERE i.family_id=$1 AND i.status='pending' AND i.expires_at>NOW()
      ORDER BY i.created_at DESC`, [familyId])).rows.map(i => ({ id: i.id, expiresAt: i.expires_at, targetName: i.name })) : [];
    res.json({ owner: isOwner, links, invitations });
  }));
  router.post('/invitations', route(async (req, res) => {
    const result = await tx(pool, async db => {
      await owner(db, req);
      const familyId = req.get('X-Family-Id'), target = req.body?.targetFamilyId || null;
      if (target !== null && (typeof target !== 'string' || target.length > 200)) fail(400, 'Invalid target family.');
      if (target === familyId) fail(400, 'Choose a different family.');
      // Serialize invitation creation for this family to prevent concurrent duplicates.
      await db.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [familyId]);
      if (target) {
        const r = await db.query('SELECT id FROM families WHERE id=$1 AND discoverable', [target]);
        if (!r.rowCount) fail(404, 'Family not found. Use a private invitation instead.');
      }
      const duplicate = await db.query(`SELECT id FROM family_link_invites WHERE family_id=$1
        AND target_family_id IS NOT DISTINCT FROM $2 AND status='pending' AND expires_at>NOW()`, [familyId, target]);
      if (duplicate.rowCount) fail(409, 'A pending invitation already exists. Cancel it before creating another.');
      const token = randomBytes(32).toString('hex'), id = randomUUID();
      const r = await db.query(`INSERT INTO family_link_invites(id,family_id,target_family_id,token_hash)
        VALUES($1,$2,$3,$4) RETURNING expires_at`, [id, familyId, target, hash(token)]);
      await audit(db, req, id, 'invited');
      return { token, expiresAt: r.rows[0].expires_at };
    });
    res.status(201).json(result);
  }));
  router.delete('/invitations/:id', route(async (req, res) => {
    await tx(pool, async db => {
      await owner(db, req);
      const r = await db.query(`UPDATE family_link_invites SET status='cancelled' WHERE id=$1 AND family_id=$2 AND status='pending' RETURNING id`,
        [req.params.id, req.get('X-Family-Id')]);
      if (!r.rowCount) fail(404, 'Invitation not found.');
      await audit(db, req, req.params.id, 'invitation_cancelled');
    }); res.json({ ok: true });
  }));
  router.post('/accept', route(async (req, res) => {
    if (typeof req.body?.token !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.token)) fail(400, 'Enter a valid connection invitation token.');
    const id = await tx(pool, async db => {
      await owner(db, req);
      const r = await db.query(`SELECT * FROM family_link_invites WHERE token_hash=$1 AND status='pending' AND expires_at>NOW() FOR UPDATE`, [hash(req.body.token)]);
      if (!r.rowCount) fail(404, 'This invitation has expired, was cancelled, or was already used.');
      const invite = r.rows[0], familyId = req.get('X-Family-Id');
      if (invite.family_id === familyId) fail(400, 'Choose a different family to accept this invitation.');
      if (invite.target_family_id && invite.target_family_id !== familyId) fail(403, 'This invitation is for another family.');
      const [a, b] = [invite.family_id, familyId].sort();
      const parent = await db.query(`INSERT INTO family_links(id,family_a,family_b) VALUES($1,$2,$3)
        ON CONFLICT(family_a,family_b) DO UPDATE SET active=TRUE RETURNING id`, [randomUUID(), a, b]);
      await db.query(`UPDATE family_link_invites SET status='accepted' WHERE id=$1`, [invite.id]);
      await audit(db, req, parent.rows[0].id, 'invitation_accepted');
      return parent.rows[0].id;
    }); res.json({ id });
  }));
  router.post('/:id/connections', route(async (req, res) => {
    const person = input(req.body);
    const id = await tx(pool, async db => {
      const l = await link(db, req, req.params.id);
      await existsPerson(db, req.treeUserId, person.personId);
      const side = l.family_a === req.get('X-Family-Id') ? 'a' : 'b';
      const id = randomUUID();
      await db.query(`INSERT INTO family_connections(id,link_id,person_${side},kind,description)
        VALUES($1,$2,$3,$4,$5)`, [id, l.id, JSON.stringify(person), req.body.kind, req.body.description.trim()]);
      await audit(db, req, id, 'connection_proposed');
      return id;
    }); res.status(201).json({ id });
  }));
  router.patch('/connections/:id', route(async (req, res) => {
    const person = input(req.body);
    await tx(pool, async db => {
      const c = await connection(db, req, req.params.id);
      if (req.body.version !== c.version) fail(409, 'This proposal changed. Refresh and review the latest version.');
      await existsPerson(db, req.treeUserId, person.personId);
      await db.query(`UPDATE family_connections SET person_${c.side}=$1,kind=$2,description=$3,
        version=version+1,approved_a=NULL,approved_b=NULL WHERE id=$4`,
      [JSON.stringify(person), req.body.kind, req.body.description.trim(), req.params.id]);
      await audit(db, req, c.id, 'connection_revised');
    }); res.json({ ok: true });
  }));
  router.post('/connections/:id/approve', route(async (req, res) => {
    await tx(pool, async db => {
      const c = await connection(db, req, req.params.id);
      if (req.body?.version !== c.version) fail(409, 'This proposal changed. Review the latest version before approving.');
      if (!c.person_a || !c.person_b) fail(400, 'Both owners must select their local person before approval.');
      const families = await db.query('SELECT id,storage_user_id FROM families WHERE id=ANY($1::text[])', [[c.family_a, c.family_b]]);
      for (const f of families.rows) await existsPerson(db, f.storage_user_id, (f.id === c.family_a ? c.person_a : c.person_b).personId);
      await db.query(`UPDATE family_connections SET approved_${c.side}=version WHERE id=$1`, [c.id]);
      await audit(db, req, c.id, 'connection_approved');
    }); res.json({ ok: true });
  }));
  router.delete('/connections/:id', route(async (req, res) => {
    await tx(pool, async db => {
      const c = await connection(db, req, req.params.id);
      await db.query('UPDATE family_connections SET revoked=TRUE WHERE id=$1', [c.id]);
      await audit(db, req, c.id, 'connection_revoked');
    }); res.json({ ok: true });
  }));
  router.delete('/:id', route(async (req, res) => {
    await tx(pool, async db => {
      const l = await link(db, req, req.params.id);
      await db.query('UPDATE family_links SET active=FALSE WHERE id=$1', [l.id]);
      await db.query('UPDATE family_connections SET revoked=TRUE WHERE link_id=$1', [l.id]);
      await audit(db, req, l.id, 'family_disconnected');
    }); res.json({ ok: true });
  }));
  app.use('/api/family-links', router);
}
