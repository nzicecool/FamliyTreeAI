---
name: Development Google sign-in
description: Clerk dashboard configuration for development Google OAuth.
---

Google SSO is enabled in the Clerk development environment.

**Why:** The user confirmed enabling it; a browser readiness check reached Google's sign-in page. This external dashboard setting is not represented in the code.

**How to apply:** Test development Google login in a separate browser tab. Reaching Google confirms initiation only, not successful sign-in or callback completion.

The user encountered a Google-side 403 after the initiation check and confirmed it occurred in a separate browser tab, not only in the embedded preview. On 2026-11-10, after the login flow update, the user confirmed: "Actually the issue is now resolved". No specific Google-side root cause was established.

The user confirmed Google sign-in succeeds through Clerk's development Account Portal.

**Why:** This verifies the provider connection works through the portal, but not the app-initiated flow or its return URL.

**How to apply:** Treat the reported issue as resolved; do not reopen it without new evidence. For future regressions, investigate the app flow and session return before recommending changes to Google credentials or consent settings.
