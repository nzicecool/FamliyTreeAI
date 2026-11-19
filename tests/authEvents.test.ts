import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAuthEventHandler, ensureAuthEventsSchema, trackingIdentity } from '../server/authEvents';

test('identity uses only verified Clerk addresses and genuine names', () => {
  const user = {
    id: 'user-fixture', createdAt: 123, firstName: 'Test', lastName: 'Person', primaryEmailAddressId: 'unverified',
    emailAddresses: [
      { id: 'unverified', emailAddress: 'fake@example.invalid', verification: { status: 'unverified' } },
      { id: 'verified', emailAddress: 'REAL@example.invalid', verification: { status: 'verified' } },
    ],
  };
  assert.deepEqual(trackingIdentity(user), { userId: 'user-fixture', createdAt: 123, email: 'real@example.invalid', name: 'Test Person' });
  assert.deepEqual(trackingIdentity({ ...user, firstName: null, lastName: null, emailAddresses: [] }), { userId: 'user-fixture', createdAt: 123 });
});

test('authentication lifecycle events are consented, verified, durable, and never count a visit as signup', async t => {
  const schema = `auth_events_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let pool: pg.Pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
    await ensureAuthEventsSchema(pool);
    await ensureAuthEventsSchema(pool);
    const enabledAt = Date.now() - 60_000;
    await pool.query(`UPDATE growthflow_auth_config SET enabled_at=$1`, [new Date(enabledAt)]);
    const sent: any[] = [];
    let lookupCount = 0, accepted = true, mismatch = false;
    const options = {
      pool, environment: 'development', configured: true,
      loadIdentity: async (userId: string) => {
        lookupCount++;
        return { userId, createdAt: userId.startsWith('old') ? enabledAt - 1_000_000 : enabledAt + 1000, email: 'verified@example.invalid', name: 'Verified User' };
      },
      loadSession: async (id: string) => ({
        userId: mismatch ? 'another-user' : id.split(':')[0],
        createdAt: id.includes('old-session') ? enabledAt - 10000 : enabledAt + 2000, status: 'active',
      }),
      send: async (...args: any[]) => { sent.push(args); return accepted; },
      warn: () => {},
    };
    let handler = createAuthEventHandler(options);
    const run = async (userId: string, sessionId: string, consent = true) => {
      let status = 0;
      await handler({
        get: () => consent ? 'granted' : undefined, auth: userId ? { userId, sessionId } : undefined,
        body: { contactEmail: 'spoofed@example.invalid', isSignUp: true },
      } as any, { set: () => {}, sendStatus: (s: number) => { status = s; } } as any, () => {});
      return status;
    };
    await t.test('no consent, no session, or wrong session ownership sends nothing', async () => {
      assert.equal(await run('new-user', 'new-user:1', false), 204);
      assert.equal(lookupCount, 0);
      assert.equal(await run('', ''), 401);
      mismatch = true;
      assert.equal(await run('new-user', 'new-user:1'), 401);
      mismatch = false;
      assert.equal(sent.length, 0);
    });
    await t.test('new account produces signup, signin, and app session with server identity', async () => {
      assert.equal(await run('new-user', 'new-user:1'), 204);
      assert.deepEqual(sent.map(s => s[0]), ['user_signed_up', 'user_signed_in', 'app_session_started']);
      assert.equal(sent[0][2].email, 'verified@example.invalid');
      assert.equal(sent[0][2].name, 'Verified User');
      assert.equal(sent[0][3].occurredAt, new Date(enabledAt + 1000).toISOString());
      assert.ok(!JSON.stringify(sent).includes('spoofed'));
    });
    await t.test('reloads, concurrent tabs, new server instances do not repeat events', async () => {
      handler = createAuthEventHandler(options);
      assert.equal(await run('new-user', 'new-user:1'), 204);
      assert.equal(sent.length, 3);
      await Promise.all([run('new-user', 'new-user:2'), run('new-user', 'new-user:2')]);
      assert.equal(sent.filter(s => s[0] === 'user_signed_up').length, 1);
      assert.equal(sent.filter(s => s[0] === 'user_signed_in').length, 2);
      assert.equal(sent.filter(s => s[0] === 'app_session_started').length, 2);
    });
    await t.test('existing account can sign in but is never mislabelled a new signup', async () => {
      const start = sent.length;
      assert.equal(await run('old-user', 'old-user:1'), 204);
      assert.deepEqual(sent.slice(start).map(s => s[0]), ['user_signed_in', 'app_session_started']);
      const next = sent.length;
      assert.equal(await run('old-user', 'old-user:old-session'), 204);
      assert.deepEqual(sent.slice(next).map(s => s[0]), ['app_session_started']);
    });
    await t.test('unconfirmed provider deliveries are recorded without blind automatic replay', async () => {
      accepted = false;
      assert.equal(await run('failed-user', 'failed-user:1'), 202);
      const count = sent.length;
      handler = createAuthEventHandler(options);
      assert.equal(await run('failed-user', 'failed-user:1'), 202);
      assert.equal(sent.length, count);
      assert.ok((await pool.query(`SELECT status FROM growthflow_auth_deliveries WHERE status='unconfirmed'`)).rowCount > 0);
      const persisted = (await pool.query('SELECT * FROM growthflow_auth_deliveries')).rows;
      assert.ok(!JSON.stringify(persisted).includes('verified@example.invalid'));
    });
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
