import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerSupportRoutes } from '../server/support';

const valid = { name: 'Test User', email: 'test@example.com', subject: 'Test request', message: 'This is a test support request.', website: '' };

async function setup(
  t: any,
  env: NodeJS.ProcessEnv = { NODE_ENV: 'development', GROWTHFLOWAI_API_KEY_DEV: 'test-development-key' },
  reply: () => Response | Promise<Response> = () => Response.json({ success: true, ticket: { id: 'test' } }),
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const app = express();
  registerSupportRoutes(app, { env, fetch: (async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return reply();
  }) as typeof fetch });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const post = (body: unknown = valid, extraHeaders = {}) => fetch(`http://127.0.0.1:${address.port}/api/support/contact`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body),
  });
  return { post, calls };
}

test('forwards validated tickets with the development key server-side', async t => {
  const { post, calls } = await setup(t);
  const result = await post();
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { success: true });
  assert.equal(calls[0].url, 'https://growthflowai.app.senathltd.com/api/v1/tickets');
  assert.equal((calls[0].init.headers as any).Authorization, 'Bearer test-development-key');
  const payload = JSON.parse(calls[0].init.body as string);
  assert.equal(payload.submitterEmail, valid.email);
  assert.equal(payload.description, valid.message);
  assert.equal(payload.subject, '[FamilyTreeAI] Test request');
});

test('rejects invalid fields, honeypots, oversize fields and cross-site requests', async t => {
  const { post, calls } = await setup(t);
  for (const body of [
    {}, { ...valid, email: 'invalid' }, { ...valid, website: 'spam' },
    { ...valid, message: 'short' }, { ...valid, subject: 'x'.repeat(161) }, { ...valid, name: 123 },
  ]) assert.equal((await post(body)).status, 400);
  assert.equal((await post(valid, { Origin: 'https://other.example' })).status, 403);
  assert.equal(calls.length, 0);
});

test('production never falls back to the development key', async t => {
  const { post, calls } = await setup(t, { NODE_ENV: 'production', GROWTHFLOWAI_API_KEY_DEV: 'test-development-key' });
  assert.equal((await post()).status, 503);
  assert.equal(calls.length, 0);
});

test('production selects only the production key', async t => {
  const { post, calls } = await setup(t, { NODE_ENV: 'production', GROWTHFLOWAI_API_KEY_DEV: 'dev', GROWTHFLOWAI_API_KEY_PROD: 'prod' });
  assert.equal((await post()).status, 201);
  assert.equal((calls[0].init.headers as any).Authorization, 'Bearer prod');
});

test('provider failures remain failures without leaking response data', async t => {
  const { post } = await setup(t, undefined, () => new Response('sensitive upstream details', { status: 401 }));
  const response = await post();
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('sensitive'));
});

test('network failures and unconfirmed provider responses never report success', async t => {
  let failNetwork = true;
  const { post } = await setup(t, undefined, () => {
    if (failNetwork) throw new Error('test timeout');
    return Response.json({ success: false });
  });
  assert.equal((await post()).status, 502);
  failNetwork = false;
  assert.equal((await post()).status, 502);
});

test('limits repeated submissions for one email', async t => {
  const { post, calls } = await setup(t);
  for (let i = 0; i < 3; i++) assert.equal((await post()).status, 201);
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '900');
  assert.equal(calls.length, 3);
});
