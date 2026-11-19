# FamilyTreeAI <sup>Public Beta</sup>

**Your family history belongs to you.** FamilyTreeAI helps relatives preserve their people, relationships, documents, and stories in a private shared workspace.

[Open the app](https://familytree.lk) · [Project website](https://nzicecool.github.io/FamliyTreeAI/) · [FAQ](https://familytree.lk/faq) · [Support](https://familytree.lk/support)

![FamilyTreeAI Family and access screen with synthetic demonstration data](docs/assets/family-access.jpg)

*Development screenshot from a demonstration family, not private customer records.*

## What you can do

- Explore ancestors and descendants in an interactive family tree, and export GEDCOM.
- Sign in or sign up using Clerk, with Google or email authentication when enabled in your Clerk instance.
- After sign-up, **create a private family or join an existing one** using an invitation. Search lists only families that opted into discovery; access requests need owner approval.
- Manage invitations, requests, members, and discovery in **Family & access**.
- Link related families through private invitations and explicitly shared person details. **Both owners approve the same connection version.** Links do not merge records or grant access to the other family’s private tree.
- Attach certificate PDFs and images to person records.
- Upload short **voice memories** to a saved person: up to **three minutes / 10 MB**, with authenticated playback, download, and deletion. Private App Storage is required; live hosted uploads still need storage setup and verification. This is file upload, not microphone recording or transcription.
- Draft biographies, extract details from pasted text, and write family narratives with AI. Review generated information before saving or sharing.
- Use the built-in Gemini integration or bring an OpenAI, Anthropic, GLM, or Kimi API key. Personal provider keys are encrypted at rest with AES-256-GCM.
- Find usage guidance in the FAQ and submit support requests through the support form.

### Current sign-up experience

![FamilyTreeAI sign-up screen, including first-visit cookie consent](docs/assets/sign-up.jpg)

*Development capture. The privacy dialog appears on first visit; after authentication, new members choose whether to create or join a family.*

## Architecture

React 19, TypeScript, Vite, Express, PostgreSQL, and Clerk. **The current app does not use Firebase for its database or authentication.** Legacy Firebase example files are not part of the current setup.

PostgreSQL stores family/person records and recording metadata. Voice bytes use private App Storage. GitHub Pages serves only the static project website in `docs/`, **not** the authenticated app or its API.

Hosting, Clerk, storage, and AI providers may have their own limits or charges.

## Run locally

Prerequisites: **Node.js 22+**, npm, a PostgreSQL database, and a Clerk development application.

```bash
git clone https://github.com/nzicecool/FamliyTreeAI.git
cd FamliyTreeAI
npm install

# Supply real values through your shell or secret manager, never commit them.
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
export CLERK_SECRET_KEY="sk_test_REPLACE_ME"
export VITE_CLERK_PUBLISHABLE_KEY="pk_test_REPLACE_ME"

npm run dev
```

Open `http://localhost:5000`. Express serves the API and Vite development frontend; database tables are initialized on startup.

The server reads its environment directly. A `.env.local` file alone does not load server secrets into this startup command. On Replit, use workspace Secrets; elsewhere use your host’s environment configuration.

Enable the desired authentication methods in Clerk, and configure the development and production domains/origins there. After signing up, create or join a family before adding records.

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required in both environments. |
| `CLERK_SECRET_KEY` | Development server key, starting `sk_test_`. Also the legacy encryption fallback seed. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Development browser key, starting `pk_test_`. |
| `CLERK_SECRET_KEY_PROD` | Production server key, starting `sk_live_`. |
| `VITE_CLERK_PUBLISHABLE_KEY_PROD` | Production browser key, starting `pk_live_`; required at build time. |
| `ENCRYPTION_KEY` | Recommended: stable base64-encoded 32-byte key for personal AI-key encryption. See caution below. |
| `GEMINI_API_KEY` | Enables the server’s built-in Gemini provider. Otherwise configure a personal supported provider in Settings. |
| `AGENTMAIL_API_KEY` | Optional invitation email delivery; invitation links can be shared directly. |
| `VOICE_STORAGE_BUCKET_ID_DEV` / `VOICE_STORAGE_BUCKET_ID_PROD` | Optional bucket selectors; omitted uses the project’s default App Storage bucket. A private bucket and authenticated SDK access are still required. |
| `GROWTHFLOWAI_API_KEY_DEV` / `GROWTHFLOWAI_API_KEY_PROD` | Optional server-only support integration keys. |
| `GROWTHFLOWAI_FT_API_KEY_DEV` / `GROWTHFLOWAI_FT_API_KEY_PROD` | Optional, separate server-only product event keys. |

Only Clerk **publishable** keys may be exposed to the browser. Never put secret keys, support keys, or event keys in a `VITE_` variable. Production does not fall back to development authentication or GrowthFlowAI credentials.

**Encryption caution:** For a new installation, generate a 32-byte base64 key once (for example, `openssl rand -base64 32`), save it securely as `ENCRYPTION_KEY`, and keep it stable and backed up. Do not regenerate it at every start. Existing installations without an explicit key derive encryption material from `CLERK_SECRET_KEY`, even in production. Changing that seed or introducing a different encryption key without migration makes previously saved provider keys unreadable.

**Voice storage:** The current adapter uses `@replit/object-storage`. Configure a private App Storage bucket with SDK access in the hosting environment. On another host, the rest of the app can run with Node/PostgreSQL/Clerk, but voice storage needs a compatible adapter or supported SDK authentication. Never use public file URLs for private recordings.

**Analytics:** Product events require analytics consent. Authenticated events can include the Clerk-verified email and first/last name for contact association. Family record contents, certificates, and recordings are not sent in product event payloads. Support form contents are sent only when the user submits a support request.

## Production

Configure your production Clerk instance, domain, and social connections. Keep development keys under their existing names and set both `_PROD` Clerk variables separately.

```bash
npm run build  # VITE_CLERK_PUBLISHABLE_KEY_PROD must be available now
npm run start  # NODE_ENV=production; requires CLERK_SECRET_KEY_PROD
```

Provide PostgreSQL access and stable encryption material to the production server too. Optional integration keys use their `_PROD` versions. The server listens on port 5000; configure your host’s HTTPS proxy accordingly.

New development features described here may require republishing the app before they appear on the hosted site. Publishing the GitHub Pages documentation does not publish the app.

## Checks

```bash
npm run lint
npm run test:families
```

The family tests require PostgreSQL and create/remove an isolated temporary schema.

## Update the GitHub Pages site

See [`docs/README.md`](docs/README.md). Push `docs/` including its images and favicon, plus this README, to the branch used by GitHub Pages. No static-site build is needed.
