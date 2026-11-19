import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';

const EVENT_URL = 'https://growthflowai.app.senathltd.com/api/v1/events';
const operations: [string, RegExp, string][] = [
  ['POST', /^\/api\/families$/, 'family_created'],
  ['POST', /^\/api\/families\/accept-invite$/, 'family_invitation_accepted'],
  ['POST', /^\/api\/families\/[^/]+\/requests$/, 'family_join_requested'],
  ['POST', /^\/api\/families\/[^/]+\/requests\/[^/]+\/decision$/, 'family_join_request_reviewed'],
  ['POST', /^\/api\/families\/[^/]+\/invitations$/, 'family_invitation_created'],
  ['POST', /^\/api\/tree\/save-person$/, 'person_record_saved'],
  ['DELETE', /^\/api\/tree\/delete-person\/[^/]+$/, 'person_record_deleted'],
  ['POST', /^\/api\/ai\/bio$/, 'ai_biography_generated'],
  ['POST', /^\/api\/ai\/parse$/, 'ai_smart_entry_used'],
  ['POST', /^\/api\/ai\/narrative$/, 'ai_narrative_generated'],
  ['POST', /^\/api\/support\/contact$/, 'support_request_submitted'],
];

export function createProductEvents(options: {
  env?: NodeJS.ProcessEnv; fetch?: typeof fetch; warn?: (message: string) => void;
  loadContact?: (userId: string) => Promise<{ email?: string; name?: string }>;
} = {}) {
  const env = options.env ?? process.env;
  const request = options.fetch ?? fetch;
  const warn = options.warn ?? console.warn;
  const production = env.NODE_ENV === 'production';
  const key = production ? env.GROWTHFLOWAI_FT_API_KEY_PROD : env.GROWTHFLOWAI_FT_API_KEY_DEV;
  let active = 0;

  async function send(eventName: string, userId?: string, contact?: { email?: string; name?: string }, details?: { occurredAt: string }): Promise<boolean> {
    if (!key) {
      warn('GrowthFlowAI product events are not configured for this environment.');
      return false;
    }
    // Bound concurrent work; telemetry must never delay core application actions.
    if (active >= 20) {
      warn('GrowthFlowAI product event skipped: concurrency limit reached.');
      return false;
    }
    active += 1;
    try {
      if (!contact && userId && options.loadContact) contact = await options.loadContact(userId);
      const response = await request(EVENT_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          eventName,
          ...(contact?.email ? { contactEmail: contact.email } : {}),
          ...(contact?.name ? { contactName: contact.name } : {}),
          eventData: {
            source: 'replit',
            application: 'FamilyTreeAI',
            environment: production ? 'production' : 'development',
            ...(userId ? { userId: createHash('sha256').update(`familytreeai:${userId}`).digest('hex') } : {}),
            ...(details ? { occurredAt: details.occurredAt } : {}),
          },
        }),
      });
      if (!response.ok || (await response.json())?.success !== true) {
        warn(`GrowthFlowAI product event was not accepted (HTTP ${response.status}).`);
        return false;
      }
      return true;
    } catch {
      // No provider bodies, keys, request content, or user details in logs.
      warn('GrowthFlowAI product event delivery failed or timed out.');
      return false;
    } finally {
      active -= 1;
    }
  }

  const middleware: RequestHandler = (req: any, res, next) => {
    if (key && req.get('X-Product-Analytics-Consent') === 'granted') {
      const operation = operations.find(([method, path]) => method === req.method && path.test(req.path));
      if (operation) {
        res.once('finish', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            void send(operation[2], req.auth?.userId);
          }
        });
      }
    }
    next();
  };

  return { middleware, send, configured: Boolean(key) };
}
