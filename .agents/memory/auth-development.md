---
name: Development Google sign-in
description: Clerk dashboard configuration for development Google OAuth.
---

Google SSO is enabled in the Clerk development environment.

**Why:** The user confirmed enabling it; a browser readiness check reached Google's sign-in page. This external dashboard setting is not represented in the code.

**How to apply:** Test development Google login in a separate browser tab. Reaching Google confirms initiation only, not successful sign-in or callback completion.

The user subsequently encountered a Google-side 403 after the initiation check and confirmed it occurred in a separate browser tab, not only in the embedded preview. Do not describe Google sign-in as fixed without confirming the full return to an authenticated app session.
