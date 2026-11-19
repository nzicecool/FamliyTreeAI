import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import type { AddressInfo } from 'node:net';
import { ensureFamilyLinksSchema, registerFamilyLinkRoutes } from '../server/familyLinks';
import { audioRange, cleanupVoiceObjects, ensureVoiceSchema, inspectAudio, registerVoiceRoutes, type VoiceStore } from '../server/voices';

function wav(seconds = 1) {
  const samples = 8000 * seconds, b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(2000 * Math.sin(i * 2 * Math.PI * 440 / 8000)), 44 + i * 2);
  return b;
}
test('audio content, size, duration, and range validation', async () => {
  assert.equal((await inspectAudio(wav())).duration, 1);
  assert.equal((await inspectAudio(wav())).mimeType, 'audio/wav');
  await assert.rejects(inspectAudio(wav(181)), /three minutes/);
  await assert.rejects(inspectAudio(Buffer.from('<script>not audio</script>')), /Use MP3/);
  await assert.rejects(inspectAudio(Buffer.from('RIFFjunkWAVE')), /invalid|could not/);
  await assert.rejects(inspectAudio(Buffer.alloc(10 * 1024 * 1024 + 1)), /10 MB/);
  assert.deepEqual(audioRange('bytes=0-10', 100), { start: 0, end: 10 });
  assert.deepEqual(audioRange('bytes=50-', 100), { start: 50, end: 99 });
  assert.deepEqual(audioRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(audioRange(undefined, 100), null);
  for (const value of ['bytes=200-', 'bytes=-0', 'bytes=10-2', 'bytes=0-1,4-5', 'bad']) assert.throws(() => audioRange(value, 100));
});
test('private family links and voice memory persistence', async t => {
  const schema = `links_voice_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let pool: pg.Pool, server: ReturnType<ReturnType<typeof express>['listen']>;
  const objects = new Map<string, Buffer>();
  let failPut = false, failDelete = false;
  const store: VoiceStore = {
    async put(path, bytes) { if (failPut) throw new Error('test storage failure'); objects.set(path, bytes); },
    async get(path) { const b = objects.get(path); if (!b) throw new Error('missing'); return b; },
    async delete(path) { if (failDelete) throw new Error('test delete failure'); objects.delete(path); },
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
    await pool.query(`
      CREATE TABLE families(id TEXT PRIMARY KEY,name TEXT,discoverable BOOLEAN,owner_user_id TEXT,storage_user_id TEXT);
      CREATE TABLE family_memberships(family_id TEXT,user_id TEXT,role TEXT);
      CREATE TABLE people(user_id TEXT,id TEXT,first_name TEXT,last_name TEXT,PRIMARY KEY(user_id,id));
      INSERT INTO families VALUES('a','Alpha',FALSE,'alice','store_a'),('b','Beta',TRUE,'bob','store_b'),('c','Private C',FALSE,'chris','store_c');
      INSERT INTO family_memberships VALUES('a','alice','owner'),('b','bob','owner'),('c','chris','owner'),
        ('a','member_a','member'),('b','member_b','member');
      INSERT INTO people VALUES('store_a','pa','Alpha','Person'),('store_b','pb','Beta','Person'),('store_c','pc','Private','Person');
    `);
    await ensureFamilyLinksSchema(pool); await ensureFamilyLinksSchema(pool);
    await ensureVoiceSchema(pool); await ensureVoiceSchema(pool);
    const app = express();
    app.use(express.json());
    const auth = (req: any, res: any, next: any) => {
      const userId = req.get('X-Test-User');
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      req.auth = { userId }; next();
    };
    registerFamilyLinkRoutes(app, pool, auth); registerVoiceRoutes(app, pool, auth, store);
    // An unrelated API must not accidentally acquire a family requirement.
    app.get('/api/settings', (_req, res) => res.json({ ok: true }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const api = async (user: string, family: string, path: string, method = 'GET', body?: unknown, headers = {}) => {
      const res = await fetch(base + path, {
        method, headers: { ...(user ? { 'X-Test-User': user } : {}), ...(family ? { 'X-Family-Id': family } : {}),
          'Content-Type': Buffer.isBuffer(body) ? 'audio/wav' : 'application/json', ...headers },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
      return { res, status: res.status, data: res.headers.get('Content-Type')?.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
    const root = '/api/family-links';
    const aInput = { personId: 'pa', displayName: 'Chosen Alpha', birthYear: '1950', kind: 'marriage', description: 'Spouses' };
    const bInput = { personId: 'pb', displayName: 'Chosen Beta', kind: 'marriage', description: 'Spouses' };
    let linkId: string, connectionId: string, voiceId: string;
    await t.test('membership, owner roles, private discovery, and unrelated APIs', async () => {
      assert.equal((await api('', 'a', root)).status, 401);
      assert.equal((await api('bob', 'a', root)).status, 403);
      assert.equal((await api('member_a', 'a', `${root}/people`)).status, 403);
      assert.equal((await api('member_a', 'a', `${root}/invitations`, 'POST', {})).status, 403);
      assert.equal((await api('alice', 'a', `${root}/invitations`, 'POST', { targetFamilyId: 'c' })).status, 404);
      assert.equal((await api('alice', 'a', `${root}/invitations`, 'POST', { targetFamilyId: 'a' })).status, 400);
      assert.equal((await api('', '', '/api/settings')).status, 200);
      assert.equal((await api('alice', 'a', `${root}/people`)).data.people[0].personId, 'pa');
    });
    await t.test('private invitation binds target, is hashed, and is consumed once', async () => {
      const invite = await api('alice', 'a', `${root}/invitations`, 'POST', { targetFamilyId: 'b' });
      assert.equal(invite.status, 201);
      const { token } = invite.data;
      assert.notEqual((await pool.query('SELECT token_hash FROM family_link_invites LIMIT 1')).rows[0].token_hash, token);
      assert.equal((await api('alice', 'a', `${root}/invitations`, 'POST', { targetFamilyId: 'b' })).status, 409);
      assert.equal((await api('chris', 'c', `${root}/accept`, 'POST', { token })).status, 403);
      const accepted = await api('bob', 'b', `${root}/accept`, 'POST', { token });
      assert.equal(accepted.status, 200); linkId = accepted.data.id;
      assert.equal((await api('bob', 'b', `${root}/accept`, 'POST', { token })).status, 404);
      assert.deepEqual((await api('member_a', 'a', root)).data.links, []);
    });
    await t.test('proposals share only approved minimal snapshots; both owners approve same version', async () => {
      assert.equal((await api('alice', 'a', `${root}/${linkId}/connections`, 'POST', bInput)).status, 404);
      const created = await api('alice', 'a', `${root}/${linkId}/connections`, 'POST', aInput);
      assert.equal(created.status, 201); connectionId = created.data.id;
      assert.equal((await api('alice', 'a', `${root}/connections/${connectionId}/approve`, 'POST', { version: 1 })).status, 400);
      assert.equal((await api('bob', 'b', `${root}/connections/${connectionId}`, 'PATCH', { ...bInput, version: 1 })).status, 200);
      assert.equal((await api('alice', 'a', `${root}/connections/${connectionId}/approve`, 'POST', { version: 1 })).status, 409);
      const approvals = await Promise.all([
        api('alice', 'a', `${root}/connections/${connectionId}/approve`, 'POST', { version: 2 }),
        api('bob', 'b', `${root}/connections/${connectionId}/approve`, 'POST', { version: 2 }),
      ]);
      assert.ok(approvals.every(x => x.status === 200));
      const visible = await api('member_a', 'a', root);
      const c = visible.data.links[0].connections[0];
      assert.equal(c.active, true); assert.equal(c.local.personId, 'pa'); assert.equal(c.remote.displayName, 'Chosen Beta');
      assert.equal(c.remote.personId, ''); assert.equal(c.remote.bio, undefined);
      assert.equal(visible.res.headers.get('Cache-Control'), 'no-store');
      assert.equal((await api('member_a', 'b', '/api/person/pb/voices')).status, 403);
      assert.equal((await api('member_a', 'a', `${root}/connections/${connectionId}/approve`, 'POST', { version: 2 })).status, 403);
      await api('alice', 'a', `${root}/connections/${connectionId}`, 'PATCH', { ...aInput, displayName: 'Revised', version: 2 });
      assert.deepEqual((await api('member_a', 'a', root)).data.links, []);
      const latest = (await api('bob', 'b', root)).data.links[0].connections[0];
      assert.equal(latest.approvedByYou, false); assert.equal(latest.approvedByOther, false);
    });
    await t.test('multiple connections, deleted people, revocation, cancelled and expired invites', async () => {
      await api('alice', 'a', `${root}/${linkId}/connections`, 'POST', { ...aInput, kind: 'same_person' });
      assert.equal((await api('alice', 'a', root)).data.links[0].connections.length, 2);
      await api('alice', 'a', `${root}/connections/${connectionId}/approve`, 'POST', { version: 3 });
      await api('bob', 'b', `${root}/connections/${connectionId}/approve`, 'POST', { version: 3 });
      await pool.query(`DELETE FROM people WHERE id='pb'`);
      assert.deepEqual((await api('member_a', 'a', root)).data.links, []);
      await pool.query(`INSERT INTO people VALUES('store_b','pb','Beta','Person')`);
      assert.equal((await api('bob', 'b', `${root}/${linkId}`, 'DELETE')).status, 200);
      assert.deepEqual((await api('alice', 'a', root)).data.links, []);
      const cancelled = await api('alice', 'a', `${root}/invitations`, 'POST', {});
      const invitations = (await api('alice', 'a', root)).data.invitations;
      await api('alice', 'a', `${root}/invitations/${invitations[0].id}`, 'DELETE');
      assert.equal((await api('bob', 'b', `${root}/accept`, 'POST', { token: cancelled.data.token })).status, 404);
      const expired = await api('alice', 'a', `${root}/invitations`, 'POST', {});
      await pool.query(`UPDATE family_link_invites SET expires_at=NOW()-INTERVAL '1 day' WHERE status='pending'`);
      assert.equal((await api('bob', 'b', `${root}/accept`, 'POST', { token: expired.data.token })).status, 404);
    });
    await t.test('audio upload persists, streams ranges, and remains family-private', async () => {
      const created = await api('alice', 'a', '/api/person/pa/voices?title=Family%20memory', 'POST', wav());
      assert.equal(created.status, 201); voiceId = created.data.id;
      assert.equal(created.data.duration, 1); assert.equal(created.data.object_path, undefined);
      const list = await api('member_a', 'a', '/api/person/pa/voices');
      assert.equal(list.data[0].id, voiceId);
      const content = await api('member_a', 'a', `/api/voices/${voiceId}/audio`, 'GET', undefined, { Range: 'bytes=0-15' });
      assert.equal(content.status, 206); assert.equal(content.data.length, 16);
      assert.equal(content.res.headers.get('Content-Range'), `bytes 0-15/${wav().length}`);
      assert.equal((await api('bob', 'b', `/api/voices/${voiceId}/audio`)).status, 404);
      assert.equal((await api('bob', 'a', `/api/voices/${voiceId}/audio`)).status, 403);
      assert.equal((await api('member_a', 'a', `/api/voices/${voiceId}/audio`, 'GET', undefined, { Range: 'bytes=999999-' })).status, 416);
    });
    await t.test('invalid uploads fail; storage failures retain durable cleanup metadata', async () => {
      assert.equal((await api('alice', 'a', '/api/person/pa/voices?title=Bad', 'POST', Buffer.from('not audio'))).status, 400);
      assert.equal((await api('alice', 'a', '/api/person/pa/voices?title=Long', 'POST', wav(181))).status, 400);
      assert.equal((await api('alice', 'a', '/api/person/pa/voices?title=Big', 'POST', Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
      assert.equal((await api('alice', 'a', '/api/person/pa/voices?title=', 'POST', wav())).status, 400);
      failPut = true; failDelete = true;
      const failed = await api('alice', 'a', '/api/person/pa/voices?title=Failed', 'POST', wav());
      assert.equal(failed.status, 503); assert.doesNotMatch(failed.data.error, /test storage/);
      const pending = await pool.query(`SELECT id FROM voice_memories WHERE status='deleting'`);
      assert.equal(pending.rowCount, 1);
      failPut = false; failDelete = false;
      await cleanupVoiceObjects(pool, store);
      assert.equal((await pool.query(`SELECT id FROM voice_memories WHERE status='deleting'`)).rowCount, 0);
      assert.equal((await api('alice', 'a', `/api/voices/${voiceId}`, 'DELETE')).status, 200);
      assert.equal(objects.size, 0);
      assert.equal((await api('member_a', 'a', `/api/voices/${voiceId}/audio`)).status, 404);
    });
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
