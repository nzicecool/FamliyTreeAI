# FamilyTreeAI — GitHub Pages site

This folder contains the static project website for FamilyTreeAI, served at https://nzicecool.github.io/FamliyTreeAI/. It describes the current development feature set and links to the hosted app at https://familytree.lk.

GitHub Pages does **not** run the Express API, Clerk-backed family workspaces, or PostgreSQL. Updating this page does not republish the app.

## Files to push

- `docs/index.html` — refreshed copy, actual application screenshots, Public Beta branding, feature descriptions, FAQ, and environment guide.
- `docs/assets/family-access.jpg` — development Family & access screenshot using synthetic test data.
- `docs/assets/sign-up.jpg` — current development sign-up screenshot including first-visit cookie consent.
- `docs/assets/favicon.svg` — same family-tree favicon as the app.
- `docs/README.md` — these instructions.
- Root `README.md` — current setup guide, replacing obsolete Firebase instructions and the old externally hosted screenshot.

Keep the `assets/` folder beside `index.html`. Paths are relative so the page works under the `/FamliyTreeAI/` GitHub project path.

## Deploy

1. Commit and push the files above to your repo's `main` branch (or whichever branch you publish from).
2. In GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main` and folder `/docs`
4. Click **Save** if changing the configuration. If already configured, pushing is enough to trigger a Pages update.
5. Wait for the repository's Pages deployment to succeed, then open the site and refresh. No app credentials or API keys belong in these files.

## Preview locally

From the repository root, run:

```bash
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`. This serves only static documentation and does not need the app's database or Clerk keys.

## Maintaining screenshots and claims

Use only synthetic demonstration families or public screens, never private family information, invite tokens, email addresses, or credentials. Screenshots are labelled as development captures; the sign-up image intentionally shows the real cookie consent dialog.

The Family & access capture illustrates privacy and invitation controls, not an approved active connection. Voice memories are documented with the private-storage prerequisite and pending hosted upload verification; do not present them as verified live until that setup is complete. Do not imply family links merge trees or grant cross-family record access.

The page retains its existing Tailwind CDN and Google Fonts dependencies, so an internet connection is required for the intended styling. There is no npm build step for GitHub Pages.
