import express, { type Express, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { Client } from '@replit/object-storage';
import { parseBuffer } from 'music-metadata';
import { familyScopeMiddleware } from './families';

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
export interface VoiceStore {
  put(path: string, bytes: Buffer): Promise<void>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
}
const storageClient = () => new Client({
  bucketId: process.env.NODE_ENV === 'production'
    ? process.env.VOICE_STORAGE_BUCKET_ID_PROD : process.env.VOICE_STORAGE_BUCKET_ID_DEV,
});
export const privateVoiceStore: VoiceStore = {
  async put(path, bytes) {
    const r = await storageClient().uploadFromBytes(path, bytes);
    if (!r.ok) throw new Error('Storage unavailable');
  },
  async get(path) {
    const r = await storageClient().downloadAsBytes(path);
    if (!r.ok) throw new Error('Storage unavailable');
    return r.value[0];
  },
  async delete(path) {
    const r = await storageClient().delete(path, { ignoreNotFound: true });
    if (!r.ok) throw new Error('Storage unavailable');
  },
};
export async function ensureVoiceSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_memories (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, person_id TEXT NOT NULL,
      title TEXT NOT NULL, mime_type TEXT NOT NULL, file_size INTEGER NOT NULL,
      duration DOUBLE PRECISION NOT NULL, object_path TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'uploading', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS voice_memories_person ON voice_memories(user_id,person_id);
  `);
}
class VoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new VoiceError(status, message); };
export async function inspectAudio(bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail(400, 'Choose a non-empty audio recording.');
  if (bytes.length > MAX_VOICE_BYTES) fail(413, 'Recordings must be 10 MB or smaller.');
  let mimeType: string;
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') mimeType = 'audio/wav';
  else if (bytes.subarray(0, 4).toString() === 'OggS') mimeType = 'audio/ogg';
  else if (bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) mimeType = 'audio/mpeg';
  else if (bytes.subarray(4, 8).toString() === 'ftyp') mimeType = 'audio/mp4';
  else if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) mimeType = 'audio/webm';
  else fail(400, 'Use MP3, M4A, WAV, OGG, or WebM audio.');
  try {
    const metadata = await parseBuffer(bytes, { mimeType, size: bytes.length }, { duration: true, skipCovers: true });
    const duration = metadata.format.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !metadata.format.numberOfChannels) fail(400, 'This recording could not be read. Export it as a supported audio file.');
    if (duration > 180) fail(400, 'Recordings must be three minutes or shorter.');
    // Reject video-containing containers rather than storing a video as a voice memory.
    if (metadata.format.trackInfo?.some(t => t.type === 1)) fail(400, 'Upload an audio-only recording, not a video.');
    return { duration, mimeType };
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    fail(400, 'The audio file is invalid or unsupported. Try exporting it as MP3 or WAV.');
  }
}
const publicVoice = (r: any) => ({
  id: r.id, personId: r.person_id, title: r.title, mimeType: r.mime_type,
  fileSize: r.file_size, duration: r.duration, createdAt: r.created_at,
});
export function audioRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || !match[1] && !match[2]) fail(416, 'Invalid audio range.');
  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) fail(416, 'Invalid audio range.');
  return { start, end };
}
// Durable metadata is kept until its object is successfully deleted; failures
// are retried rather than leaving untracked storage objects.
export async function cleanupVoiceObjects(pool: Pool, store: VoiceStore = privateVoiceStore) {
  const rows = await pool.query(`SELECT v.id,v.object_path FROM voice_memories v
    WHERE v.status='deleting'
      OR (v.status='uploading' AND v.created_at<NOW()-INTERVAL '15 minutes')
      OR (v.status='ready' AND NOT EXISTS(SELECT 1 FROM people p WHERE p.user_id=v.user_id AND p.id=v.person_id))
    LIMIT 20`);
  for (const row of rows.rows) {
    try {
      await store.delete(row.object_path);
      await pool.query('DELETE FROM voice_memories WHERE id=$1', [row.id]);
    } catch { /* Metadata remains for the next cleanup attempt. */ }
  }
}
export function registerVoiceRoutes(app: Express, pool: Pool, authenticate: RequestHandler, store: VoiceStore = privateVoiceStore) {
  const scope = familyScopeMiddleware(pool), router = express.Router();
  router.use(authenticate, scope, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const route = (fn: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      res.status(e instanceof VoiceError ? e.status : 503).json({
        error: e instanceof VoiceError ? e.message : 'Private audio storage is unavailable. Check App Storage setup, then try again.',
      });
    }
  };
  const person = async (req: any) => {
    const r = await pool.query('SELECT id FROM people WHERE user_id=$1 AND id=$2', [req.treeUserId, req.params.personId]);
    if (!r.rowCount) fail(404, 'Person not found.');
  };
  router.get('/person/:personId/voices', route(async (req, res) => {
    await person(req);
    const rows = await pool.query(`SELECT * FROM voice_memories WHERE user_id=$1 AND person_id=$2 AND status='ready' ORDER BY created_at DESC`,
      [req.treeUserId, req.params.personId]);
    res.json(rows.rows.map(publicVoice));
  }));
  const inFlight = new Map<string, number>();
  const limit: RequestHandler = (req: any, res, next) => {
    const user = req.auth.userId, count = inFlight.get(user) || 0;
    if (count >= 2 || inFlight.size >= 100 && !inFlight.has(user)) return res.status(429).json({ error: 'Please wait for your current audio upload to finish.' });
    inFlight.set(user, count + 1);
    res.once('close', () => { const n = (inFlight.get(user) || 1) - 1; if (n) inFlight.set(user, n); else inFlight.delete(user); });
    next();
  };
  router.post('/person/:personId/voices', limit, express.raw({ type: () => true, limit: MAX_VOICE_BYTES }), route(async (req, res) => {
    await person(req);
    const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    if (!title || title.length > 120) fail(400, 'Enter a recording title of 1–120 characters.');
    const bytes: Buffer = req.body;
    const { duration, mimeType } = await inspectAudio(bytes);
    const id = randomUUID();
    const objectPath = `familytreeai/${process.env.NODE_ENV === 'production' ? 'production' : 'development'}/voices/${id}`;
    await pool.query(`INSERT INTO voice_memories(id,user_id,person_id,title,mime_type,file_size,duration,object_path)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, req.treeUserId, req.params.personId, title, mimeType, bytes.length, duration, objectPath]);
    try {
      await store.put(objectPath, bytes);
      // Person may have been removed while the file was uploading.
      await person(req);
      const r = await pool.query(`UPDATE voice_memories SET status='ready' WHERE id=$1 AND status='uploading' RETURNING *`, [id]);
      if (!r.rowCount) throw new Error('Upload no longer available');
      res.status(201).json(publicVoice(r.rows[0]));
    } catch (e) {
      await pool.query(`UPDATE voice_memories SET status='deleting' WHERE id=$1`, [id]);
      await cleanupVoiceObjects(pool, store);
      throw e;
    }
  }));
  const recording = async (req: any) => {
    const r = await pool.query(`SELECT v.* FROM voice_memories v JOIN people p ON p.user_id=v.user_id AND p.id=v.person_id
      WHERE v.id=$1 AND v.user_id=$2 AND v.status='ready'`, [req.params.id, req.treeUserId]);
    if (!r.rowCount) fail(404, 'Recording not found.');
    return r.rows[0];
  };
  router.get('/voices/:id/audio', route(async (req, res) => {
    const voice = await recording(req);
    let range: ReturnType<typeof audioRange>;
    try { range = audioRange(req.get('Range'), voice.file_size); } catch (e) { res.set('Content-Range', `bytes */${voice.file_size}`); throw e; }
    const bytes = await store.get(voice.object_path);
    // Recheck access after storage IO, including any removal or concurrent delete.
    await scopeCheck(pool, req);
    await recording(req);
    res.set({ 'Content-Type': voice.mime_type, 'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    if (range) {
      res.status(206).set({ 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}`,
        'Content-Length': String(range.end - range.start + 1) }).send(bytes.subarray(range.start, range.end + 1));
    } else res.set('Content-Length', String(bytes.length)).send(bytes);
  }));
  router.delete('/voices/:id', route(async (req, res) => {
    const voice = await recording(req);
    await store.delete(voice.object_path);
    await pool.query('DELETE FROM voice_memories WHERE id=$1 AND user_id=$2', [voice.id, req.treeUserId]);
    res.json({ ok: true });
  }));
  router.use((error: any, _req: any, res: any, _next: any) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: error.type === 'entity.too.large' ? 'Recordings must be 10 MB or smaller.' : 'The recording could not be uploaded.' });
  });
  app.use('/api', (req, res, next) => {
    if (!/^\/(?:person\/[^/]+\/voices|voices\/[^/]+(?:\/audio)?)\/?$/.test(req.path)) return next();
    router(req, res, next);
  });
}
async function scopeCheck(pool: Pool, req: any) {
  const r = await pool.query('SELECT 1 FROM family_memberships WHERE family_id=$1 AND user_id=$2', [req.get('X-Family-Id'), req.auth.userId]);
  if (!r.rowCount) fail(403, 'You are no longer a member of this family.');
}
