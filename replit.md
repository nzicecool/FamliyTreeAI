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

## Project Layout

- `index.html`, `index.tsx` — Vite entry. Sets up `<ClerkProvider>` and routes `/sso-callback` to Clerk's redirect handler.
- `App.tsx` — Main UI shell, sidebar nav, error boundary, tree state.
- `components/` — TreeVisualizer, EditorPanel, SmartAdd, LoginScreen, InviteManager.
- `services/` — `storageService` (talks to the Express `/api/tree/*` endpoints), `geminiService`, `gedcomService`, `authService` (deprecated Clerk shim).
- `server.ts` — Express API (Postgres-backed) plus Vite middleware in dev / static `dist/` in production.
