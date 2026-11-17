import assert from 'node:assert/strict';
import test from 'node:test';
import { requireClerkKey } from '../clerkConfig';

// Deliberately invalid placeholder payloads; no real credentials.
const fixtures = {
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  CLERK_SECRET_KEY: 'sk_test_fixture',
  VITE_CLERK_PUBLISHABLE_KEY_PROD: 'pk_live_fixture',
  CLERK_SECRET_KEY_PROD: 'sk_live_fixture',
};

test('development selects only the existing development pair', () => {
  assert.equal(requireClerkKey(fixtures, false, 'publishable'), fixtures.VITE_CLERK_PUBLISHABLE_KEY);
  assert.equal(requireClerkKey(fixtures, false, 'secret'), fixtures.CLERK_SECRET_KEY);
});

test('production selects only the production pair', () => {
  assert.equal(requireClerkKey(fixtures, true, 'publishable'), fixtures.VITE_CLERK_PUBLISHABLE_KEY_PROD);
  assert.equal(requireClerkKey(fixtures, true, 'secret'), fixtures.CLERK_SECRET_KEY_PROD);
});

test('missing production keys never fall back to development', () => {
  const developmentOnly = { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture' };
  assert.throws(() => requireClerkKey(developmentOnly, true, 'publishable'), /VITE_CLERK_PUBLISHABLE_KEY_PROD/);
  assert.throws(() => requireClerkKey(developmentOnly, true, 'secret'), /CLERK_SECRET_KEY_PROD/);
});

test('rejects the wrong Clerk instance or key kind without exposing values', () => {
  assert.throws(() => requireClerkKey({ ...fixtures, CLERK_SECRET_KEY_PROD: 'sk_test_do_not_echo' }, true, 'secret'),
    error => error instanceof Error && error.message.includes('sk_live_') && !error.message.includes('do_not_echo'));
  assert.throws(() => requireClerkKey({ ...fixtures, VITE_CLERK_PUBLISHABLE_KEY_PROD: 'sk_live_do_not_echo' }, true, 'publishable'), /pk_live_/);
});
