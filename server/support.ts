import express, { type Express } from 'express';
import { createHash } from 'node:crypto';

const TICKET_URL = 'https://growthflowai.app.senathltd.com/api/v1/tickets';
const WINDOW_MS = 15 * 60 * 1000;

export function registerSupportRoutes(
  app: Express,
  options: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; now?: () => number } = {},
) {
  const env = options.env ?? process.env;
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const attempts = new Map<string, { count: number; expires: number }>();
  const consume = (key: string, limit: number) => {
    const time = now();
    for (const [id, entry] of attempts) if (entry.expires <= time) attempts.delete(id);
    const entry = attempts.get(key) ?? { count: 0, expires: time + WINDOW_MS };
    if (entry.count >= limit || (!attempts.has(key) && attempts.size >= 5000)) return false;
    entry.count += 1;
    attempts.set(key, entry);
    return true;
  };

  app.post('/api/support/contact', express.json({ limit: '12kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Browser submissions must originate here, not from another site's form.
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site'
      || (origin && (() => {
        try { return new URL(origin).host !== req.get('host'); } catch { return true; }
      })())) {
      return res.status(403).json({ error: 'Please submit support requests from this app.' });
    }
    if (!consume(`ip:${req.ip}`, 20)) {
      res.set('Retry-After', '900');
      return res.status(429).json({ error: 'Too many requests. Please wait 15 minutes and try again.' });
    }
    const body = req.body ?? {};
    const limits = { name: 100, email: 254, subject: 160, message: 5000 };
    const fields: Record<string, string> = {};
    for (const [key, max] of Object.entries(limits)) {
      if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > max) {
        return res.status(400).json({ error: `Please enter a valid ${key} (maximum ${max} characters).` });
      }
      fields[key] = body[key].trim();
    }
    if (body.website || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || fields.message.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid email and a message of at least 10 characters.' });
    }
    const apiKey = env.NODE_ENV === 'production'
      ? env.GROWTHFLOWAI_API_KEY_PROD : env.GROWTHFLOWAI_API_KEY_DEV;
    if (!apiKey) {
      return res.status(503).json({ error: 'Support submissions are not configured in this environment yet. Please try again later.' });
    }
    const emailHash = createHash('sha256').update(fields.email.toLowerCase()).digest('hex');
    if (!consume(`email:${emailHash}`, 3)) {
      res.set('Retry-After', '900');
      return res.status(429).json({ error: 'Too many requests for this email. Please wait 15 minutes.' });
    }
    try {
      const upstream = await request(TICKET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          subject: `[FamilyTreeAI] ${fields.subject}`,
          description: fields.message,
          submitterName: fields.name,
          submitterEmail: fields.email,
          priority: 'medium',
          metadata: { application: 'FamilyTreeAI', environment: env.NODE_ENV === 'production' ? 'production' : 'development' },
        }),
      });
      if (!upstream.ok) {
        // Never forward provider bodies: they may contain credentials or personal details.
        console.error('Support provider rejected submission:', upstream.status);
        return res.status(502).json({ error: 'Your request could not be delivered. Please try again later.' });
      }
      const result = await upstream.json();
      if (!result || result.success === false || result.error) {
        return res.status(502).json({ error: 'The support service could not confirm your request. Please try again later.' });
      }
      return res.status(201).json({ success: true });
    } catch {
      return res.status(502).json({ error: 'The support service is unavailable or timed out. Please try again later.' });
    }
  });
}
