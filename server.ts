import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { createClerkClient, verifyToken } from '@clerk/backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
let firebaseConfig: any = { projectId: 'familytreeai' };
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Loaded Firebase Config:', {
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      hasApiKey: !!firebaseConfig.apiKey
    });
  } else {
    console.warn('firebase-applet-config.json not found, using default project ID');
  }
} catch (error) {
  console.error('Error loading firebase-applet-config.json:', error);
}

// Initialize Firebase Admin
try {
  const adminConfig: any = {
    credential: admin.credential.applicationDefault()
  };
  
  if (firebaseConfig.projectId) {
    adminConfig.projectId = firebaseConfig.projectId;
  }

  if (admin.apps.length === 0) {
    admin.initializeApp(adminConfig);
    console.log('Firebase Admin initialized with Project ID:', adminConfig.projectId || 'default');
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const secretKey = process.env.CLERK_SECRET_KEY;

  // Middleware to verify Clerk session
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

  // Helper to get Firestore DB
  const getDb = () => {
    try {
      return firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
        ? getFirestore(firebaseConfig.firestoreDatabaseId) 
        : getFirestore();
    } catch (e) {
      return getFirestore();
    }
  };

  // API Route for sending invites via Agentmail.to
  app.post('/api/invite', authenticate, async (req: any, res) => {
    const { email, invitedBy } = req.body;
    const userId = req.auth.userId;

    if (!email || !invitedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const apiKey = process.env.AGENTMAIL_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'AGENTMAIL_API_KEY not configured' });
      }

      // Call Agentmail.to API
      const response = await fetch('https://api.agentmail.to/v1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          to: email,
          subject: 'You are invited to join FamilyTreeAI',
          body: `
            <h1>Welcome to FamilyTreeAI!</h1>
            <p>${invitedBy} has invited you to join their family tree.</p>
            <p>You can now sign up at the following link:</p>
            <a href="${req.headers.origin || 'https://familytreeai.app'}">Join FamilyTreeAI</a>
            <br/><br/>
            <p>Best regards,<br/>The FamilyTreeAI Team</p>
          `
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Agentmail error:', errorData);
        return res.status(response.status).json({ error: 'Failed to send email via Agentmail' });
      }

      // Save invite to Firestore
      const db = getDb();
      await db.collection('invites').doc(email.toLowerCase()).set({
        email: email.toLowerCase(),
        invitedBy: userId,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Tree Management Routes
  app.get('/api/tree/load', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const db = getDb();
    
    try {
      const peopleSnapshot = await db.collection(`users/${userId}/people`).get();
      const people: any = {};
      peopleSnapshot.forEach(doc => {
        people[doc.id] = doc.data();
      });

      const metaDoc = await db.collection(`users/${userId}/meta`).doc('tree').get();
      const rootId = metaDoc.exists ? metaDoc.data()?.rootId : (Object.keys(people)[0] || '');

      res.json({ rootId, people });
    } catch (error: any) {
      console.error('Load tree error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tree/save-person', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const { person } = req.body;
    const db = getDb();

    try {
      await db.collection(`users/${userId}/people`).doc(person.id).set(person);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Save person error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tree/delete-person/:id', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const personId = req.params.id;
    const db = getDb();

    try {
      await db.collection(`users/${userId}/people`).doc(personId).delete();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete person error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tree/save-meta', authenticate, async (req: any, res) => {
    const userId = req.auth.userId;
    const { rootId } = req.body;
    const db = getDb();

    try {
      await db.collection(`users/${userId}/meta`).doc('tree').set({ rootId });
      res.json({ success: true });
    } catch (error: any) {
      console.error('Save meta error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Test Firestore connection on startup
    const testConnection = async () => {
      try {
        const db = getDb();
        // Try to read a document instead of writing, which is safer for a health check
        // and less likely to fail if the collection doesn't exist yet
        await db.collection('health_check').doc('status').get();
        console.log('Firestore connection verified successfully.');
      } catch (error: any) {
        console.error('Firestore connection test failed:', error.message);
        if (error.message.includes('PERMISSION_DENIED')) {
          console.error('ACTION REQUIRED: Please run the "Firebase Setup" tool again to ensure your project is correctly provisioned and permissions are set.');
        }
      }
    };
    testConnection();
  });
}

startServer();
