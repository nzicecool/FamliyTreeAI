# FamilyTreeAI — GitHub Pages site

This folder contains the static landing page for FamilyTreeAI, designed to be served from GitHub Pages so anyone can read about the project and follow the self-host guide.

## Deploy

1. Push this folder to your repo's `main` branch (or whichever branch you publish from).
2. In GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main` and folder `/docs`
4. Click **Save**. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute.

## Customize

Open `docs/index.html` and find/replace the placeholder `YOUR_GITHUB/familytreeai` with your actual repo path (e.g. `nzicecool/familytreeai`). All GitHub links in the page use that placeholder.

That's it — no build step, no dependencies, just one HTML file.
