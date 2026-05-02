# FamilyTreeAI

A free, open-source family tree / genealogy web application powered by AI.

## Architecture

- **Stack**: React 19 + TypeScript + Vite (frontend), Express + tsx (backend)
- **Single-process server**: `server.ts` runs an Express API and mounts Vite as middleware in dev (or serves the `dist/` build in production). Both the frontend and backend share **port 5000**.
- **Auth**: Clerk (`@clerk/clerk-react` on the frontend, `@clerk/backend` for token verification)
- **Database**: Firebase Firestore (via `firebase-admin` on the server, `firebase` on the client for the InviteManager component)
- **AI**: `@google/genai` (Gemini) for the SmartAdd feature
- **Email invites**: Agentmail.to

## Replit Setup

- Workflow `Start application` runs `npm run dev` and waits for port 5000 (webview).
- `vite.config.ts` and `server.ts` both set `host: 0.0.0.0` and `allowedHosts: true` so the Replit iframe proxy can reach the dev server.
- HMR is configured via `clientPort: 443` for the HTTPS proxy.
- `firebase-applet-config.json` is gitignored; a placeholder file is committed locally so the client `firebase.ts` import does not fail. The client SDK is initialized only when `apiKey` is non-empty.
- Production deployment: autoscale, build = `npm run build`, run = `npm run start` (which runs `tsx server.ts` with `NODE_ENV=production` and serves `dist/`).

## Required Secrets (set via Replit Secrets)

- `VITE_CLERK_PUBLISHABLE_KEY` – Clerk frontend publishable key
- `CLERK_SECRET_KEY` – Clerk backend secret for token verification
- `GEMINI_API_KEY` – Google Gemini API key (also exposed as `process.env.API_KEY` in the client bundle)
- `AGENTMAIL_API_KEY` – Agentmail.to API key for sending invites

To use the Firestore-backed features, also fill in `firebase-applet-config.json` with real Firebase project values and provision Firebase Admin credentials in the environment.

## Project Layout

- `index.html`, `index.tsx` – Vite entry; renders a Clerk configuration screen if no publishable key is set.
- `App.tsx` – Main UI shell, sidebar nav, error boundary, tree state.
- `components/` – TreeVisualizer, EditorPanel, SmartAdd, LoginScreen, InviteManager.
- `services/` – storageService (talks to the Express `/api/tree/*` endpoints), geminiService, gedcomService, authService.
- `server.ts` – Express API: `/api/invite`, `/api/tree/load`, `/api/tree/save-person`, `/api/tree/delete-person/:id`, `/api/tree/save-meta`, plus Vite middleware.
- `firebase.ts` – Client-side Firebase init (guarded against missing config).
- `firestore.rules` – Firestore security rules to apply in the Firebase console.
