# FamilyTreeAI

A free, open-source family tree / genealogy web application powered by AI.

## Architecture

- **Stack**: React 19 + TypeScript + Vite (frontend), Express + tsx (backend)
- **Single-process server**: `server.ts` runs an Express API and mounts Vite as middleware in dev (or serves the `dist/` build in production). Both the frontend and backend share **port 5000**.
- **Auth**: Clerk (`@clerk/clerk-react` on the frontend, `@clerk/backend` for token verification on the server). Prebuilt sign-in/sign-up screens at `/sign-in` and `/sign-up` use hash routing and handle verification, social login and incomplete registrations. `/sso-callback` handles redirects. Google-side account/provider restrictions can still prevent OAuth.
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
- `GEMINI_API_KEY` — Google Gemini API key (server-side only)
- `AGENTMAIL_API_KEY` — Agentmail.to API key for sending invites
- `DATABASE_URL` — provisioned automatically by Replit Postgres

## Database Schema

Tables in the development database (created on first setup):

- `families`, `family_memberships`, `family_preferences`, `family_profiles`, `family_invitations`, `family_join_requests` — Family ownership, active family, verified profile display data, email-bound invitations, and membership approvals.
- **Storage compatibility:** Legacy `user_id` columns in tree tables are storage namespaces, not necessarily the authenticated caller. Every tree/marriage/document endpoint requires a Clerk token and `X-Family-Id`; the server checks membership and resolves the family's `storage_user_id`. Settings/encryption/AI keys remain scoped to the actual Clerk user. Existing trees are wrapped in private owner-controlled families without moving or deleting records.
- `people (user_id, id, first_name, last_name, gender, birth_date, birth_place, death_date, death_place, bio, photo, father_id, mother_id, spouse_ids jsonb, children_ids jsonb, updated_at)` — PK `(user_id, id)`. One row per person within a family namespace.
- `tree_meta (user_id PK, root_id, updated_at)` — Root of the family's tree.
- `invites (email PK, invited_by_user_id, invited_by_name, status, created_at)` — Legacy table retained for additive migration; app-wide invitation APIs return 410. Pending invitations migrate to the corresponding owner's family.
- `marriages (id PK, user_id, person1_id, person2_id, marriage_date, marriage_place, end_date, end_place, status, notes, created_at)` — Marriage records per couple. Status: married | divorced | widowed | separated | annulled. Creating/deleting a marriage automatically syncs `spouse_ids` on both persons.
- `documents (id PK, user_id, person_id, name, doc_type, mime_type, file_size, file_data, created_at)` — Existing base64 document storage retained unchanged. Max 5 MB per file. Scoped to the family storage namespace and person.

## Family onboarding and privacy

- New accounts choose create or join before accessing any tree. New trees are empty, not automatically seeded with example people.
- Families default to private. Only owner-opted-in names and optional descriptions are searchable, by authenticated verified users; search never returns people, documents, owner IDs, or members.
- Join requests require owner approval. Accepted invitees and approved members can view/edit the shared tree; only owners manage visibility, requests, and invitations.
- Invitations expire after 14 days, have SHA-256 hashed opaque tokens, require the recipient's verified email, and cannot be reused after acceptance/revocation. Incoming links are retained in sessionStorage across auth redirects.
- Owner invitations use AgentMail's `/v0/inboxes` and `/v0/inboxes/:inbox_id/messages/send` APIs with an existing sending inbox. If delivery fails or no inbox exists, the UI explicitly reports the failure and provides a copyable invitation link.
- Family selection stays per-tab; shared data services snapshot `X-Family-Id` before awaiting authentication so another tab/switch cannot redirect an in-flight save.
- `npm run test:families` tests privacy, membership, invitations, and additive migration in an isolated temporary Postgres schema, then removes that schema.

## API Endpoints (all require a Clerk Bearer token)

- `GET    /api/tree/load` — load the selected family's tree (membership and `X-Family-Id` required)
- `POST   /api/tree/save-person` — upsert a person
- `DELETE /api/tree/delete-person/:id` — remove a person
- `POST   /api/tree/save-meta` — set the tree's `rootId`
- `GET    /api/marriages` — list marriages in the selected family
- `GET    /api/person/:personId/marriages` — list marriages involving a person
- `POST   /api/marriage` — create a marriage record (syncs spouseIds on both persons)
- `PUT    /api/marriage/:id` — update marriage details (dates, status, notes)
- `DELETE /api/marriage/:id` — remove a marriage (unlinks spouseIds if no other marriage remains)
- `GET    /api/person/:personId/documents` — list documents for a person (no file data)
- `POST   /api/person/:personId/document` — attach a document (PDF or image, base64 body, max 5 MB)
- `GET    /api/document/:docId` — fetch document including file data for download/preview
- `DELETE /api/document/:docId` — remove a document
- `GET    /api/families/context` — memberships, active family, received invitations, own request statuses
- `POST   /api/families` — create a private-by-default family
- `GET    /api/families/search?q=...` — search opted-in family names (2+ characters)
- `POST   /api/families/accept-invite` — accept via token or received invitation ID
- `POST   /api/families/:familyId/activate` — select an existing membership
- `PATCH  /api/families/:familyId` — owner edits details/search visibility
- `GET    /api/families/:familyId/manage` — owner-only members, invitations, and requests
- `POST   /api/families/:familyId/requests` — request membership in a discoverable family
- `POST   /api/families/:familyId/requests/:requestId/decision` — owner approval/rejection
- `POST   /api/families/:familyId/invitations` — owner creates an email-bound invitation
- `DELETE /api/families/:familyId/invitations/:invitationId` — owner revokes a pending invitation
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
- `components/` — TreeVisualizer, EditorPanel, SmartAdd, LoginScreen, FamilyGate, FamilyOnboarding, FamilyManager, NarrativeView, SettingsView. InviteManager is a retired app-wide UI, no longer routed.
- `server/families.ts` — family schema, additive legacy migration, family-access middleware, family APIs and invitation email delivery.
- `services/` — `storageService` (talks to `/api/tree/*`), `aiService` (talks to `/api/ai/*`), `settingsService` (talks to `/api/settings*`), `gedcomService`, `authService` (deprecated Clerk shim).
- `aiProviders.ts` — server-side provider dispatcher (Gemini/OpenAI/Anthropic/GLM/Kimi).
- `server.ts` — Express API (Postgres-backed) plus Vite middleware in dev / static `dist/` in production.
