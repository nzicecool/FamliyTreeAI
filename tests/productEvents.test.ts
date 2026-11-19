import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createProductEvents } from '../server/productEvents';
import { analyticsConsentGranted, productAnalyticsHeaders } from '../services/productEvents';

test('selects event keys per environment and never uses support or development keys in production', async () => {
  const calls: any[] = [];
  const request = (async (_url: unknown, init: any) => {
    calls.push(init);
    return Response.json({ success: true });
  }) as typeof fetch;
  const missing = createProductEvents({
    env: { NODE_ENV: 'production', GROWTHFLOWAI_API_KEY_PROD: 'support-fixture', GROWTHFLOWAI_FT_API_KEY_DEV: 'dev-fixture' },
    fetch: request, warn: () => {},
  });
  assert.equal(await missing.send('test_event'), false);
  assert.equal(calls.length, 0);
  for (const [environment, expected] of [['development', 'dev-fixture'], ['production', 'prod-fixture']]) {
    const events = createProductEvents({
      env: { NODE_ENV: environment, GROWTHFLOWAI_FT_API_KEY_DEV: 'dev-fixture', GROWTHFLOWAI_FT_API_KEY_PROD: 'prod-fixture' },
      fetch: request,
    });
    assert.equal(await events.send('test_event', 'clerk-test-user'), true);
    assert.equal(calls.at(-1).headers.Authorization, `Bearer ${expected}`);
    const data = JSON.parse(calls.at(-1).body);
    assert.equal(data.eventData.environment, environment);
    assert.equal(data.contactEmail, undefined);
    assert.equal(data.contactName, undefined);
    assert.match(data.eventData.userId, /^[a-f0-9]{64}$/);
    assert.ok(!calls.at(-1).body.includes('clerk-test-user'));
  }
});

test('provider rejection, invalid response and network failures return false without secrets in logs', async () => {
  for (const response of [
    () => new Response('secret upstream details', { status: 403 }),
    () => Response.json({ success: false }),
    () => { throw new Error('private error'); },
  ]) {
    const warnings: string[] = [];
    const events = createProductEvents({
      env: { GROWTHFLOWAI_FT_API_KEY_DEV: 'private-fixture' },
      fetch: (async () => response()) as typeof fetch,
      warn: message => warnings.push(message),
    });
    assert.equal(await events.send('test_event'), false);
    assert.equal(warnings.length, 1);
    assert.ok(!warnings.join().includes('private'));
    assert.ok(!warnings.join().includes('secret'));
  }
});

test('only successful allowlisted operations with analytics consent produce events', async t => {
  const received: any[] = [];
  const events = createProductEvents({
    env: { GROWTHFLOWAI_FT_API_KEY_DEV: 'fixture' },
    fetch: (async (_url, init) => {
      received.push(JSON.parse(init!.body as string));
      return Response.json({ success: true });
    }) as typeof fetch,
  });
  const app = express();
  app.use(events.middleware);
  app.post('/api/tree/save-person', (req: any, res) => {
    req.auth = { userId: 'fixture-user' };
    res.sendStatus(req.get('X-Test-Failure') ? 400 : 200);
  });
  app.post('/api/unknown', (_req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  for (const headers of [{}, { 'X-Product-Analytics-Consent': 'denied' }, { 'X-Product-Analytics-Consent': 'granted', 'X-Test-Failure': '1' }]) {
    await fetch(`${base}/api/tree/save-person`, { method: 'POST', headers: headers as Record<string, string> });
  }
  await fetch(`${base}/api/unknown`, { method: 'POST', headers: { 'X-Product-Analytics-Consent': 'granted' } });
  assert.equal(received.length, 0);
  await fetch(`${base}/api/tree/save-person`, { method: 'POST', headers: { 'X-Product-Analytics-Consent': 'granted' } });
  assert.equal(received.length, 1);
  assert.equal(received[0].eventName, 'person_record_saved');
  assert.deepEqual(Object.keys(received[0].eventData).sort(), ['application', 'environment', 'source', 'userId']);
});

test('authenticated operations attach trusted contact details using the documented top-level fields', async () => {
  const received: any[] = [];
  const events = createProductEvents({
    env: { GROWTHFLOWAI_FT_API_KEY_DEV: 'fixture' },
    loadContact: async id => {
      assert.equal(id, 'clerk-fixture');
      return { email: 'verified@example.invalid', name: 'Verified Fixture' };
    },
    fetch: (async (_url, init) => {
      received.push(JSON.parse(init!.body as string));
      return Response.json({ success: true });
    }) as typeof fetch,
  });
  assert.equal(await events.send('person_record_saved', 'clerk-fixture'), true);
  assert.equal(received[0].contactEmail, 'verified@example.invalid');
  assert.equal(received[0].contactName, 'Verified Fixture');
  assert.equal(received[0].eventData.contactEmail, undefined);
  assert.equal(received[0].eventData.source, 'replit');
});

test('browser consent headers default to off and follow the actual analytics preference', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let saved: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => saved } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as any).localStorage;
  });
  for (const value of [null, 'invalid JSON', '{"prefs":{"analytics":false}}', '{"prefs":{"analytics":"true"}}']) {
    saved = value;
    assert.equal(analyticsConsentGranted(), false);
    assert.deepEqual(productAnalyticsHeaders(), {});
  }
  saved = '{"prefs":{"analytics":true}}';
  assert.deepEqual(productAnalyticsHeaders(), { 'X-Product-Analytics-Consent': 'granted' });
  saved = '{"prefs":{"analytics":false}}';
  assert.deepEqual(productAnalyticsHeaders(), {});
});
