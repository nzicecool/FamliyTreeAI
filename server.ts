import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { complete, ProviderId, ALL_PROVIDERS, ProviderKeys, PERSON_JSON_HINT } from './aiProviders';
import { encryptString, decryptString, selfCheck as encryptionSelfCheck } from './cryptoUtil';

const SUPERADMIN_EMAIL = 'myozscoop@gmail.com';
const BYO_PROVIDERS = ['openai', 'anthropic', 'glm', 'kimi'] as const;
type BYOProvider = typeof BYO_PROVIDERS[number];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS people (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT 'Unknown',
      last_name TEXT NOT NULL DEFAULT 'Unknown',
      gender TEXT NOT NULL DEFAULT 'Other',
      birth_date TEXT,
      birth_place TEXT,
      death_date TEXT,
      death_place TEXT,
      bio TEXT,
      photo TEXT,
      father_id TEXT,
      mother_id TEXT,
      spouse_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      children_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS people_user_id_idx ON people(user_id);
    CREATE TABLE IF NOT EXISTS tree_meta (
      user_id TEXT PRIMARY KEY,
      root_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS invites (
      email TEXT PRIMARY KEY,
      invited_by_user_id TEXT NOT NULL,
      invited_by_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'gemini',
      openai_key TEXT,
      anthropic_key TEXT,
      glm_key TEXT,
      kimi_key TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

interface RawUserSettings {
  provider: ProviderId;
  encryptedKeys: { openai: string | null; anthropic: string | null; glm: string | null; kimi: string | null };
}

/**
 * Loads the raw row. Encrypted ciphertext is NOT decrypted here — callers that
 * actually need plaintext (i.e. the LLM dispatcher) call `decryptUserKeys`.
 * GET /api/settings only inspects whether each blob is non-null and never
 * touches the master key.
 */
async function loadUserSettingsRaw(userId: string): Promise<RawUserSettings> {
  const res = await pool.query(
    'SELECT provider, openai_key, anthropic_key, glm_key, kimi_key FROM user_settings WHERE user_id = $1',
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return { provider: 'gemini', encryptedKeys: { openai: null, anthropic: null, glm: null, kimi: null } };
  }
  const provider = (ALL_PROVIDERS as string[]).includes(row.provider) ? (row.provider as ProviderId) : 'gemini';
  return {
    provider,
    encryptedKeys: {
      openai: row.openai_key,
      anthropic: row.anthropic_key,
      glm: row.glm_key,
      kimi: row.kimi_key,
    },
  };
}

/**
 * Decrypts BYO keys for the authenticated user. Bound to (userId, provider)
 * via AAD; tampered or wrong-user rows decrypt to null and behave as
 * "not configured", causing the dispatcher to fall back to Gemini.
 */
function decryptUserKeys(raw: RawUserSettings, userId: string): ProviderKeys {
  return {
    openai: decryptString(raw.encryptedKeys.openai, userId, 'openai'),
    anthropic: decryptString(raw.encryptedKeys.anthropic, userId, 'anthropic'),
    glm: decryptString(raw.encryptedKeys.glm, userId, 'glm'),
    kimi: decryptString(raw.encryptedKeys.kimi, userId, 'kimi'),
  };
}

function publicSettings(raw: RawUserSettings) {
  return {
    provider: raw.provider,
    configured: {
      openai: !!raw.encryptedKeys.openai,
      anthropic: !!raw.encryptedKeys.anthropic,
      glm: !!raw.encryptedKeys.glm,
      kimi: !!raw.encryptedKeys.kimi,
    },
    hasGeminiServerKey: !!process.env.GEMINI_API_KEY,
  };
}

type DbPerson = {
  user_id: string;
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  bio: string | null;
  photo: string | null;
  father_id: string | null;
  mother_id: string | null;
  spouse_ids: string[];
  children_ids: string[];
};

function formatPersonLine(p: any): string {
  const parts = [`${p.firstName} ${p.lastName} (${p.gender})`];
  if (p.birthDate || p.birthPlace) parts.push(`born ${p.birthDate || '?'}${p.birthPlace ? ` in ${p.birthPlace}` : ''}`);
  if (p.deathDate || p.deathPlace) parts.push(`died ${p.deathDate || '?'}${p.deathPlace ? ` in ${p.deathPlace}` : ''}`);
  if (p.bio) parts.push(`notes: ${String(p.bio).slice(0, 200)}`);
  return parts.join('; ');
}

function buildNarrativePrompt(data: any, focusId: string | null, maxPeople = 80): string {
  const byId = data.people || {};
  const people = Object.values(byId) as any[];
  if (people.length === 0) return 'The tree has no people yet. Reply: "There are no records yet to write a narrative from."';

  const focusPerson = (focusId && byId[focusId]) || byId[data.rootId] || people[0];
  const focusName = focusPerson ? `${focusPerson.firstName} ${focusPerson.lastName}` : 'the family';

  const include = new Set<string>();
  const queue: string[] = [];
  if (focusPerson) {
    include.add(focusPerson.id);
    queue.push(focusPerson.id);
  }
  while (queue.length && include.size < maxPeople) {
    const id = queue.shift()!;
    const p = byId[id];
    if (!p) continue;
    [p.fatherId, p.motherId].forEach((pid: string | null) => {
      if (pid && byId[pid] && !include.has(pid)) {
        include.add(pid);
        queue.push(pid);
      }
    });
    (p.childrenIds || []).forEach((cid: string) => {
      if (byId[cid] && !include.has(cid)) {
        include.add(cid);
        queue.push(cid);
      }
    });
    (p.spouseIds || []).forEach((sid: string) => {
      if (byId[sid] && !include.has(sid)) include.add(sid);
    });
  }
  for (const p of people) {
    if (include.size >= maxPeople) break;
    include.add(p.id);
  }

  const lines: string[] = [];
  lines.push(`Focus person: ${focusName}.`);
  lines.push(`Total people on record: ${people.length}. People included below: ${include.size}.`);
  lines.push('', 'People:');
  Array.from(include).forEach(id => {
    const p = byId[id];
    if (p) lines.push(`- ${formatPersonLine(p)}`);
  });
  lines.push('', 'Relationships:');
  Array.from(include).forEach(id => {
    const p = byId[id];
    if (!p) return;
    const name = `${p.firstName} ${p.lastName}`;
    const father = p.fatherId ? byId[p.fatherId] : null;
    const mother = p.motherId ? byId[p.motherId] : null;
    if (father) lines.push(`- ${name} — father: ${father.firstName} ${father.lastName}`);
    if (mother) lines.push(`- ${name} — mother: ${mother.firstName} ${mother.lastName}`);
    (p.spouseIds || []).forEach((sid: string) => {
      const sp = byId[sid];
      if (sp && sid > p.id) lines.push(`- ${name} — spouse: ${sp.firstName} ${sp.lastName}`);
    });
  });

  return `
You are a warm, careful family historian. Using ONLY the records below, write a flowing narrative
history of this family centered on the focus person. Span generations where the records allow.
Group related people into paragraphs (e.g. by generation or branch). Mention dates and places when given.
Do NOT invent specific facts (children, spouses, dates, places, occupations) that are not in the records.
You may add gentle historical context for an era or place if a date is provided.
If information is sparse, say so plainly rather than padding with speculation.
Length: roughly 350–600 words. Use plain prose, no markdown headers, no bullet lists.

Records:
${lines.join('\n')}
  `.trim();
}

function rowToPerson(row: DbPerson) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    birthDate: row.birth_date ?? undefined,
    birthPlace: row.birth_place ?? undefined,
    deathDate: row.death_date ?? undefined,
    deathPlace: row.death_place ?? undefined,
    bio: row.bio ?? undefined,
    photo: row.photo ?? undefined,
    fatherId: row.father_id,
    motherId: row.mother_id,
    spouseIds: row.spouse_ids ?? [],
    childrenIds: row.children_ids ?? [],
  };
}

async function startServer() {
  const app = express();
  const PORT = 5000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const secretKey = process.env.CLERK_SECRET_KEY;
  const clerkClient = secretKey ? createClerkClient({ secretKey }) : null;

  const authenticate = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const sessionClaims = await verifyToken(token, { secretKey });
      req.auth = { userId: sessionClaims.sub };
      next();
    } catch (error) {
      console.error('Clerk auth error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const requireAdmin = async (req: any, res: any, next: any) => {
    try {
      if (!clerkClient) {
        return res.status(500).json({ error: 'Server auth not configured' });
      }
      const user = await clerkClient.users.getUser(req.auth.userId);
      const email = user.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
      const role = (user.publicMetadata as any)?.role;
      const isAdmin =
        email === SUPERADMIN_EMAIL.toLowerCase() ||
        role === 'admin' ||
        role === 'superadmin';
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    } catch (error) {
      console.error('Admin check failed:', error);
      res.status(403).json({ error: 'Forbidden' });
    }
  };

  // ----- Tree -----
  app.get('/api/tree/load', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    try {
      const peopleRes = await pool.query<DbPerson>(
        'SELECT * FROM people WHERE user_id = $1',
        [userId]
      );
      const people: Record<string, any> = {};
      for (const row of peopleRes.rows) {
        people[row.id] = rowToPerson(row);
      }

      const metaRes = await pool.query(
        'SELECT root_id FROM tree_meta WHERE user_id = $1',
        [userId]
      );
      const rootId = metaRes.rows[0]?.root_id ?? (Object.keys(people)[0] ?? '');

      res.json({ rootId, people });
    } catch (error: any) {
      console.error('Load tree error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tree/save-person', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const { person } = req.body || {};
    if (!person || typeof person.id !== 'string') {
      return res.status(400).json({ error: 'Missing person.id' });
    }

    try {
      await pool.query(
        `INSERT INTO people (
          user_id, id, first_name, last_name, gender,
          birth_date, birth_place, death_date, death_place,
          bio, photo, father_id, mother_id, spouse_ids, children_ids, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
        ON CONFLICT (user_id, id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          gender = EXCLUDED.gender,
          birth_date = EXCLUDED.birth_date,
          birth_place = EXCLUDED.birth_place,
          death_date = EXCLUDED.death_date,
          death_place = EXCLUDED.death_place,
          bio = EXCLUDED.bio,
          photo = EXCLUDED.photo,
          father_id = EXCLUDED.father_id,
          mother_id = EXCLUDED.mother_id,
          spouse_ids = EXCLUDED.spouse_ids,
          children_ids = EXCLUDED.children_ids,
          updated_at = NOW()`,
        [
          userId,
          person.id,
          person.firstName ?? 'Unknown',
          person.lastName ?? 'Unknown',
          person.gender ?? 'Other',
          person.birthDate ?? null,
          person.birthPlace ?? null,
          person.deathDate ?? null,
          person.deathPlace ?? null,
          person.bio ?? null,
          person.photo ?? null,
          person.fatherId ?? null,
          person.motherId ?? null,
          JSON.stringify(person.spouseIds ?? []),
          JSON.stringify(person.childrenIds ?? []),
        ]
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error('Save person error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tree/delete-person/:id', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const personId = req.params.id;
    try {
      await pool.query(
        'DELETE FROM people WHERE user_id = $1 AND id = $2',
        [userId, personId]
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete person error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tree/save-meta', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const { rootId } = req.body || {};
    try {
      await pool.query(
        `INSERT INTO tree_meta (user_id, root_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           root_id = EXCLUDED.root_id,
           updated_at = NOW()`,
        [userId, rootId ?? null]
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error('Save meta error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ----- Invites -----
  app.get('/api/invites', authenticate, requireAdmin, async (_req: any, res) => {
    try {
      const result = await pool.query(
        `SELECT email, invited_by_name, status, created_at
         FROM invites
         ORDER BY created_at DESC`
      );
      const invites = result.rows.map((row) => ({
        email: row.email,
        invitedBy: row.invited_by_name,
        status: row.status,
        invitedAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      }));
      res.json({ invites });
    } catch (error: any) {
      console.error('List invites error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/invite', authenticate, requireAdmin, async (req: any, res) => {
    const { email, invitedBy } = req.body || {};
    const userId = req.auth.userId;

    if (!email || !invitedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inviteEmail = String(email).toLowerCase().trim();

    try {
      await pool.query(
        `INSERT INTO invites (email, invited_by_user_id, invited_by_name, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (email) DO UPDATE SET
           invited_by_user_id = EXCLUDED.invited_by_user_id,
           invited_by_name = EXCLUDED.invited_by_name,
           status = 'pending',
           created_at = NOW()`,
        [inviteEmail, userId, String(invitedBy)]
      );

      const apiKey = process.env.AGENTMAIL_API_KEY;
      let emailSent = false;
      let emailError: string | null = null;

      if (apiKey) {
        try {
          const response = await fetch('https://api.agentmail.to/v1/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              to: inviteEmail,
              subject: 'You are invited to join FamilyTreeAI',
              body: `
                <h1>Welcome to FamilyTreeAI!</h1>
                <p>${invitedBy} has invited you to join their family tree.</p>
                <p>You can now sign up at the following link:</p>
                <a href="${req.headers.origin || 'https://familytreeai.app'}">Join FamilyTreeAI</a>
                <br/><br/>
                <p>Best regards,<br/>The FamilyTreeAI Team</p>
              `,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Agentmail error:', errorData);
            emailError = `Agentmail returned ${response.status}`;
          } else {
            emailSent = true;
          }
        } catch (sendErr: any) {
          console.error('Agentmail request failed:', sendErr);
          emailError = sendErr.message || 'Failed to send email';
        }
      } else {
        emailError = 'AGENTMAIL_API_KEY not configured';
      }

      res.json({ success: true, emailSent, emailError });
    } catch (error: any) {
      console.error('Invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ----- Settings (per-user AI provider preference + BYO API keys) -----
  app.get('/api/settings', authenticate, async (req: any, res) => {
    try {
      const raw = await loadUserSettingsRaw(req.auth.userId);
      res.json(publicSettings(raw));
    } catch (error: any) {
      console.error('Load settings error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/settings', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const { provider } = req.body || {};
    if (!provider || !(ALL_PROVIDERS as string[]).includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider.' });
    }
    try {
      await pool.query(
        `INSERT INTO user_settings (user_id, provider, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider, updated_at = NOW()`,
        [userId, provider],
      );
      const raw = await loadUserSettingsRaw(userId);
      res.json(publicSettings(raw));
    } catch (error: any) {
      console.error('Save settings error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/settings/key', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const { provider, key } = req.body || {};
    if (!BYO_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider.' });
    }
    if (typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ error: 'API key is required.' });
    }
    const column = `${provider}_key`;
    try {
      // Encrypt at the boundary; plaintext key never touches the DB.
      const ciphertext = encryptString(key.trim(), userId, provider);
      await pool.query(
        `INSERT INTO user_settings (user_id, ${column}, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = NOW()`,
        [userId, ciphertext],
      );
      const raw = await loadUserSettingsRaw(userId);
      res.json(publicSettings(raw));
    } catch (error: any) {
      console.error('Save key error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/settings/key/:provider', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const provider = req.params.provider;
    if (!BYO_PROVIDERS.includes(provider as BYOProvider)) {
      return res.status(400).json({ error: 'Invalid provider.' });
    }
    const column = `${provider}_key`;
    try {
      await pool.query(
        `UPDATE user_settings SET ${column} = NULL, updated_at = NOW() WHERE user_id = $1`,
        [userId],
      );
      const raw = await loadUserSettingsRaw(userId);
      res.json(publicSettings(raw));
    } catch (error: any) {
      console.error('Clear key error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ----- AI (server-side; provider keys never reach the browser) -----
  const aiHandler = (
    buildPrompt: (body: any) => { prompt: string; json?: boolean } | null,
    parseResponse: (text: string, body: any) => any,
  ) =>
    async (req: any, res: any) => {
      try {
        const built = buildPrompt(req.body || {});
        if (!built) return res.status(400).json({ error: 'Invalid request body.' });
        const userId = req.auth.userId;
        // Decryption only happens here: behind authenticate middleware, at the
        // exact moment we are about to call the LLM on this user's behalf.
        const raw = await loadUserSettingsRaw(userId);
        const decryptedKeys = decryptUserKeys(raw, userId);
        const result = await complete(raw.provider, decryptedKeys, built.prompt, {
          json: !!built.json,
          jsonSchemaHint: built.json ? PERSON_JSON_HINT : undefined,
        });
        const meta = {
          provider: result.resolved.provider,
          fellBackToGemini: result.resolved.reason === 'fallback-gemini',
        };
        res.json({ ...parseResponse(result.text, req.body || {}), meta });
      } catch (error: any) {
        const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
        console.error('AI handler error:', error);
        res.status(status).json({ error: error?.message || 'AI request failed.' });
      }
    };

  app.post(
    '/api/ai/bio',
    authenticate,
    aiHandler(
      (body) => {
        const p = body?.person;
        if (!p || !p.firstName) return null;
        const prompt = `
Write a short, engaging biography (max 150 words) for a genealogy record.
The tone should be respectful and historical.

Details:
Name: ${p.firstName} ${p.lastName || ''}
Gender: ${p.gender || 'Other'}
Born: ${p.birthDate || 'Unknown'}${p.birthPlace ? ` at ${p.birthPlace}` : ''}
Died: ${p.deathDate || 'Unknown'}${p.deathPlace ? ` at ${p.deathPlace}` : ''}

If dates are missing, focus on the name and legacy. Avoid making up specific facts not provided,
but you may add general historical context if a date is provided.
        `.trim();
        return { prompt };
      },
      (text) => ({ bio: text }),
    ),
  );

  app.post(
    '/api/ai/parse',
    authenticate,
    aiHandler(
      (body) => {
        const text = String(body?.text || '').trim();
        if (!text) return null;
        const prompt = `Extract genealogy information from the following text.\n\nText: "${text}"`;
        return { prompt, json: true };
      },
      (text) => {
        try {
          // Strip code fences if any provider wrapped output.
          const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(trimmed);
          return { person: parsed };
        } catch {
          return { person: null };
        }
      },
    ),
  );

  app.post(
    '/api/ai/narrative',
    authenticate,
    aiHandler(
      (body) => {
        const treeData = body?.treeData;
        const focusId = body?.focusPersonId || null;
        if (!treeData || !treeData.people) return null;
        const prompt = buildNarrativePrompt(treeData, focusId);
        return { prompt };
      },
      (text) => ({ narrative: text }),
    ),
  );

  app.delete('/api/invite/:email', authenticate, requireAdmin, async (req: any, res) => {
    const inviteEmail = String(req.params.email).toLowerCase().trim();
    try {
      await pool.query('DELETE FROM invites WHERE email = $1', [inviteEmail]);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete invite error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          clientPort: 443,
        },
        watch: {
          ignored: ['**/.local/**', '**/dist/**', '**/.cache/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  try {
    await ensureSchema();
    console.log('Postgres schema ready.');
  } catch (err: any) {
    console.error('Postgres schema bootstrap failed:', err.message);
  }

  try {
    encryptionSelfCheck();
    console.log('Encryption self-check OK.');
  } catch (err: any) {
    // Don't crash the server (tree features still work without BYO keys),
    // but make the misconfiguration loud so operators notice.
    console.error('ENCRYPTION SELF-CHECK FAILED — BYO API key encryption is not usable:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
