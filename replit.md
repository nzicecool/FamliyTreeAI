# FamilyTreeAI

A free, open-source family tree / genealogy web application powered by AI.

## Architecture

- **Stack**: React 19 + TypeScript + Vite (frontend), Express + tsx (backend)
- **Single-process server**: `server.ts` runs an Express API and mounts Vite as middleware in dev (or serves the `dist/` build in production). Both the frontend and backend share **port 5000**.
- **Auth**: Clerk (`@clerk/clerk-react` on the frontend, `@clerk/backend` for token verification on the server). The `/sso-callback` path is handled in `index.tsx` via `AuthenticateWithRedirectCallback` so OAuth (e.g. Google) works.
- **Database**: Replit-managed PostgreSQL (via the `pg` driver) — replaces the original Firebase Firestore.
- **AI**: `@google/genai` (Gemini) for the SmartAdd feature.
- **Email invites**: Agentmail.to.

## Replit Setup

- Workflow `Start application` runs `npm run dev` and waits for port 5000 (webview).
- `vite.config.ts` and `server.ts` both set `host: 0.0.0.0` and `allowedHosts: true` so the Replit iframe proxy can reach the dev server.
- HMR is configured via `clientPort: 443` for the HTTPS proxy.
- Production deployment: autoscale, build = `npm run build`, run = `npm run start` (which runs `tsx server.ts` with `NODE_ENV=production` and serves `dist/`).
- The Postgres `DATABASE_URL` (and `PG*` vars) are provided automatically by the Replit-managed database.

## Required Secrets

- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk frontend publishable key
- `CLERK_SECRET_KEY` — Clerk backend secret for token verification
- `GEMINI_API_KEY` — Google Gemini API key (also exposed as `process.env.API_KEY` in the client bundle)
- `AGENTMAIL_API_KEY` — Agentmail.to API key for sending invites
- `DATABASE_URL` — provisioned automatically by Replit Postgres

## Database Schema

Tables in the development database (created on first setup):

- `people (user_id, id, first_name, last_name, gender, birth_date, birth_place, death_date, death_place, bio, photo, father_id, mother_id, spouse_ids jsonb, children_ids jsonb, updated_at)` — PK `(user_id, id)`. One row per person, scoped to a Clerk user.
- `tree_meta (user_id PK, root_id, updated_at)` — Per-user root of the tree.
- `invites (email PK, invited_by_user_id, invited_by_name, status, created_at)` — Pending/accepted invitations.

## API Endpoints (all require a Clerk Bearer token)

- `GET    /api/tree/load` — load the current user's tree
- `POST   /api/tree/save-person` — upsert a person
- `DELETE /api/tree/delete-person/:id` — remove a person
- `POST   /api/tree/save-meta` — set the tree's `rootId`
- `GET    /api/invites` — list invites
- `POST   /api/invite` — create an invite + send email via Agentmail
- `DELETE /api/invite/:email` — revoke an invite
- `GET    /api/settings` — current user's AI provider preference and which BYO keys are configured (booleans only — keys are never returned)
- `PUT    /api/settings` — set provider preference
- `PUT    /api/settings/key` — save a BYO API key (openai/anthropic/glm/kimi)
- `DELETE /api/settings/key/:provider` — clear a BYO key
- `POST   /api/ai/bio` — generate a person bio
- `POST   /api/ai/parse` — extract a structured Person from free text
- `POST   /api/ai/narrative` — generate a focused family narrative

## AI Providers (server-side only)

All AI calls run server-side. Provider keys never reach the browser.
- Default: Google Gemini (uses server `GEMINI_API_KEY` env var)
- Bring-your-own: OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-haiku-latest`), Zhipu GLM (`glm-4-flash`), Moonshot Kimi (`moonshot-v1-8k`)
- Per-user provider preference + BYO keys live in the `user_settings` Postgres table.
- If a user picks a BYO provider but hasn't supplied a key, the server transparently falls back to Gemini and the response includes `meta.fellBackToGemini: true` so the UI can warn.
- Provider dispatch lives in `aiProviders.ts`.

### Key encryption at rest
- BYO API keys are encrypted with **AES-256-GCM** before being written to Postgres. See `cryptoUtil.ts`.
- The master key is taken from `ENCRYPTION_KEY` (base64-encoded 32 bytes) if set; otherwise scrypt-derived from `CLERK_SECRET_KEY` with a fixed app salt so the app works on Replit without an extra secret.
- Each ciphertext is bound to `(userId, provider)` via AES-GCM AAD, so a stolen DB row cannot be moved between users/providers.
- Decryption only happens at one place in the codebase: inside the `/api/ai/*` handler, after Clerk authentication, immediately before the LLM call. `GET /api/settings` only checks ciphertext non-null and never touches the master key.
- Stored format: `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>`. Any value that fails to decrypt (tampered, wrong AAD, legacy plaintext) is treated as "not configured" and the dispatcher falls back to Gemini.

## Project Layout

- `index.html`, `index.tsx` — Vite entry. Sets up `<ClerkProvider>` and routes `/sso-callback` to Clerk's redirect handler.
- `App.tsx` — Main UI shell, sidebar nav (collapsible, persisted in localStorage `familytree:sidebar-open`), error boundary, tree state.
- `components/` — TreeVisualizer, EditorPanel, SmartAdd, LoginScreen, InviteManager, NarrativeView, SettingsView.
- `services/` — `storageService` (talks to `/api/tree/*`), `aiService` (talks to `/api/ai/*`), `settingsService` (talks to `/api/settings*`), `gedcomService`, `authService` (deprecated Clerk shim).
- `aiProviders.ts` — server-side provider dispatcher (Gemini/OpenAI/Anthropic/GLM/Kimi).
- `server.ts` — Express API (Postgres-backed) plus Vite middleware in dev / static `dist/` in production.
