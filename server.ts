import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { createClerkClient, verifyToken } from '@clerk/backend';

const SUPERADMIN_EMAIL = 'myozscoop@gmail.com';

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
  `);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
