import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import pg from 'pg';
import { ensureFamilySchema, familyScopeMiddleware, registerFamilyRoutes } from '../server/families';

test('family membership, privacy, invitations, and additive legacy migration', async t => {
  // An isolated schema exercises real Postgres without changing any app records.
  const schema = `family_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let pool: pg.Pool | undefined;
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`,
    });
    await pool.query(`
      CREATE TABLE people(user_id TEXT,id TEXT);
      CREATE TABLE tree_meta(user_id TEXT,root_id TEXT);
      CREATE TABLE marriages(user_id TEXT,id TEXT);
      CREATE TABLE documents(user_id TEXT,id TEXT);
      CREATE TABLE invites(email TEXT,invited_by_user_id TEXT,status TEXT);
      INSERT INTO people VALUES('legacy-owner','preserved-person');
      INSERT INTO tree_meta VALUES('legacy-owner','preserved-person');
      INSERT INTO documents VALUES('legacy-owner','preserved-document');
      INSERT INTO marriages VALUES('legacy-owner','preserved-marriage');
      INSERT INTO invites VALUES('legacy-guest@example.invalid','legacy-owner','pending');
    `);
    await ensureFamilySchema(pool);
    await ensureFamilySchema(pool);
    const db = pool;
    const app = express();
    app.use(express.json());
    // Test-only dependency injection, never installed in the real app.
    const auth = (req: any, res: any, next: any) => {
      const userId = req.get('X-Test-User');
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      req.auth = { userId };
      next();
    };
    registerFamilyRoutes(app, db, auth, async userId => ({
      userId, name: `${userId} Test`, email: `${userId}@example.invalid`,
      verifiedEmails: userId === 'unverified' ? [] : [`${userId}@example.invalid`],
    }));
    app.get('/api/test/tree-scope', auth, familyScopeMiddleware(db), (req: any, res) => {
      res.json({ storageId: req.treeUserId });
    });
    server = await new Promise(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const api = async (user: string, path: string, method = 'GET', body?: unknown, familyId?: string) => {
      const response = await fetch(base + path, {
        method, headers: {
          'Content-Type': 'application/json', ...(user ? { 'X-Test-User': user } : {}),
          ...(familyId ? { 'X-Family-Id': familyId } : {}),
        }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    let privateId = '';
    let publicId = '';
    let requestId = '';
    let token = '';

    await t.test('legacy records and pending invitations are preserved; repeat migration is idempotent', async () => {
      const context = await api('legacy-owner', '/api/families/context');
      assert.equal(context.status, 200);
      assert.equal(context.data.families.length, 1);
      assert.equal(context.data.families[0].discoverable, false);
      assert.equal(context.data.families[0].role, 'owner');
      const scope = await api('legacy-owner', '/api/test/tree-scope', 'GET', undefined, context.data.activeFamilyId);
      assert.equal(scope.data.storageId, 'legacy-owner');
      for (const table of ['people', 'tree_meta', 'marriages', 'documents', 'invites']) {
        assert.equal((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '1');
      }
      const guest = await api('legacy-guest', '/api/families/context');
      assert.equal(guest.data.invitations.length, 1);
    });

    await t.test('authentication and verified email are required; new users have no implicit tree', async () => {
      assert.equal((await api('', '/api/families/context')).status, 401);
      assert.equal((await api('unverified', '/api/families/context')).status, 403);
      const context = await api('new-user', '/api/families/context');
      assert.deepEqual(context.data.families, []);
      assert.equal(context.data.activeFamilyId, null);
      assert.equal((await api('new-user', '/api/test/tree-scope')).status, 403);
    });

    await t.test('new families default private; invalid input is rejected', async () => {
      assert.equal((await api('owner', '/api/families', 'POST', { name: ' ' })).status, 400);
      assert.equal((await api('owner', '/api/families', 'POST', { name: 'Wrong', discoverable: 'true' })).status, 400);
      const created = await api('owner', '/api/families', 'POST', { name: 'Test Heritage Private' });
      assert.equal(created.status, 201);
      assert.equal(created.data.family.discoverable, false);
      privateId = created.data.family.id;
      const publicFamily = await api('owner', '/api/families', 'POST', {
        name: 'Test Heritage Public', description: 'Searchable description only.', discoverable: true,
      });
      publicId = publicFamily.data.family.id;
    });

    await t.test('search returns only opted-in names and descriptions; private IDs cannot be joined', async () => {
      const result = await api('guest', '/api/families/search?q=Test%20Heritage');
      assert.equal(result.data.families.length, 1);
      assert.equal(result.data.families[0].id, publicId);
      assert.deepEqual(Object.keys(result.data.families[0]).sort(), ['description', 'id', 'name']);
      assert.deepEqual((await api('guest', '/api/families/search?q=%25%25')).data.families, []);
      assert.equal((await api('guest', `/api/families/${privateId}/requests`, 'POST')).status, 404);
      assert.equal((await api('guest', '/api/test/tree-scope', 'GET', undefined, privateId)).status, 403);
    });

    await t.test('requests are pending until owner approval; duplicates and non-owner decisions fail', async () => {
      assert.equal((await api('guest', `/api/families/${publicId}/requests`, 'POST', { message: 'A relative' })).status, 201);
      assert.equal((await api('guest', `/api/families/${publicId}/requests`, 'POST')).status, 409);
      assert.equal((await api('guest', '/api/test/tree-scope', 'GET', undefined, publicId)).status, 403);
      const context = await api('guest', '/api/families/context');
      assert.equal(context.data.requests[0].status, 'pending');
      requestId = context.data.requests[0].id;
      assert.equal((await api('guest', `/api/families/${publicId}/manage`)).status, 403);
      assert.equal((await api('outsider', `/api/families/${publicId}/requests/${requestId}/decision`, 'POST', { decision: 'approve' })).status, 403);
      assert.equal((await api('owner', `/api/families/${privateId}/requests/${requestId}/decision`, 'POST', { decision: 'approve' })).status, 404);
      assert.equal((await api('owner', `/api/families/${publicId}/requests/${requestId}/decision`, 'POST', { decision: 'approve' })).status, 200);
      const scope = await api('guest', '/api/test/tree-scope', 'GET', undefined, publicId);
      assert.equal(scope.data.storageId, publicId);
      assert.equal((await api('owner', `/api/families/${publicId}/requests/${requestId}/decision`, 'POST', { decision: 'reject' })).status, 409);
    });

    await t.test('rejecting requests grants no access', async () => {
      await api('rejected', `/api/families/${publicId}/requests`, 'POST');
      const context = await api('rejected', '/api/families/context');
      const id = context.data.requests[0].id;
      await api('owner', `/api/families/${publicId}/requests/${id}/decision`, 'POST', { decision: 'reject' });
      assert.equal((await api('rejected', '/api/families/context')).data.requests[0].status, 'rejected');
      assert.equal((await api('rejected', '/api/test/tree-scope', 'GET', undefined, publicId)).status, 403);
    });

    await t.test('invitations are hashed, email-bound, and cannot be reused', async () => {
      const invite = await api('owner', `/api/families/${privateId}/invitations`, 'POST', { email: 'INVITEE@example.invalid' });
      assert.equal(invite.status, 201);
      assert.equal(invite.data.emailSent, false); // no Origin: no email sent by tests
      token = invite.data.token;
      assert.ok(token.length >= 40);
      const stored = await db.query('SELECT token_hash FROM family_invitations WHERE id=$1', [invite.data.invitationId]);
      assert.notEqual(stored.rows[0].token_hash, token);
      assert.equal((await api('outsider', '/api/families/accept-invite', 'POST', { token })).status, 403);
      const context = await api('invitee', '/api/families/context');
      assert.equal(context.data.invitations[0].familyId, privateId);
      assert.equal((await api('invitee', '/api/families/accept-invite', 'POST', { token })).status, 200);
      assert.equal((await api('invitee', '/api/families/accept-invite', 'POST', { token })).status, 400);
      assert.equal((await api('invitee', '/api/test/tree-scope', 'GET', undefined, privateId)).data.storageId, privateId);
      assert.equal((await api('invitee', `/api/families/${privateId}`, 'PATCH', { name: 'Unauthorized', discoverable: true })).status, 403);
    });

    await t.test('revoked and expired invitations cannot grant membership', async () => {
      const revoked = await api('owner', `/api/families/${privateId}/invitations`, 'POST', { email: 'revoked@example.invalid' });
      await api('owner', `/api/families/${privateId}/invitations/${revoked.data.invitationId}`, 'DELETE');
      assert.equal((await api('revoked', '/api/families/accept-invite', 'POST', { token: revoked.data.token })).status, 400);
      const expired = await api('owner', `/api/families/${privateId}/invitations`, 'POST', { email: 'expired@example.invalid' });
      await db.query(`UPDATE family_invitations SET expires_at=NOW()-INTERVAL '1 day' WHERE id=$1`, [expired.data.invitationId]);
      assert.equal((await api('expired', '/api/families/accept-invite', 'POST', { token: expired.data.token })).status, 400);
    });

    await t.test('families remain isolated during switching and after opting out', async () => {
      assert.equal((await api('guest', `/api/families/${privateId}/activate`, 'POST')).status, 403);
      assert.equal((await api('owner', `/api/families/${privateId}/activate`, 'POST')).status, 200);
      assert.equal((await api('owner', '/api/families/context')).data.activeFamilyId, privateId);
      assert.equal((await api('owner', '/api/test/tree-scope', 'GET', undefined, publicId)).data.storageId, publicId);
      assert.equal((await api('owner', '/api/test/tree-scope', 'GET', undefined, privateId)).data.storageId, privateId);
      await api('owner', `/api/families/${publicId}`, 'PATCH', { name: 'Test Heritage Public', description: '', discoverable: false });
      assert.deepEqual((await api('guest', '/api/families/search?q=Test%20Heritage')).data.families, []);
      assert.equal((await api('guest', '/api/test/tree-scope', 'GET', undefined, publicId)).status, 200);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
