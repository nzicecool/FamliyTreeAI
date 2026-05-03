/**
 * Server-side encryption helpers for BYO API keys at rest.
 *
 * Algorithm: AES-256-GCM with a 96-bit IV per record.
 * - Master key: 32 bytes. Sourced from ENCRYPTION_KEY env (base64), or
 *   derived deterministically from CLERK_SECRET_KEY via scrypt as a fallback
 *   so the app works out-of-the-box on Replit without an extra secret.
 * - Each ciphertext is bound to (userId, provider) via AES-GCM AAD, so a
 *   stolen DB cannot have rows swapped between users/providers.
 * - Encoded format (string): `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>`.
 *
 * Decryption only happens at the moment of an authenticated LLM call —
 * never in GET /api/settings (which only returns booleans).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const FORMAT_PREFIX = 'v1';

let cachedMasterKey: Buffer | null = null;

function loadMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit) {
    try {
      const buf = Buffer.from(explicit, 'base64');
      if (buf.length === 32) {
        cachedMasterKey = buf;
        return cachedMasterKey;
      }
      console.warn(
        `ENCRYPTION_KEY is set but is ${buf.length} bytes after base64 decode (need 32). Falling back to derived key.`,
      );
    } catch {
      console.warn('ENCRYPTION_KEY could not be base64-decoded. Falling back to derived key.');
    }
  }

  const seed = process.env.CLERK_SECRET_KEY;
  if (!seed) {
    throw new Error(
      'No encryption key material available. Set ENCRYPTION_KEY (base64, 32 bytes) or CLERK_SECRET_KEY.',
    );
  }
  // Fixed salt: stable across restarts so existing rows decrypt; tied to this app.
  cachedMasterKey = scryptSync(seed, 'familytreeai/byo-keys/v1', 32);
  return cachedMasterKey;
}

function aad(userId: string, provider: string): Buffer {
  return Buffer.from(`${userId}|${provider}`, 'utf8');
}

export function encryptString(plaintext: string, userId: string, provider: string): string {
  const key = loadMasterKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(aad(userId, provider));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Returns null on any failure (wrong key, tampered ciphertext, legacy plaintext, etc.)
 * so callers can treat the key as "not configured" without throwing into the request path.
 */
export function decryptString(blob: string | null | undefined, userId: string, provider: string): string | null {
  if (!blob) return null;
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) return null;
  // Master-key config errors must bubble up (signals server misconfiguration).
  // Only ciphertext-level failures (tamper, wrong AAD, corruption) degrade to null.
  const key = loadMasterKey();
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAAD(aad(userId, provider));
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Validates encryption setup at startup. Throws if no key material is
 * available, and round-trips a test value to catch any algorithm/version drift.
 * Call this once during server boot so misconfiguration fails fast.
 */
export function selfCheck(): void {
  const probe = encryptString('selfcheck-probe', 'selfcheck', 'selfcheck');
  const back = decryptString(probe, 'selfcheck', 'selfcheck');
  if (back !== 'selfcheck-probe') {
    throw new Error('Encryption self-check failed: roundtrip did not match.');
  }
}

export function isEncryptedBlob(value: string | null | undefined): boolean {
  return !!value && value.startsWith(`${FORMAT_PREFIX}:`);
}
