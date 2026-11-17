---
name: Clerk testing redirect origin
description: Historical Clerk testing origin mismatch and how to avoid false authentication results.
---

The programmatic Clerk testing helper previously returned to the development host's default HTTPS origin rather than the explicit `:5000` preview origin. A successful helper URL generation is not proof that the app received a session.

**Why:** Earlier testing was blocked because the default origin returned 404, while the explicit-port app responded. The helper's Clerk-hosted ticket URL did not contain an editable app redirect target. After correcting public port routing on 2026-11-17, the standard origin returned 200 and the protected API returned 401 as expected; the old origin mismatch should not be assumed to persist.

**How to apply:** Use the current standard preview URL, not the historical explicit-port link. Confirm the helper actually establishes an app session before claiming authenticated coverage. Do not alter Clerk ticket URLs speculatively or add an authentication bypass.
